import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { DNS_PROVIDER, DnsProvider, DnsProviderError, DnsRecord, DnsRecordValue } from '@/modules/dns/dns-provider';

/**
 * Platform DNS from HQ, against an in-memory provider standing in for GoDaddy:
 * reading the zone, creating, replacing and deleting records, the wildcard,
 * verification, provider failures, audit, and access.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const SERVER_IP = '203.0.113.10';
const PASSWORD = 'Platform-Dns-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

class FakeDnsProvider implements DnsProvider {
  readonly name = 'GoDaddy';
  configured = true;
  failWith: DnsProviderError | null = null;
  records: DnsRecord[] = [
    { type: 'A', name: '@', data: SERVER_IP, ttl: 600, priority: null },
    { type: 'NS', name: '@', data: 'ns13.domaincontrol.com', ttl: 3600, priority: null },
    { type: 'MX', name: '@', data: 'mx.zoho.in', ttl: 3600, priority: 10 },
  ];

  isConfigured() {
    return this.configured;
  }
  private guard() {
    if (this.failWith) throw this.failWith;
  }
  async getDomain(domain: string) {
    this.guard();
    return { domain, status: 'ACTIVE', expiresAt: '2027-07-27T00:00:00.000Z', nameServers: ['ns13.domaincontrol.com', 'ns14.domaincontrol.com'] };
  }
  async listRecords() {
    this.guard();
    return this.records.map((r) => ({ ...r }));
  }
  async addRecords(_domain: string, records: DnsRecord[]) {
    this.guard();
    this.records.push(...records);
  }
  async replaceRecords(_domain: string, type: string, name: string, values: DnsRecordValue[]) {
    this.guard();
    this.records = this.records.filter((r) => !(r.type === type && r.name === name)).concat(values.map((v) => ({ type, name, ...v })));
  }
  async deleteRecords(_domain: string, type: string, name: string) {
    this.guard();
    this.records = this.records.filter((r) => !(r.type === type && r.name === name));
  }
}

describe('Platform DNS', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const provider = new FakeDnsProvider();
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, ips: process.env.PLATFORM_PUBLIC_IPS };
  let previousState: { setting_value: unknown } | null = null;
  const adminIds: string[] = [];
  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  const api = () => request(app.getHttpServer());
  const asPlatform = () => ({ Authorization: `Bearer ${token}` });
  const lastLog = (action: string) =>
    prisma.rndtechnosoft_platform_activity_logs.findFirst({ where: { super_admin_id: adminIds[0], action }, orderBy: { created_at: 'desc' } });

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    process.env.PLATFORM_PUBLIC_IPS = SERVER_IP;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DNS_PROVIDER).useValue(provider).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});
    previousState = await prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: 'platform_dns_state' }, select: { setting_value: true } });

    const adminId = randomUUID();
    const email = `dns-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: adminId,
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: 'DNS suite',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
    adminIds.push(adminId);
    token = (await api().post(`${API}/super-admin/auth/login`).send({ email, password: PASSWORD })).body.data.token;
  });

  afterEach(() => {
    provider.failWith = null;
    provider.configured = true;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      await prisma.rndtechnosoft_platform_settings.deleteMany({ where: { setting_key: 'platform_dns_state' } });
      if (previousState) {
        await prisma.rndtechnosoft_platform_settings.create({
          data: { id: randomUUID(), setting_category: 'DNS', setting_key: 'platform_dns_state', setting_value: previousState.setting_value as object },
        });
      }
    }
    for (const [key, value] of [
      ['PLATFORM_BASE_DOMAIN', previous.base],
      ['PLATFORM_PUBLIC_IPS', previous.ips],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await app?.close();
  });

  it('shows the domain, provider and expected address', async () => {
    const overview = await api().get(`${API}/super-admin/dns`).set(asPlatform());
    expect(overview.status).toBe(200);
    expect(overview.body.data).toMatchObject({
      domain: BASE,
      provider: 'GoDaddy',
      providerConfigured: true,
      reachable: true,
      domainStatus: 'ACTIVE',
      nameServers: ['ns13.domaincontrol.com', 'ns14.domaincontrol.com'],
      expectedAddresses: [SERVER_IP],
      error: null,
    });
  });

  it('reads the zone now, marks what HQ may edit, and records the sync', async () => {
    const records = await api().get(`${API}/super-admin/dns/records`).set(asPlatform());
    expect(records.status).toBe(200);
    expect(records.body.data.records.map((r: { type: string; editable: boolean }) => [r.type, r.editable])).toEqual([
      ['A', true],
      ['MX', true],
      ['NS', false],
    ]);
    const overview = await api().get(`${API}/super-admin/dns`).set(asPlatform());
    expect(overview.body.data.lastSyncedAt).not.toBeNull();
  });

  it('creates a record, and refuses duplicates, conflicts and invalid values', async () => {
    const create = (body: Record<string, unknown>) => api().post(`${API}/super-admin/dns/records`).set(asPlatform()).send(body);
    const created = await create({ type: 'A', name: 'status', data: '203.0.113.20', ttl: 600 });
    expect(created.status).toBe(201);
    expect(provider.records).toContainEqual({ type: 'A', name: 'status', data: '203.0.113.20', ttl: 600, priority: null });
    expect((await lastLog('DNS_RECORD_CREATED'))?.metadata).toMatchObject({ record: { type: 'A', name: 'status', data: '203.0.113.20' } });

    const refused: [string, Record<string, unknown>][] = [
      ['duplicate', { type: 'A', name: 'status', data: '203.0.113.20', ttl: 600 }],
      ['CNAME next to other records', { type: 'CNAME', name: 'status', data: 'example.com', ttl: 600 }],
      ['CNAME at the domain itself', { type: 'CNAME', name: '@', data: 'example.com', ttl: 600 }],
      ['A without an IPv4 address', { type: 'A', name: 'bad', data: 'example.com', ttl: 600 }],
      ['AAAA without an IPv6 address', { type: 'AAAA', name: 'bad', data: '203.0.113.1', ttl: 600 }],
      ['MX without priority', { type: 'MX', name: 'bad', data: 'mx.example.com', ttl: 600 }],
      ['TTL below the provider minimum', { type: 'TXT', name: 'bad', data: 'v=1', ttl: 300 }],
      ['NS is not managed from HQ', { type: 'NS', name: 'bad', data: 'ns1.example.com', ttl: 600 }],
      ['invalid name', { type: 'TXT', name: 'bad name!', data: 'v=1', ttl: 600 }],
    ];
    for (const [label, body] of refused) {
      expect([label, (await create(body)).status]).toEqual([label, 400]);
    }
  });

  it('replaces the values of a record and logs before and after', async () => {
    const updated = await api()
      .put(`${API}/super-admin/dns/records/A/status`)
      .set(asPlatform())
      .send({ values: [{ data: '203.0.113.21', ttl: 1200 }, { data: '203.0.113.22', ttl: 1200 }] });
    expect(updated.status).toBe(200);
    expect(provider.records.filter((r) => r.name === 'status').map((r) => r.data)).toEqual(['203.0.113.21', '203.0.113.22']);
    expect((await lastLog('DNS_RECORD_UPDATED'))?.metadata).toMatchObject({
      before: [{ data: '203.0.113.20' }],
      after: [{ data: '203.0.113.21' }, { data: '203.0.113.22' }],
    });

    expect((await api().put(`${API}/super-admin/dns/records/A/missing`).set(asPlatform()).send({ values: [{ data: '203.0.113.1', ttl: 600 }] })).status).toBe(404);
    expect((await api().put(`${API}/super-admin/dns/records/A/status`).set(asPlatform()).send({ values: [] })).status).toBe(400);
    expect((await api().put(`${API}/super-admin/dns/records/NS/@`).set(asPlatform()).send({ values: [{ data: 'ns.example.com', ttl: 600 }] })).status).toBe(400);
  });

  it('deletes a record and logs what was removed', async () => {
    const deleted = await api().delete(`${API}/super-admin/dns/records/A/status`).set(asPlatform());
    expect(deleted.status).toBe(200);
    expect(provider.records.some((r) => r.name === 'status')).toBe(false);
    expect((await lastLog('DNS_RECORD_DELETED'))?.metadata).toMatchObject({ deleted: [{ data: '203.0.113.21' }, { data: '203.0.113.22' }] });
    expect((await api().delete(`${API}/super-admin/dns/records/A/status`).set(asPlatform())).status).toBe(404);
    expect((await api().delete(`${API}/super-admin/dns/records/NS/@`).set(asPlatform())).status).toBe(400);
  });

  it('points the wildcard at the platform address', async () => {
    const wildcard = await api().put(`${API}/super-admin/dns/wildcard`).set(asPlatform());
    expect(wildcard.status).toBe(200);
    expect(provider.records.filter((r) => r.name === '*')).toEqual([{ type: 'A', name: '*', data: SERVER_IP, ttl: 600 }]);
    expect(await lastLog('DNS_WILDCARD_CONFIGURED')).not.toBeNull();
  });

  it('verifies against the zone and public DNS, and only says Verified when every check passed', async () => {
    const verify = await api().post(`${API}/super-admin/dns/verify`).set(asPlatform());
    expect(verify.status).toBe(200);
    const checks = verify.body.data.checks as { check: string; verified: boolean }[];
    expect(checks.filter((c) => c.check.endsWith('in GoDaddy')).map((c) => c.verified)).toEqual([true, true]);
    // voogyo.test does not exist in public DNS.
    expect(checks.filter((c) => c.check.includes('public DNS')).map((c) => c.verified)).toEqual([false, false]);
    expect(verify.body.data.verified).toBe(false);

    const overview = await api().get(`${API}/super-admin/dns`).set(asPlatform());
    expect(overview.body.data.lastVerification).toMatchObject({ verified: false });
    expect(await lastLog('DNS_VERIFICATION_FAILED')).not.toBeNull();
  });

  it('reports provider failures with their safe reason and changes nothing', async () => {
    const before = JSON.stringify(provider.records);
    provider.failWith = new DnsProviderError('GoDaddy refused the request: the API key and secret are wrong.', 'AUTH');
    const records = await api().get(`${API}/super-admin/dns/records`).set(asPlatform());
    expect(records.status).toBe(502);
    expect(records.body.message).toMatch(/GoDaddy refused the request/);
    const created = await api().post(`${API}/super-admin/dns/records`).set(asPlatform()).send({ type: 'TXT', name: 'x', data: 'v=1', ttl: 600 });
    expect(created.status).toBe(502);
    expect(JSON.stringify(provider.records)).toBe(before);

    const overview = await api().get(`${API}/super-admin/dns`).set(asPlatform());
    expect(overview.body.data).toMatchObject({ reachable: false, error: expect.stringMatching(/GoDaddy refused/), lastSyncError: expect.stringMatching(/GoDaddy refused/) });

    provider.failWith = null;
    provider.configured = false;
    const unconfigured = await api().get(`${API}/super-admin/dns/records`).set(asPlatform());
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body.message).toBe('GoDaddy is not configured on the server.');
  });

  it('keeps every DNS route away from anonymous callers and workspace sessions', async () => {
    const email = `dns-owner-${SUFFIX}@dns.test`;
    userEmails.push(email);
    const registered = await api()
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `DNS Owner ${SUFFIX}`, tenantCode: `DNS${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(registered.status).toBe(201);
    tenantIds.push(registered.body.activeTenant.tenantId);
    const tenantToken = registered.body.token;

    const routes: [string, string][] = [
      ['get', '/super-admin/dns'],
      ['get', '/super-admin/dns/records'],
      ['post', '/super-admin/dns/records'],
      ['put', '/super-admin/dns/records/A/app'],
      ['delete', '/super-admin/dns/records/A/app'],
      ['put', '/super-admin/dns/wildcard'],
      ['post', '/super-admin/dns/verify'],
    ];
    const before = JSON.stringify(provider.records);
    for (const [method, path] of routes) {
      const call = (api() as unknown as Record<string, (url: string) => request.Test>)[method];
      const anonymous = await call(`${API}${path}`);
      const workspace = await (api() as unknown as Record<string, (url: string) => request.Test>)[method](`${API}${path}`).set('Authorization', `Bearer ${tenantToken}`);
      expect([path, anonymous.status, workspace.status]).toEqual([path, 401, 401]);
    }
    expect(JSON.stringify(provider.records)).toBe(before);
  });
});
