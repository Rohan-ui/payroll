import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { PrismaService } from '@/prisma/prisma.service';
import { platformBaseDomain } from './tenant-domains.service';

const CHECK_INTERVAL_MS = 5 * 60_000;
const CHECK_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 20;
/** A check that started this long ago and never finished is considered abandoned. */
const STALE_CLAIM_MINUTES = 10;

/** The outcome of one verification, safe to store and show: no credentials, no internal detail. */
type CheckResult = { ok: true } | { ok: false; error: string };

/**
 * Verifies that a workspace address actually reaches this application.
 *
 * With wildcard DNS (*.<base domain>) and a wildcard certificate in place, a
 * new subdomain needs no infrastructure change: this only confirms it.
 * PENDING → PROVISIONING → ACTIVE, or FAILED with a stored reason and a later
 * retry. It never runs commands or changes DNS, certificates or the proxy.
 */
@Injectable()
export class DomainProvisioningService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DomainProvisioningService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Background checks run only where addresses exist, and never under test.
    if (!platformBaseDomain() || process.env.NODE_ENV === 'test' || process.env.PLATFORM_DOMAIN_CHECKS === 'off') return;
    this.timer = setInterval(() => void this.checkDue(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Checks one address now (the platform console's "Verify" action). */
  async verify(domainId: string) {
    const domain = await this.prisma.rndtechnosoft_tenant_domains.findUnique({
      where: { id: domainId },
      select: { id: true, subdomain: true, custom_hostname: true },
    });
    if (!domain) throw new NotFoundException('That address does not exist.');
    return this.run(domain);
  }

  /** Addresses that are new, or failed long enough ago to retry (backing off up to six hours). */
  async checkDue() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.$queryRaw<{ id: string; subdomain: string | null; custom_hostname: string | null }[]>`
        SELECT id, subdomain, custom_hostname
        FROM rndtechnosoft_tenant_domains
        WHERE provisioning_status = 'PENDING'
           OR (provisioning_status = 'FAILED'
               AND last_checked_at < now() - least(interval '6 hours', interval '5 minutes' * power(2, least(provisioning_attempts, 7))))
           OR (provisioning_status = 'PROVISIONING' AND last_checked_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}::int))
        ORDER BY last_checked_at NULLS FIRST
        LIMIT ${BATCH_SIZE}`;
      for (const domain of due) await this.run(domain);
    } catch (error) {
      this.logger.error(`Domain checks could not run: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }

  private async run(domain: { id: string; subdomain: string | null; custom_hostname: string | null }) {
    // Claim the address so two app instances never check it at the same time.
    const claimed = await this.prisma.$executeRaw`
      UPDATE rndtechnosoft_tenant_domains
      SET provisioning_status = 'PROVISIONING', last_checked_at = now(), updated_at = now()
      WHERE id = ${domain.id}::uuid
        AND (provisioning_status <> 'PROVISIONING' OR last_checked_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}::int))`;
    if (claimed === 0) return this.status(domain.id);

    const base = platformBaseDomain();
    const hostname = domain.custom_hostname ?? (base && domain.subdomain ? `${domain.subdomain}.${base}` : null);
    const result: CheckResult = hostname
      ? await this.check(hostname)
      : { ok: false, error: 'PLATFORM_BASE_DOMAIN is not configured on the server, so this address has no hostname yet.' };

    await this.prisma.rndtechnosoft_tenant_domains.update({
      where: { id: domain.id },
      data: result.ok
        ? { provisioning_status: 'ACTIVE', provisioning_error: null, verified_at: new Date(), last_checked_at: new Date(), updated_at: new Date() }
        : {
            provisioning_status: 'FAILED',
            provisioning_error: result.error.slice(0, 500),
            provisioning_attempts: { increment: 1 },
            last_checked_at: new Date(),
            updated_at: new Date(),
          },
    });
    this.logger.log(`Domain check ${result.ok ? 'passed' : 'failed'} domainId=${domain.id}`);
    return this.status(domain.id);
  }

  /** DNS must resolve (to one of PLATFORM_PUBLIC_IPS when set) and HTTPS must reach this app's health check. */
  private async check(hostname: string): Promise<CheckResult> {
    let addresses: string[];
    try {
      addresses = (await lookup(hostname, { all: true })).map((entry) => entry.address);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
      return { ok: false, error: `DNS lookup for ${hostname} failed (${code}). Check the wildcard DNS record.` };
    }

    const expected = (process.env.PLATFORM_PUBLIC_IPS ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (expected.length > 0 && !addresses.some((address) => expected.includes(address))) {
      return { ok: false, error: `${hostname} resolves to ${addresses.join(', ')}, not to this server (${expected.join(', ')}).` };
    }

    try {
      const response = await fetch(`https://${hostname}/api/v1/health`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (response.status !== 200) {
        return { ok: false, error: `HTTPS reached ${hostname} but the health check answered ${response.status}; the proxy may not route it to this application.` };
      }
      const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (body?.status !== 'ok') {
        return { ok: false, error: `HTTPS reached ${hostname} but not this application's health check.` };
      }
      return { ok: true };
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : cause ?? 'could not connect';
      return { ok: false, error: `HTTPS check for ${hostname} failed (${reason}). Check the certificate and reverse proxy.` };
    }
  }

  private async status(domainId: string) {
    return this.prisma.rndtechnosoft_tenant_domains.findUniqueOrThrow({
      where: { id: domainId },
      select: {
        id: true,
        subdomain: true,
        custom_hostname: true,
        provisioning_status: true,
        provisioning_error: true,
        provisioning_attempts: true,
        last_checked_at: true,
        verified_at: true,
      },
    });
  }
}
