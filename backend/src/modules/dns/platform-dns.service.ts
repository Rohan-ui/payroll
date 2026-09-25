import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { resolve4, resolve6 } from 'dns/promises';
import { isIP } from 'net';
import { PrismaService } from '@/prisma/prisma.service';
import { platformBaseDomain } from '@/modules/tenancy/tenant-domains.service';
import { PlatformActor } from '@/modules/email/email.service';
import { DNS_PROVIDER, DnsProvider, DnsProviderError, DnsRecord, DnsRecordValue } from './dns-provider';
import { CreateDnsRecordDto, DnsRecordValueDto, EDITABLE_RECORD_TYPES, EditableRecordType } from './dto/dns-record.dto';

const STATE_KEY = 'platform_dns_state';
/** GoDaddy's minimum; short so a changed server address takes effect quickly. */
const MIN_WILDCARD_TTL = 600;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.?$/i;

export interface VerificationCheck {
  check: string;
  verified: boolean;
  detail: string;
}

interface DnsState {
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastVerification: { at: string; verified: boolean; checks: VerificationCheck[] } | null;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The addresses the platform is served from (PLATFORM_PUBLIC_IPS), split by family. */
function expectedAddresses() {
  const all = (process.env.PLATFORM_PUBLIC_IPS ?? '').split(',').map((ip) => ip.trim()).filter(Boolean);
  return { v4: all.filter((ip) => isIP(ip) === 4), v6: all.filter((ip) => isIP(ip) === 6) };
}

/**
 * The platform's own DNS zone (PLATFORM_BASE_DOMAIN) at its DNS provider.
 *
 * Workspaces need no records of their own: one wildcard record sends every
 * <subdomain>.<domain> to the application, which resolves the workspace from
 * the host name. This service reads and changes the zone on request, verifies
 * the platform records, and records every change in the activity log.
 */
@Injectable()
export class PlatformDnsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DNS_PROVIDER) private readonly provider: DnsProvider,
  ) {}

  async overview() {
    const domain = platformBaseDomain();
    const state = await this.state();
    const expected = expectedAddresses();
    const base = {
      domain,
      provider: this.provider.name,
      providerConfigured: this.provider.isConfigured(),
      expectedAddresses: [...expected.v4, ...expected.v6],
      lastSyncedAt: state.lastSyncedAt,
      lastSyncError: state.lastSyncError,
      lastVerification: state.lastVerification,
    };
    if (!domain || !base.providerConfigured) {
      return { ...base, reachable: false, domainStatus: null, expiresAt: null, nameServers: [] as string[], error: this.setupProblem(domain) };
    }
    try {
      const info = await this.provider.getDomain(domain);
      return { ...base, reachable: true, domainStatus: info.status, expiresAt: info.expiresAt, nameServers: info.nameServers, error: null };
    } catch (error) {
      return { ...base, reachable: false, domainStatus: null, expiresAt: null, nameServers: [] as string[], error: this.message(error) };
    }
  }

  /** The zone's current records, read from the provider now. */
  async records() {
    const domain = this.requireReady();
    try {
      const records = await this.provider.listRecords(domain);
      await this.saveState({ lastSyncedAt: new Date().toISOString(), lastSyncError: null });
      return {
        domain,
        syncedAt: new Date().toISOString(),
        records: records
          .map((record) => ({ ...record, editable: (EDITABLE_RECORD_TYPES as readonly string[]).includes(record.type) }))
          .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.data.localeCompare(b.data)),
      };
    } catch (error) {
      await this.saveState({ lastSyncError: this.message(error) });
      throw this.httpError(error);
    }
  }

  async createRecord(input: CreateDnsRecordDto, actor: PlatformActor) {
    const domain = this.requireReady();
    const record = this.checkedRecord(input.type, input.name, input);
    const existing = await this.call(() => this.provider.listRecords(domain));
    const sameName = existing.filter((r) => r.name === record.name);
    if (sameName.some((r) => r.type === record.type && r.data === record.data)) {
      throw new BadRequestException('That record already exists.');
    }
    if (record.type === 'CNAME' ? sameName.length > 0 : sameName.some((r) => r.type === 'CNAME')) {
      throw new BadRequestException('A CNAME cannot share its name with any other record.');
    }
    await this.call(() => this.provider.addRecords(domain, [record]));
    await this.log(actor, 'DNS_RECORD_CREATED', `Created DNS record ${record.type} ${record.name}`, { record });
    return record;
  }

  /** Replaces every value of one record (type + name), as DNS providers store them. */
  async replaceRecords(type: EditableRecordType, name: string, values: DnsRecordValueDto[], actor: PlatformActor) {
    const domain = this.requireReady();
    const checked = values.map((value) => this.checkedRecord(type, name, value));
    const before = (await this.call(() => this.provider.listRecords(domain))).filter((r) => r.type === type && r.name === name);
    if (before.length === 0) throw new NotFoundException(`There is no ${type} record named ${name}.`);
    const next: DnsRecordValue[] = checked.map(({ data, ttl, priority }) => ({ data, ttl, priority }));
    await this.call(() => this.provider.replaceRecords(domain, type, name, next));
    await this.log(actor, 'DNS_RECORD_UPDATED', `Updated DNS record ${type} ${name}`, {
      type,
      name,
      before: before.map(({ data, ttl, priority }) => ({ data, ttl, priority })),
      after: next,
    });
    return { type, name, values: next };
  }

  async deleteRecords(type: EditableRecordType, name: string, actor: PlatformActor) {
    const domain = this.requireReady();
    const before = (await this.call(() => this.provider.listRecords(domain))).filter((r) => r.type === type && r.name === name);
    if (before.length === 0) throw new NotFoundException(`There is no ${type} record named ${name}.`);
    await this.call(() => this.provider.deleteRecords(domain, type, name));
    await this.log(actor, 'DNS_RECORD_DELETED', `Deleted DNS record ${type} ${name}`, {
      type,
      name,
      deleted: before.map(({ data, ttl, priority }) => ({ data, ttl, priority })),
    });
    return { type, name, deleted: before.length };
  }

  /** Points the wildcard (*) at PLATFORM_PUBLIC_IPS, so every workspace address reaches the application. */
  async configureWildcard(actor: PlatformActor) {
    const domain = this.requireReady();
    const expected = expectedAddresses();
    if (expected.v4.length === 0 && expected.v6.length === 0) {
      throw new BadRequestException('Set PLATFORM_PUBLIC_IPS on the server first: it is the address the wildcard should point to.');
    }
    const current = await this.call(() => this.provider.listRecords(domain));
    const wildcard = current.filter((r) => r.name === '*');
    if (wildcard.some((r) => r.type === 'CNAME')) {
      throw new BadRequestException('The wildcard is a CNAME. Delete it first, then configure the wildcard.');
    }
    const plan: { type: 'A' | 'AAAA'; ips: string[] }[] = [
      { type: 'A' as const, ips: expected.v4 },
      { type: 'AAAA' as const, ips: expected.v6 },
    ].filter((entry) => entry.ips.length > 0);

    for (const { type, ips } of plan) {
      const values = ips.map((ip) => ({ data: ip, ttl: MIN_WILDCARD_TTL }));
      if (wildcard.some((r) => r.type === type)) {
        await this.call(() => this.provider.replaceRecords(domain, type, '*', values));
      } else {
        await this.call(() => this.provider.addRecords(domain, values.map((v) => ({ type, name: '*', ...v }))));
      }
    }
    await this.log(actor, 'DNS_WILDCARD_CONFIGURED', `Pointed *.${domain} at ${[...expected.v4, ...expected.v6].join(', ')}`, {
      before: wildcard.map(({ type, data, ttl }) => ({ type, data, ttl })),
      after: plan,
    });
    return { name: `*.${domain}`, addresses: [...expected.v4, ...expected.v6] };
  }

  /**
   * Checks the platform records in the provider's zone and in public DNS: the
   * domain and a random workspace-style name must both resolve to
   * PLATFORM_PUBLIC_IPS. Reports Verified only when every check passed.
   */
  async verify(actor: PlatformActor) {
    const domain = this.requireReady();
    const expected = expectedAddresses();
    const expectedAll = [...expected.v4, ...expected.v6];
    const checks: VerificationCheck[] = [];
    const matches = (found: string[]) =>
      expectedAll.length === 0
        ? { verified: false, note: 'PLATFORM_PUBLIC_IPS is not set, so there is no expected address to compare with' }
        : found.some((ip) => expectedAll.includes(ip))
          ? { verified: true, note: `includes ${expectedAll.join(', ')}` }
          : { verified: false, note: `expected ${expectedAll.join(', ')}` };

    let zone: DnsRecord[] | null = null;
    try {
      zone = await this.provider.listRecords(domain);
    } catch (error) {
      checks.push({ check: `${this.provider.name} zone`, verified: false, detail: this.message(error) });
    }
    if (zone) {
      for (const [label, name] of [
        [domain, '@'],
        [`*.${domain}`, '*'],
      ] as const) {
        const values = zone.filter((r) => r.name === name && (r.type === 'A' || r.type === 'AAAA')).map((r) => r.data);
        const result = matches(values);
        checks.push({
          check: `${label} in ${this.provider.name}`,
          verified: values.length > 0 && result.verified,
          detail: values.length === 0 ? 'No A or AAAA record.' : `Points to ${values.join(', ')}; ${result.note}.`,
        });
      }
    }

    const probe = `verify-${randomBytes(4).toString('hex')}.${domain}`;
    for (const [label, host] of [
      [domain, domain],
      [`*.${domain} (as ${probe})`, probe],
    ] as const) {
      const found = [...(await resolve4(host).catch(() => [] as string[])), ...(await resolve6(host).catch(() => [] as string[]))];
      const result = matches(found);
      checks.push({
        check: `${label} in public DNS`,
        verified: found.length > 0 && result.verified,
        detail: found.length === 0 ? 'Does not resolve.' : `Resolves to ${found.join(', ')}; ${result.note}.`,
      });
    }

    const verification = { at: new Date().toISOString(), verified: checks.every((c) => c.verified), checks };
    await this.saveState({ lastVerification: verification });
    await this.log(actor, verification.verified ? 'DNS_VERIFIED' : 'DNS_VERIFICATION_FAILED', `DNS verification for ${domain}: ${verification.verified ? 'verified' : 'not verified'}`, {
      checks: checks.map(({ check, verified }) => ({ check, verified })),
    });
    return verification;
  }

  // ── Internals ────────────────────────────────────────────────

  private setupProblem(domain: string | null): string | null {
    if (!domain) return 'PLATFORM_BASE_DOMAIN is not set on the server, so there is no platform domain to manage.';
    if (!this.provider.isConfigured()) return `${this.provider.name} is not configured on the server.`;
    return null;
  }

  private requireReady(): string {
    const domain = platformBaseDomain();
    const problem = this.setupProblem(domain);
    if (problem || !domain) throw new ServiceUnavailableException(problem);
    return domain;
  }

  /** Validates one record's value for its type. */
  private checkedRecord(type: EditableRecordType, name: string, value: DnsRecordValueDto): DnsRecord {
    const data = value.data.trim();
    const hostname = data.replace(/\.$/, '');
    if (type === 'A' && isIP(data) !== 4) throw new BadRequestException('An A record needs an IPv4 address.');
    if (type === 'AAAA' && isIP(data) !== 6) throw new BadRequestException('An AAAA record needs an IPv6 address.');
    if ((type === 'CNAME' || type === 'MX') && (!HOSTNAME.test(data) || isIP(hostname) !== 0)) {
      throw new BadRequestException(`A ${type} record needs a host name, such as mail.example.com.`);
    }
    if (type === 'CNAME' && name === '@') throw new BadRequestException('The domain itself (@) cannot be a CNAME.');
    if (type === 'MX' && (value.priority === undefined || value.priority === null)) {
      throw new BadRequestException('An MX record needs a priority.');
    }
    if (type === 'TXT' && (data.length === 0 || data.length > 1024)) throw new BadRequestException('A TXT record needs 1–1024 characters.');
    return { type, name, data: type === 'CNAME' || type === 'MX' ? hostname : data, ttl: value.ttl, priority: type === 'MX' ? value.priority : null };
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.httpError(error);
    }
  }

  private message(error: unknown): string {
    return error instanceof DnsProviderError ? error.message : 'The DNS provider request failed.';
  }

  /** Provider failures become HTTP errors with the provider's safe message. */
  private httpError(error: unknown): HttpException {
    if (!(error instanceof DnsProviderError)) return new BadGatewayException('The DNS provider request failed.');
    switch (error.kind) {
      case 'NOT_CONFIGURED':
        return new ServiceUnavailableException(error.message);
      case 'NOT_FOUND':
        return new NotFoundException(error.message);
      case 'INVALID':
        return new BadRequestException(error.message);
      case 'RATE_LIMITED':
        return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      default:
        return new BadGatewayException(error.message);
    }
  }

  private async state(): Promise<DnsState> {
    const row = await this.prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: STATE_KEY } });
    const value = asRecord(row?.setting_value);
    return {
      lastSyncedAt: typeof value.lastSyncedAt === 'string' ? value.lastSyncedAt : null,
      lastSyncError: typeof value.lastSyncError === 'string' ? value.lastSyncError : null,
      lastVerification: (value.lastVerification as DnsState['lastVerification']) ?? null,
    };
  }

  private async saveState(patch: Partial<DnsState>) {
    const next = { ...(await this.state()), ...patch } as unknown as Prisma.InputJsonObject;
    await this.prisma.rndtechnosoft_platform_settings.upsert({
      where: { setting_key: STATE_KEY },
      update: { setting_value: next, updated_at: new Date() },
      create: {
        id: randomUUID(),
        setting_category: 'DNS',
        setting_key: STATE_KEY,
        setting_value: next,
        description: 'Last DNS synchronization and verification results',
      },
    });
  }

  private async log(actor: PlatformActor, action: string, description: string, metadata: Record<string, unknown>) {
    await this.prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: actor.superAdminId,
        category: 'DNS',
        action,
        description: description.slice(0, 500),
        metadata: metadata as Prisma.InputJsonValue,
        ip_address: actor.ipAddress ? actor.ipAddress.slice(0, 64) : null,
        user_agent: actor.userAgent ? actor.userAgent.slice(0, 255) : null,
      },
    });
  }
}
