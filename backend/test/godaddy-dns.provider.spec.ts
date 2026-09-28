import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { GoDaddyDnsProvider } from '@/modules/dns/godaddy-dns.provider';
import { DnsProviderError } from '@/modules/dns/dns-provider';

/**
 * The GoDaddy provider against a local HTTP server standing in for
 * api.godaddy.com: request shapes, the credential header, and error mapping.
 * Nothing here reaches GoDaddy.
 */

const KEY = 'test-godaddy-key';
const SECRET = 'test-godaddy-secret';

interface Seen {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
}

describe('GoDaddy DNS provider', () => {
  let server: Server;
  let baseUrl: string;
  const seen: Seen[] = [];
  let respond: (req: Seen) => { status: number; body?: unknown } = () => ({ status: 200, body: [] });
  const previous = { key: process.env.GODADDY_API_KEY, secret: process.env.GODADDY_API_SECRET, url: process.env.GODADDY_API_URL };
  const provider = new GoDaddyDnsProvider();

  const readBody = (req: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => resolve(raw ? JSON.parse(raw) : undefined));
    });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const entry: Seen = { method: req.method ?? '', path: req.url ?? '', authorization: req.headers.authorization, body: await readBody(req) };
      seen.push(entry);
      const { status, body } = respond(entry);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    process.env.GODADDY_API_KEY = KEY;
    process.env.GODADDY_API_SECRET = SECRET;
    process.env.GODADDY_API_URL = baseUrl;
    seen.length = 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of [
      ['GODADDY_API_KEY', previous.key],
      ['GODADDY_API_SECRET', previous.secret],
      ['GODADDY_API_URL', previous.url],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const failure = async (operation: Promise<unknown>) => {
    try {
      await operation;
    } catch (error) {
      return error as DnsProviderError;
    }
    throw new Error('expected the call to fail');
  };

  it('makes no request and says so when credentials are missing', async () => {
    delete process.env.GODADDY_API_SECRET;
    expect(provider.isConfigured()).toBe(false);
    const error = await failure(provider.listRecords('voogyo.com'));
    expect(error).toMatchObject({ kind: 'NOT_CONFIGURED' });
    expect(seen).toHaveLength(0);
  });

  it('reads the domain and its records with the sso-key header', async () => {
    respond = (req) =>
      req.path.endsWith('/records')
        ? { status: 200, body: [{ type: 'MX', name: '@', data: 'mx.zoho.in', ttl: 3600, priority: 10 }] }
        : { status: 200, body: { domain: 'voogyo.com', status: 'ACTIVE', expires: '2027-07-27T00:00:00.000Z', nameServers: ['ns13.domaincontrol.com'] } };

    expect(await provider.getDomain('voogyo.com')).toEqual({
      domain: 'voogyo.com',
      status: 'ACTIVE',
      expiresAt: '2027-07-27T00:00:00.000Z',
      nameServers: ['ns13.domaincontrol.com'],
    });
    expect(await provider.listRecords('voogyo.com')).toEqual([{ type: 'MX', name: '@', data: 'mx.zoho.in', ttl: 3600, priority: 10 }]);
    expect(seen.map((s) => [s.method, s.path, s.authorization])).toEqual([
      ['GET', '/v1/domains/voogyo.com', `sso-key ${KEY}:${SECRET}`],
      ['GET', '/v1/domains/voogyo.com/records', `sso-key ${KEY}:${SECRET}`],
    ]);
  });

  it('adds, replaces and deletes records with the documented requests', async () => {
    respond = () => ({ status: 200 });
    await provider.addRecords('voogyo.com', [
      { type: 'A', name: 'status', data: '203.0.113.20', ttl: 600, priority: null },
      { type: 'MX', name: '@', data: 'mx2.zoho.in', ttl: 3600, priority: 20 },
    ]);
    await provider.replaceRecords('voogyo.com', 'A', '*', [{ data: '203.0.113.10', ttl: 600 }]);
    await provider.deleteRecords('voogyo.com', 'TXT', '_dmarc');

    expect(seen.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'PATCH',
        path: '/v1/domains/voogyo.com/records',
        body: [
          { type: 'A', name: 'status', data: '203.0.113.20', ttl: 600 },
          { type: 'MX', name: '@', data: 'mx2.zoho.in', ttl: 3600, priority: 20 },
        ],
      },
      { method: 'PUT', path: '/v1/domains/voogyo.com/records/A/*', body: [{ data: '203.0.113.10', ttl: 600 }] },
      { method: 'DELETE', path: '/v1/domains/voogyo.com/records/TXT/_dmarc', body: undefined },
    ]);
  });

  it('maps GoDaddy errors to safe messages that never contain the credentials', async () => {
    const cases: [number, unknown, string][] = [
      [401, { code: 'UNABLE_TO_AUTHENTICATE', message: `Bad key ${KEY}` }, 'AUTH'],
      [403, { code: 'ACCESS_DENIED' }, 'AUTH'],
      [404, { code: 'UNKNOWN_DOMAIN' }, 'NOT_FOUND'],
      [422, { code: 'INVALID_BODY', message: 'Request body does not fulfill schema', fields: [{ message: 'ttl must be at least 600' }] }, 'INVALID'],
      [429, { code: 'TOO_MANY_REQUESTS' }, 'RATE_LIMITED'],
      [500, { code: 'INTERNAL_SERVER_ERROR' }, 'UNAVAILABLE'],
    ];
    for (const [status, body, kind] of cases) {
      respond = () => ({ status, body });
      const error = await failure(provider.listRecords('voogyo.com'));
      expect([status, error.kind]).toEqual([status, kind]);
      expect(error.message).not.toContain(KEY);
      expect(error.message).not.toContain(SECRET);
    }

    respond = () => ({ status: 422, body: cases[3][1] });
    const invalid = await failure(provider.listRecords('voogyo.com'));
    expect(invalid.message).toBe('GoDaddy rejected the change: Request body does not fulfill schema ttl must be at least 600');
  });

  it('reports an unreachable API without detail', async () => {
    process.env.GODADDY_API_URL = 'http://127.0.0.1:1';
    const error = await failure(provider.listRecords('voogyo.com'));
    expect(error).toMatchObject({ kind: 'UNAVAILABLE', message: 'GoDaddy could not be reached (could not connect). Try again shortly.' });
  });
});
