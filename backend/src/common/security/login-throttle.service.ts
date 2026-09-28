import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Durable, database-backed throttling for every sign-in endpoint, platform
 * (super admin) and tenant user alike.
 *
 * The per-account lockout in SuperAdminAuthService stops a password being
 * guessed against one admin. It does nothing against credential stuffing,
 * where an attacker tries one password across many addresses, or against a
 * distributed attempt on a single address. This service counts failures per
 * key and blocks the key once a window limit is exceeded.
 *
 * It is stored rather than held in memory so limits survive restarts and hold
 * across every application instance.
 */

/** Keeps tenant and platform counters from interfering with each other. */
export type ThrottleRealm = 'platform' | 'tenant';

export interface ThrottleRule {
  /** Stable identifier, for example `ip:203.0.113.4`. */
  key: string;
  /** Failures tolerated inside the window before the key is blocked. */
  limit: number;
  windowMinutes: number;
  blockMinutes: number;
}

/** Sign-in attempts from one network address. */
export const IP_LOGIN_RULE = { limit: 20, windowMinutes: 15, blockMinutes: 15 };

/** Sign-in attempts against one email address, existing or not. */
export const EMAIL_LOGIN_RULE = { limit: 10, windowMinutes: 15, blockMinutes: 15 };

/** Second-factor guesses inside one pending sign-in. */
export const MFA_RULE = { limit: 5, windowMinutes: 10, blockMinutes: 10 };

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Addresses are hashed so the throttle table holds no readable identifiers. */
  emailKey(email: string, realm: ThrottleRealm = 'platform'): string {
    const digest = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return `${realm}:email:${digest.slice(0, 40)}`;
  }

  ipKey(ipAddress: string | undefined, realm: ThrottleRealm = 'platform'): string {
    return `${realm}:ip:${(ipAddress || 'unknown').slice(0, 110)}`;
  }

  sessionKey(sessionId: string): string {
    return `mfa:${sessionId}`;
  }

  /**
   * Rejects the request when any key is currently blocked. Called before the
   * password is verified so a blocked caller never reaches the slow key
   * derivation, which keeps the endpoint cheap to defend.
   */
  async assertNotBlocked(keys: string[]): Promise<void> {
    const now = new Date();

    const blocked = await this.prisma.rndtechnosoft_login_throttle.findFirst({
      where: { throttle_key: { in: keys }, blocked_until: { gt: now } },
      select: { throttle_key: true, blocked_until: true },
    });

    if (!blocked || !blocked.blocked_until) {
      return;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((blocked.blocked_until.getTime() - now.getTime()) / 1000),
    );

    this.logger.warn(
      `Sign-in throttled key=${blocked.throttle_key} retryAfter=${retryAfterSeconds}s`,
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many attempts. Wait a few minutes before trying again.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Records one failure against each key, blocking any key that crosses its limit. */
  async recordFailure(rules: ThrottleRule[]): Promise<void> {
    const now = new Date();

    for (const rule of rules) {
      try {
        const existing = await this.prisma.rndtechnosoft_login_throttle.findUnique({
          where: { throttle_key: rule.key },
        });

        const windowExpired =
          !existing ||
          now.getTime() - existing.window_started_at.getTime() > rule.windowMinutes * 60_000;

        const attemptCount = windowExpired ? 1 : existing.attempt_count + 1;
        const shouldBlock = attemptCount >= rule.limit;
        const blockedUntil = shouldBlock
          ? new Date(now.getTime() + rule.blockMinutes * 60_000)
          : null;

        await this.prisma.rndtechnosoft_login_throttle.upsert({
          where: { throttle_key: rule.key },
          create: {
            id: randomUUID(),
            throttle_key: rule.key,
            attempt_count: attemptCount,
            window_started_at: now,
            blocked_until: blockedUntil,
            updated_at: now,
          },
          update: {
            attempt_count: attemptCount,
            window_started_at: windowExpired ? now : existing!.window_started_at,
            blocked_until: blockedUntil ?? existing?.blocked_until ?? null,
            updated_at: now,
          },
        });

        if (shouldBlock) {
          this.logger.warn(
            `Sign-in key blocked key=${rule.key} attempts=${attemptCount} for ${rule.blockMinutes}m`,
          );
        }
      } catch (error) {
        // Throttle bookkeeping must never mask the authentication outcome.
        this.logger.error(`Unable to record throttle failure for ${rule.key}`, error as Error);
      }
    }
  }

  /** Clears counters after a genuine success so honest users are not penalised. */
  async clear(keys: string[]): Promise<void> {
    try {
      await this.prisma.rndtechnosoft_login_throttle.deleteMany({
        where: { throttle_key: { in: keys } },
      });
    } catch (error) {
      this.logger.error('Unable to clear throttle counters', error as Error);
    }
  }

  /**
   * Deletes rows whose window has elapsed and whose block has expired.
   * Safe to call periodically; it never removes an active block.
   */
  async pruneExpired(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);

    const result = await this.prisma.rndtechnosoft_login_throttle.deleteMany({
      where: {
        window_started_at: { lt: cutoff },
        OR: [{ blocked_until: null }, { blocked_until: { lt: new Date() } }],
      },
    });

    return result.count;
  }
}
