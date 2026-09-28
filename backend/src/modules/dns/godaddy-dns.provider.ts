import { Injectable, Logger } from '@nestjs/common';
import { DnsDomainInfo, DnsProvider, DnsProviderError, DnsRecord, DnsRecordValue } from './dns-provider';

const REQUEST_TIMEOUT_MS = 15_000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * GoDaddy Domains API v1. Configured by GODADDY_API_KEY and GODADDY_API_SECRET;
 * GODADDY_API_URL can point at GoDaddy's test environment
 * (https://api.ote-godaddy.com). The key and secret are sent only in the
 * Authorization header to that URL and never appear in errors or logs.
 */
@Injectable()
export class GoDaddyDnsProvider implements DnsProvider {
  readonly name = 'GoDaddy';
  private readonly logger = new Logger(GoDaddyDnsProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.GODADDY_API_KEY?.trim() && process.env.GODADDY_API_SECRET?.trim());
  }

  async getDomain(domain: string): Promise<DnsDomainInfo> {
    const body = asRecord(await this.request('GET', `/v1/domains/${encodeURIComponent(domain)}`));
    return {
      domain,
      status: typeof body.status === 'string' ? body.status : null,
      expiresAt: typeof body.expires === 'string' ? body.expires : null,
      nameServers: Array.isArray(body.nameServers) ? body.nameServers.filter((n): n is string => typeof n === 'string') : [],
    };
  }

  async listRecords(domain: string): Promise<DnsRecord[]> {
    const body = await this.request('GET', `/v1/domains/${encodeURIComponent(domain)}/records`);
    return (Array.isArray(body) ? body : []).map((raw) => {
      const record = asRecord(raw);
      return {
        type: String(record.type ?? ''),
        name: String(record.name ?? ''),
        data: String(record.data ?? ''),
        ttl: typeof record.ttl === 'number' ? record.ttl : 0,
        priority: typeof record.priority === 'number' ? record.priority : null,
      };
    });
  }

  async addRecords(domain: string, records: DnsRecord[]): Promise<void> {
    await this.request('PATCH', `/v1/domains/${encodeURIComponent(domain)}/records`, records.map(toGoDaddy));
  }

  async replaceRecords(domain: string, type: string, name: string, values: DnsRecordValue[]): Promise<void> {
    await this.request(
      'PUT',
      `/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,
      values.map((value) => toGoDaddy({ type, name, ...value })).map(({ type: _type, name: _name, ...rest }) => rest),
    );
  }

  async deleteRecords(domain: string, type: string, name: string): Promise<void> {
    await this.request('DELETE', `/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const key = process.env.GODADDY_API_KEY?.trim();
    const secret = process.env.GODADDY_API_SECRET?.trim();
    if (!key || !secret) {
      throw new DnsProviderError('GoDaddy is not configured on the server (GODADDY_API_KEY and GODADDY_API_SECRET).', 'NOT_CONFIGURED');
    }
    const baseUrl = (process.env.GODADDY_API_URL?.trim() || 'https://api.godaddy.com').replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `sso-key ${key}:${secret}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'could not connect';
      this.logger.warn(`GoDaddy request failed method=${method} reason=${reason}`);
      throw new DnsProviderError(`GoDaddy could not be reached (${reason}). Try again shortly.`, 'UNAVAILABLE');
    }

    if (response.ok) {
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const payload = asRecord(await response.json().catch(() => null));
    this.logger.warn(`GoDaddy request refused method=${method} status=${response.status} code=${String(payload.code ?? 'none')}`);
    if (response.status === 401 || response.status === 403) {
      throw new DnsProviderError(
        'GoDaddy refused the request: the API key and secret are wrong, or this GoDaddy account is not allowed to use the DNS API.',
        'AUTH',
      );
    }
    if (response.status === 404) throw new DnsProviderError('GoDaddy has no such domain or record in this account.', 'NOT_FOUND');
    if (response.status === 429) throw new DnsProviderError('GoDaddy is rate-limiting requests. Wait a minute and try again.', 'RATE_LIMITED');
    if (response.status === 400 || response.status === 409 || response.status === 422) {
      throw new DnsProviderError(`GoDaddy rejected the change: ${validationMessage(payload)}`, 'INVALID');
    }
    throw new DnsProviderError(`GoDaddy answered with an error (HTTP ${response.status}). Try again shortly.`, 'UNAVAILABLE');
  }
}

function toGoDaddy(record: DnsRecord) {
  return {
    type: record.type,
    name: record.name,
    data: record.data,
    ttl: record.ttl,
    ...(record.priority === null || record.priority === undefined ? {} : { priority: record.priority }),
  };
}

/** GoDaddy's own description of an invalid request: a message plus per-field messages. */
function validationMessage(payload: Record<string, unknown>): string {
  const fields = Array.isArray(payload.fields)
    ? payload.fields.map((f) => asRecord(f).message).filter((m): m is string => typeof m === 'string')
    : [];
  const message = typeof payload.message === 'string' ? payload.message : 'the request was invalid.';
  return [message, ...fields].join(' ').slice(0, 400);
}
