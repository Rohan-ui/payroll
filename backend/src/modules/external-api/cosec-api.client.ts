/**
 * COSEC Web API Raw HTTP Client
 *
 * Handles HTTP Basic Authentication and the COSEC semicolon query-string
 * convention:  ?action=get;range=all;format=json
 *
 * Never called directly from controllers — use ExternalApiService.
 */

export interface CosecApiConfig {
  baseUrl: string;    // e.g. "http://192.168.1.1/cosec"
  username: string;
  password: string;
}

export interface CosecApiError extends Error {
  cosecCode?: string;
  httpStatus?: number;
}

function buildCosecError(message: string, httpStatus?: number, cosecCode?: string): CosecApiError {
  const err = new Error(message) as CosecApiError;
  err.name = 'CosecApiError';
  err.httpStatus = httpStatus;
  err.cosecCode = cosecCode;
  return err;
}

/**
 * Build a COSEC API URL from the base URL, request-type, and key-value params.
 * COSEC uses semicolons as separators:
 *   http://<server>/api.svc/v2/<requestType>?<k>=<v>;<k>=<v>;...
 */
function buildCosecUrl(
  baseUrl: string,
  requestType: string,
  params: Record<string, string>,
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const queryParts = Object.entries(params)
    .map(([k, v]) => {
      // COSEC expects raw commas for field-name and raw dashes for date-range
      const val = encodeURIComponent(v).replace(/%2C/gi, ',');
      return `${encodeURIComponent(k)}=${val}`;
    })
    .join(';');
  return `${normalizedBase}/api.svc/v2/${requestType}?${queryParts}`;
}

/** How long one COSEC call may take before it is given up, so a hung server can't stall a sync. */
export const COSEC_TIMEOUT_MS = 30_000;
/** Waits before trying again after a connection failure that may be momentary. */
export const COSEC_RETRY_DELAYS_MS = [1_000, 2_000];
/** Connection failures worth one more try: refused, reset or dropped connections. Not a wrong address or certificate. */
const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'EAI_AGAIN']);

/**
 * Why a COSEC server could not be reached, in words an administrator can act on.
 * fetch reports every connection failure as "fetch failed"; the reason is on
 * its cause (a socket error code). Names the server (host and port), never the credentials.
 */
export function networkProblem(url: string, error: unknown): string {
  let where = 'the COSEC server';
  try {
    const u = new URL(url);
    where = `the COSEC server at ${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`;
  } catch {
    // Keep the generic name.
  }
  const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'ECONNREFUSED':
      return `COSEC network error: ${where} refused the connection. Check that COSEC is running and that the address and port in the COSEC settings are right.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `COSEC network error: the name in ${where.replace('the COSEC server at ', '')} could not be found. Check the address in the COSEC settings.`;
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return `COSEC network error: ${where} did not respond. It may not be reachable from this server's network (firewall, VPN or a private address).`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `COSEC network error: ${where} is not reachable from this server's network. A private address (such as 192.168.x.x) only works from the same network.`;
    case 'ECONNRESET':
      return `COSEC network error: ${where} closed the connection. Check that the address uses the right protocol (http or https) and port.`;
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `COSEC network error: the HTTPS certificate of ${where} is not trusted (${code}). Use a trusted certificate, or the http address if COSEC is on a private network.`;
    default:
      return `COSEC network error: ${where} could not be reached (${code || cause?.message || (error as Error | null)?.message || 'unknown reason'}).`;
  }
}

function buildBasicAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Execute a GET request to the COSEC API and return parsed JSON.
 * We always request format=json for consistent parsing.
 */
export async function cosecGet<T = unknown>(
  config: CosecApiConfig,
  requestType: string,
  params: Omit<Record<string, string>, 'format'>,
): Promise<T> {
  const url = buildCosecUrl(config.baseUrl, requestType, {
    ...params,
    format: 'json',
  });

  let response!: Response;
  // A connection refused or dropped can be a moment's blip: tried again after 1 s, then 2 s.
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: buildBasicAuthHeader(config.username, config.password),
          Accept: 'application/json, text/plain',
        },
        signal: AbortSignal.timeout(COSEC_TIMEOUT_MS),
      });
      break;
    } catch (networkErr: any) {
      if (networkErr?.name === 'TimeoutError') {
        throw buildCosecError(`COSEC server did not answer within ${COSEC_TIMEOUT_MS / 1000} seconds`);
      }
      const code = networkErr?.cause?.code ?? '';
      if (attempt < COSEC_RETRY_DELAYS_MS.length && TRANSIENT_CODES.has(code)) {
        await new Promise((resolve) => setTimeout(resolve, COSEC_RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw buildCosecError(networkProblem(url, networkErr));
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw buildCosecError(
      'COSEC authentication failed: Invalid username or password',
      response.status,
    );
  }

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch {}
    throw buildCosecError(
      `COSEC server returned HTTP ${response.status}: ${body.slice(0, 200)}`,
      response.status,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await response.json() as T;
    // COSEC returns {"response": "failed: ..."} on logical errors even with 200
    if (
      json &&
      typeof json === 'object' &&
      'response' in (json as any) &&
      typeof (json as any).response === 'string' &&
      (json as any).response.startsWith('failed:')
    ) {
      const msg = (json as any).response as string;
      const codeMatch = msg.match(/(\d{10})/);
      throw buildCosecError(`COSEC error: ${msg}`, 200, codeMatch?.[1]);
    }
    return json;
  }

  // Fallback: parse text format (pipe-delimited) — should not happen when format=json
  const text = await response.text();
  if (text.startsWith('failed:')) {
    const codeMatch = text.match(/(\d{10})/);
    throw buildCosecError(`COSEC error: ${text}`, 200, codeMatch?.[1]);
  }
  // Return raw text as unknown — caller handles it
  return text as unknown as T;
}

/**
 * Quick connectivity + auth check.
 * Hits the /user endpoint with range=all.
 */
export async function cosecTestConnection(config: CosecApiConfig): Promise<{ ok: boolean; message: string }> {
  try {
    await cosecGet(config, 'user', { action: 'get', range: 'all' });
    return { ok: true, message: 'Connection successful' };
  } catch (err: any) {
    // If COSEC responded with HTTP 200, authentication succeeded even if query had no results
    if (err?.httpStatus === 200) {
      return { ok: true, message: 'Connection successful' };
    }
    return { ok: false, message: err?.message ?? 'Connection failed' };
  }
}
