import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmService } from '@/modules/crm/crm.service';
import { CadenceState, nextCadenceStep } from '@/modules/crm/crm-cadence.helper';

/**
 * Records the lead's current Client Outreach day as having its messages sent
 * (every channel, or the ones named), as the execute screen would, so a test
 * can complete the day. Only for tests about what happens after that.
 */
export async function sendDayMessages(app: INestApplication, tenantId: string, leadId: string, channels: ('WHATSAPP' | 'EMAIL' | 'LINKEDIN')[] = ['WHATSAPP', 'EMAIL', 'LINKEDIN']) {
  const prisma = app.get(PrismaService);
  const lead = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: tenantId, id: leadId } });
  const attributes = (lead.custom_attributes as Record<string, unknown> | null) ?? {};
  const cadence = attributes.cadence as CadenceState | undefined;
  if (!cadence) return;
  const step = nextCadenceStep(await app.get(CrmService).getCadenceSteps(tenantId), cadence);
  if (!step) return;
  const sent = { status: 'SENT', attempt: 1, executedBy: { memberId: 'test', name: 'Test' }, startedAt: new Date().toISOString(), sentAt: new Date().toISOString() };
  const day = String(step.dayNumber);
  const channelActions = { ...(cadence.channelActions ?? {}), [day]: { ...(cadence.channelActions?.[day] ?? {}), ...Object.fromEntries(channels.map((c) => [c, sent])) } };
  await prisma.rndtechnosoft_crm_leads.update({
    where: { tenant_id_id: { tenant_id: tenantId, id: leadId } },
    data: { custom_attributes: { ...attributes, cadence: { ...cadence, channelActions } } as unknown as Prisma.InputJsonObject },
  });
}
