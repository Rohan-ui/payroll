import { jest } from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService pagination', () => {
  it('scopes and paginates employee search on the server', async () => {
    const count = jest.fn<() => Promise<number>>().mockResolvedValue(45);
    const findMany = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
    const service = new EmployeesService({
      rndtechnosoft_employees: { count, findMany },
    } as unknown as PrismaService);

    await expect(service.listEmployees('tenant-1', 2, 20, ' engineer ', ' Engineering ')).resolves.toMatchObject({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasMore: true,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({ tenant_id: 'tenant-1' }),
    }));
  });
});
