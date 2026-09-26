import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PlatformActor } from '@/modules/email/email.service';

/**
 * Records one platform console action in the platform activity log. Metadata
 * carries ids and field names, never contact details, secrets or passwords.
 */
export async function recordPlatformAction(
  db: Pick<Prisma.TransactionClient, 'rndtechnosoft_platform_activity_logs'>,
  actor: PlatformActor,
  entry: { category: string; action: string; description: string; targetTenantId?: string; metadata: Record<string, unknown> },
): Promise<void> {
  await db.rndtechnosoft_platform_activity_logs.create({
    data: {
      id: randomUUID(),
      super_admin_id: actor.superAdminId,
      category: entry.category,
      action: entry.action,
      target_tenant_id: entry.targetTenantId ?? null,
      description: entry.description.slice(0, 500),
      metadata: entry.metadata as Prisma.InputJsonValue,
      ip_address: actor.ipAddress ? actor.ipAddress.slice(0, 64) : null,
      user_agent: actor.userAgent ? actor.userAgent.slice(0, 255) : null,
    },
  });
}
