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

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: buildBasicAuthHeader(config.username, config.password),
        Accept: 'application/json, text/plain',
      },
    });
  } catch (networkErr: any) {
    throw buildCosecError(
      `COSEC network error: ${networkErr?.message ?? 'Cannot reach COSEC server'}`,
    );
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
