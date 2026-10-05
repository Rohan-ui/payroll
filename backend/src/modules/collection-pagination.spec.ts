import { jest } from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { AttendanceService } from './attendance/attendance.service';
import { BookkeepingService } from './bookkeeping/bookkeeping.service';
import { CrmService } from './crm/crm.service';
import { CrmLeadAssignmentService } from './crm/crm-lead-assignment.service';
import { SuperAdminService } from './super-admin/super-admin.service';

describe('growing collection pagination', () => {
  it.each([
    {
      name: 'attendance punches',
      run: async () => {
        const findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
        const count = jest.fn<() => Promise<number>>().mockResolvedValue(31);
        const service = new AttendanceService({ rndtechnosoft_attendance_punches: { findMany, count } } as unknown as PrismaService);
        const result = await service.getPunches('tenant-1', undefined, undefined, 2, 10);
        return { result, findMany };
      },
    },
    {
      name: 'journal entries',
      run: async () => {
        const findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
        const count = jest.fn<() => Promise<number>>().mockResolvedValue(31);
        const service = new BookkeepingService(
          { rndtechnosoft_bookkeeping_entries: { findMany, count } } as unknown as PrismaService,
          {} as never,
        );
        const result = await service.getJournalEntries('tenant-1', { page: 2, limit: 10 });
        return { result, findMany };
      },
    },
    {
      name: 'CRM activities',
      run: async () => {
        const findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
        const count = jest.fn<() => Promise<number>>().mockResolvedValue(31);
        const service = new CrmService({ rndtechnosoft_crm_lead_activities: { findMany, count } } as unknown as PrismaService, {} as CrmLeadAssignmentService);
        const result = await service.getActivities('tenant-1', { all: true }, undefined, 2, 10);
        return { result, findMany };
      },
    },
    {
      name: 'platform coupons',
      run: async () => {
        const findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
        const count = jest.fn<() => Promise<number>>().mockResolvedValue(31);
        const service = new SuperAdminService({ rndtechnosoft_platform_coupons: { findMany, count } } as unknown as PrismaService);
        const result = await service.getCoupons({ page: 2, pageSize: 10 });
        return { result: { ...result, limit: result.pageSize }, findMany };
      },
    },
  ])('uses database offset/limit/count for $name', async ({ run }) => {
    const { result, findMany } = await run();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(result).toMatchObject({ total: 31, page: 2, limit: 10, totalPages: 4 });
  });
});
