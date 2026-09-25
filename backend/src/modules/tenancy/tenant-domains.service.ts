import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  MIN_SUBDOMAIN_LENGTH,
  RESERVED_SUBDOMAINS,
  hostnameOf,
  isLoopbackHost,
  normalizeSubdomain,
  positionOf,
  subdomainProblem,
} from '@/common/tenancy/subdomain';

/**
 * Where a request arrived, as far as tenancy is concerned:
 * - `unconfigured`: no PLATFORM_BASE_DOMAIN (local development); hosts carry no meaning;
 * - `platform`: the base domain itself or a reserved platform label (www, app, admin…);
 * - `tenant`: a workspace's subdomain;
 * - `unknown`: a free subdomain that no workspace owns;
 * - `foreign`: a host outside the base domain, or a nested name.
 */
export type HostContext =
  | { kind: 'unconfigured' }
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string; subdomain: string }
  | { kind: 'unknown' }
  | { kind: 'foreign' };

type Db = PrismaService | Prisma.TransactionClient;

const CACHE_TTL_MS = 30_000;

/** The platform's base domain for workspace addresses, e.g. voogyo.com; null when not configured. */
export function platformBaseDomain(): string | null {
  const configured = process.env.PLATFORM_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return configured ? configured : null;
}

/**
 * Workspace addresses: allocating a subdomain when a workspace is created,
 * changing it, and resolving a request's Host header to a workspace. The
 * hostname only ever narrows access: the session's own membership decides.
 */
@Injectable()
export class TenantDomainsService {
  private readonly cache = new Map<string, { tenantId: string | null; expires: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The full hostname for a subdomain, or null when no base domain is configured. */
  addressOf(subdomain: string): string | null {
    const base = platformBaseDomain();
    return base ? `${subdomain}.${base}` : null;
  }

  /**
   * The URL people open for a workspace, used in emails: https://<address>, or
   * TENANT_APP_URL in development, where there are no workspace addresses.
   */
  workspaceUrl(subdomain: string): string | null {
    const address = this.addressOf(subdomain);
    if (address) return `https://${address}`;
    const development = process.env.TENANT_APP_URL?.trim().replace(/\/+$/, '');
    return development && /^https?:\/\/[^\s/]+$/.test(development) ? development : null;
  }

  /** Checks a requested subdomain: its normalized form, and whether it can be used. */
  async availability(requested: string) {
    const subdomain = normalizeSubdomain(requested);
    const problem = subdomainProblem(subdomain);
    if (problem) return { subdomain, available: false, reason: problem };
    const taken = await this.isTaken(this.prisma, subdomain);
    return { subdomain, available: !taken, reason: taken ? 'That address is already in use.' : null };
  }

  /**
   * Gives a new workspace its primary subdomain inside the creating
   * transaction. A subdomain the person asked for must be valid and free;
   * one derived from the workspace code gets a numeric suffix when taken.
   */
  async assignPrimarySubdomain(tx: Prisma.TransactionClient, tenantId: string, request: { requested?: string; derivedFrom: string }) {
    let subdomain: string;
    if (request.requested !== undefined) {
      subdomain = normalizeSubdomain(request.requested);
      const problem = subdomainProblem(subdomain);
      if (problem) throw new BadRequestException(`Workspace address: ${problem}`);
      if (await this.isTaken(tx, subdomain)) throw new ConflictException('That workspace address is already in use.');
    } else {
      subdomain = await this.derive(tx, request.derivedFrom);
    }

    try {
      await tx.rndtechnosoft_tenant_domains.create({
        data: { id: randomUUID(), tenant_id: tenantId, domain_kind: 'SUBDOMAIN', subdomain, is_primary: true },
      });
    } catch (error) {
      // Two sign-ups racing for one address: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That workspace address is already in use.');
      }
      throw error;
    }
    return subdomain;
  }

  /** Moves a workspace to a new subdomain. The address must be re-verified afterwards. */
  async changePrimarySubdomain(tenantId: string, requested: string) {
    const subdomain = normalizeSubdomain(requested);
    const problem = subdomainProblem(subdomain);
    if (problem) throw new BadRequestException(`Workspace address: ${problem}`);

    const current = await this.prisma.rndtechnosoft_tenant_domains.findFirst({
      where: { tenant_id: tenantId, is_primary: true, domain_kind: 'SUBDOMAIN' },
      select: { id: true, subdomain: true },
    });
    if (!current) throw new NotFoundException('This workspace has no primary address.');
    if (current.subdomain === subdomain) return { previous: subdomain, subdomain };
    if (await this.isTaken(this.prisma, subdomain)) throw new ConflictException('That workspace address is already in use.');

    try {
      await this.prisma.rndtechnosoft_tenant_domains.update({
        where: { id: current.id },
        data: {
          subdomain,
          provisioning_status: 'PENDING',
          provisioning_error: null,
          provisioning_attempts: 0,
          verified_at: null,
          last_checked_at: null,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That workspace address is already in use.');
      }
      throw error;
    }
    this.cache.clear();
    return { previous: current.subdomain, subdomain };
  }

  /** Where a request arrived, from its Host header (the reverse proxy must pass the original Host). */
  async resolveHost(hostHeader: string | undefined): Promise<HostContext> {
    const base = platformBaseDomain();
    if (!base) return { kind: 'unconfigured' };
    // Local access (the dev proxy sends Host: localhost:<port>) carries no
    // workspace; the session alone decides it, as on the main site.
    if (isLoopbackHost(hostHeader)) return { kind: 'platform' };

    const hostname = hostnameOf(hostHeader);
    if (!hostname) return { kind: 'foreign' };

    const position = positionOf(hostname, base);
    if (position.kind === 'apex') return { kind: 'platform' };
    if (position.kind !== 'subdomain') return { kind: 'foreign' };
    // Reserved and malformed labels are platform hosts, never workspaces.
    if (subdomainProblem(position.label)) return { kind: 'platform' };

    const tenantId = await this.tenantForSubdomain(position.label);
    return tenantId ? { kind: 'tenant', tenantId, subdomain: position.label } : { kind: 'unknown' };
  }

  /**
   * Refuses a signed-in request that does not belong at this host: an
   * unknown or foreign address, or a session for a different workspace than
   * the one whose address it is. Knowing a workspace's address grants nothing.
   */
  assertSessionFitsHost(host: HostContext, sessionTenantId: string) {
    if (host.kind === 'unknown') throw new NotFoundException('There is no workspace at this address.');
    if (host.kind === 'foreign') {
      throw new HttpException('This address does not serve Voogyo workspaces.', HttpStatus.MISDIRECTED);
    }
    if (host.kind === 'tenant' && host.tenantId !== sessionTenantId) {
      throw new ForbiddenException('You are signed in to a different workspace. Sign in at this workspace’s address.');
    }
  }

  /** The workspace a sign-in on this host must use: the host's own, or the one requested elsewhere. */
  tenantForSignIn(host: HostContext, requestedTenantId: string | undefined): string | undefined {
    if (host.kind === 'unknown') throw new NotFoundException('There is no workspace at this address.');
    if (host.kind === 'foreign') {
      throw new HttpException('This address does not serve Voogyo workspaces.', HttpStatus.MISDIRECTED);
    }
    if (host.kind === 'tenant') {
      if (requestedTenantId && requestedTenantId !== host.tenantId) {
        throw new BadRequestException('This sign-in page belongs to a different workspace.');
      }
      return host.tenantId;
    }
    return requestedTenantId;
  }

  /** New workspaces are created from the main site, never from another workspace's address. */
  assertCanRegisterHere(host: HostContext) {
    if (host.kind === 'tenant' || host.kind === 'unknown') {
      throw new BadRequestException('Create a new workspace from the main sign-up page.');
    }
    if (host.kind === 'foreign') {
      throw new HttpException('This address does not serve Voogyo workspaces.', HttpStatus.MISDIRECTED);
    }
  }

  /** Primary subdomains of the given workspaces. */
  async primarySubdomains(tenantIds: string[]) {
    const rows = await this.prisma.rndtechnosoft_tenant_domains.findMany({
      where: { tenant_id: { in: tenantIds }, is_primary: true, domain_kind: 'SUBDOMAIN' },
      select: { tenant_id: true, subdomain: true, provisioning_status: true },
    });
    return new Map(rows.map((row) => [row.tenant_id, row]));
  }

  private async tenantForSubdomain(subdomain: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(subdomain);
    if (cached && cached.expires > now) return cached.tenantId;

    const row = await this.prisma.rndtechnosoft_tenant_domains.findUnique({
      where: { subdomain },
      select: { tenant_id: true },
    });
    const tenantId = row?.tenant_id ?? null;
    this.cache.set(subdomain, { tenantId, expires: now + CACHE_TTL_MS });
    return tenantId;
  }

  private async isTaken(db: Db, subdomain: string) {
    return (await db.rndtechnosoft_tenant_domains.count({ where: { subdomain } })) > 0;
  }

  /** A free subdomain from a workspace code or name: "RND_IN" → "rnd-in", then "rnd-in-2" if taken. */
  private async derive(db: Db, source: string) {
    const base = normalizeSubdomain(source);
    if (!subdomainProblem(base) && !(await this.isTaken(db, base))) return base;

    // A reserved or too-short code would make platform-looking fallbacks (admin-2), so use a neutral stem.
    const usable = base.length >= MIN_SUBDOMAIN_LENGTH && !RESERVED_SUBDOMAINS.has(base);
    const stem = (usable ? base : 'workspace').slice(0, 56).replace(/-+$/, '');
    for (let n = 2; n < 100; n++) {
      const candidate = `${stem}-${n}`;
      if (!subdomainProblem(candidate) && !(await this.isTaken(db, candidate))) return candidate;
    }
    return `ws-${randomBytes(6).toString('hex')}`;
  }
}
