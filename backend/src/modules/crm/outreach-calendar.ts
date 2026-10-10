import { PrismaService } from '@/prisma/prisma.service';
import { OutreachCalendar, validTimeZone } from './crm-outreach-schedule';

/**
 * The workspace's calendar for anything sent or due on working days: its time
 * zone (Organization & Settings, India time by default) and the holidays of
 * its active HRMS holiday calendars, from a year back to two years ahead.
 * Client Outreach and drip sequences both use it.
 */
export async function loadOutreachCalendar(prisma: PrismaService, tenantId: string): Promise<OutreachCalendar> {
  const [settings, holidays] = await Promise.all([
    prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId }, select: { settings: true } }),
    prisma.rndtechnosoft_holidays.findMany({
      where: {
        tenant_id: tenantId,
        is_optional: false,
        holiday_date: { gte: new Date(Date.now() - 400 * 86_400_000), lte: new Date(Date.now() + 800 * 86_400_000) },
        rndtechnosoft_holiday_calendars: { calendar_status: 'ACTIVE', archived_at: null },
      },
      select: { holiday_date: true },
    }),
  ]);
  const saved = (settings?.settings ?? {}) as { timezone?: unknown; profile?: { timezone?: unknown } };
  return {
    timeZone: validTimeZone(saved.profile?.timezone ?? saved.timezone),
    holidays: new Set(holidays.map((h) => h.holiday_date.toISOString().slice(0, 10))),
  };
}
