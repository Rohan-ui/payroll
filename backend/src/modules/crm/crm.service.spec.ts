import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmService } from './crm.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { CADENCE_STEPS_MASTER } from './crm-cadence.helper';
import { CadenceQueryDto } from './dto/cadence-query.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

const TENANT = '11111111-1111-1111-1111-111111111111';
const LEAD = '22222222-2222-2222-2222-222222222222';

describe('CrmService.getCadenceMatrix pagination', () => {
  it('transforms page parameters and rejects oversized pages and unknown filters', () => {
    const query = plainToInstance(CadenceQueryDto, { page: '3', limit: '50', queue: 'BRANCHED', channel: 'EMAIL' });
    expect(validateSync(query)).toHaveLength(0);
    expect(query.page).toBe(3);
    expect(validateSync(plainToInstance(CadenceQueryDto, { limit: '100', page: '0', queue: 'invalid', channel: 'invalid' })).map(error => error.property).sort())
      .toEqual(['channel', 'limit', 'page', 'queue']);
  });
  const rows = Array.from({ length: 625 }, (_, i) => ({
    id: `lead-${i}`, tenant_id: TENANT, created_at: new Date('2026-01-01'),
    temperature: 'COLD', industry: 'Manufacturing', sub_industry: i >= 550 ? 'Engineering Wire' : 'Plastic',
    company_name: i === 600 ? 'Beyond the first hundred' : `Company ${i}`,
    first_name: 'Asha', last_name: '', email: 'asha@example.test', phone: '', is_won: false,
    custom_attributes: i >= 600 ? { cadence: { status: 'BRANCHED', completedSteps: [], nextDueAt: '2026-01-01' } } : {},
  }));
  function setup() {
    type QueryArgs = {
      where: { tenant_id: string; id?: { in: string[] }; OR?: Record<string, { contains: string; mode: string }>[] };
      cursor?: { id: string }; skip?: number; take: number; include?: unknown;
    };
    const findMany = jest.fn(async (args: QueryArgs) => {
      let result = rows.filter(row => row.tenant_id === args.where.tenant_id);
      if (args.where.OR) {
        const term = args.where.OR[0].company_name.contains.toLowerCase();
        result = result.filter(row => row.company_name.toLowerCase().includes(term));
      }
      const ids = args.where.id?.in;
      if (ids) result = result.filter(row => ids.includes(row.id));
      const cursor = args.cursor?.id;
      if (cursor) result = result.slice(result.findIndex(row => row.id === cursor) + (args.skip ?? 0));
      return result.slice(0, args.take);
    });
    const service = new CrmService({
      rndtechnosoft_tenants: { findUnique: stub({ tenant_code: 'TEST' }) },
      rndtechnosoft_crm_leads: { findMany },
    } as unknown as PrismaService, {} as CrmLeadAssignmentService);
    jest.spyOn(service, 'getCadenceSteps').mockResolvedValue(CADENCE_STEPS_MASTER.map((step, i) => ({ ...step, id: `step-${i}` })));
    jest.spyOn(service, 'getReplyBranches').mockResolvedValue({});
    return { service, findMany };
  }

  it('returns 50 at a time with full totals and reaches records past 100 and the metadata batch boundary', async () => {
    const { service, findMany } = setup();
    const first = await service.getCadenceMatrix(TENANT);
    expect(first.pagination).toMatchObject({ total: 625, page: 1, limit: 50, hasMore: true });
    expect(first.radar?.allActive).toHaveLength(50);
    expect(first.stats).toMatchObject({ totalEnrolled: 625, activeCount: 600, branchedCount: 25 });
    expect(first.facets?.subIndustryCounts.engineering_wire).toBe(75);
    const last = await service.getCadenceMatrix(TENANT, undefined, 'ALL', { page: 13 });
    expect(last.pagination).toMatchObject({ total: 625, totalPages: 13, hasMore: false });
    expect(last.radar?.branched.map(row => row.id)).toEqual(rows.slice(600).map(row => row.id));
    expect(findMany.mock.calls.every(([args]) => args.where.tenant_id === TENANT && args.take <= 500)).toBe(true);
    const detailQueries = findMany.mock.calls.map(([args]) => args).filter(args => args.include);
    expect(detailQueries.every(args => args.take === 50 && (args.where.id?.in.length ?? Infinity) <= 50)).toBe(true);
  });

  it('filters taxonomy names by keys, channel and queue before paging, and searches beyond the initial page', async () => {
    const { service, findMany } = setup();
    const filtered = await service.getCadenceMatrix(TENANT, undefined, 'ALL', {
      industry: 'manufacturing', subIndustry: 'engineering_wire', channel: 'EMAIL', queue: 'BRANCHED',
    });
    expect(filtered.pagination?.total).toBe(25);
    expect(filtered.radar?.branched).toHaveLength(25);
    expect(filtered.radar?.allActive).toHaveLength(0);
    const searched = await service.getCadenceMatrix(TENANT, undefined, 'ALL', { search: 'Beyond the first hundred' });
    expect(searched.radar?.branched[0].id).toBe('lead-600');
    expect(searched.pagination?.total).toBe(1);
    expect(findMany.mock.calls.some(([args]) => args.where.OR?.some(filter => filter.sub_industry))).toBe(true);
    const otherTenant = await service.getCadenceMatrix('other-tenant');
    expect(otherTenant.pagination?.total).toBe(0);
  });
});

/** CRM service rules that need no database: every Prisma call is a stub. */

type Stub = jest.Mock<(...args: any[]) => Promise<any>>;
const stub = (value: unknown): Stub => jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(value);

describe('CrmService.getLeads', () => {
  it('lists the newest leads first, so a lead just added is on the first page', async () => {
    const findMany = stub([]);
    const service = new CrmService({
      rndtechnosoft_crm_leads: { findMany, count: stub(0) },
      rndtechnosoft_crm_stages: { findMany: stub([]) },
      rndtechnosoft_crm_pipelines: { findMany: stub([]) },
      rndtechnosoft_crm_lead_sources: { findMany: stub([]) },
      rndtechnosoft_tenant_members: { findMany: stub([]) },
      rndtechnosoft_crm_clients: { findMany: stub([]) },
    } as unknown as PrismaService, {} as CrmLeadAssignmentService);

    await service.getLeads(TENANT, { page: 1, limit: 100 });

    const args = findMany.mock.calls[0]?.[0] as { where: unknown; orderBy: unknown; take: number };
    expect(args.orderBy).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
    expect(args.where).toEqual({ tenant_id: TENANT });
    expect(args.take).toBe(100);

    await service.getLeads(TENANT, { page: 3, limit: 50, origin: 'NEW', service: 'Consulting', excludeOutreach: true, search: 'Engineering' });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ skip: 100, take: 50, where: { tenant_id: TENANT, primary_service: 'Consulting', AND: expect.any(Array), OR: expect.any(Array) } });
  });
});

describe('CrmService.convertDealWon', () => {
  const lead = { id: LEAD, tenant_id: TENANT, company_name: 'Acme', first_name: 'Asha', last_name: null, email: 'asha@acme.example', phone: null, address: null, city: null, gstin: null, pan: null, stage_id: 's1' };

  function serviceWith(existingClient: unknown) {
    const activity = stub({});
    const audit = stub({});
    const service = new CrmService({
      rndtechnosoft_crm_leads: { findFirst: stub(lead), update: stub({}) },
      rndtechnosoft_crm_clients: {
        findFirst: stub(existingClient),
        create: jest.fn(async (args: any) => ({ ...args.data })),
      },
      rndtechnosoft_crm_stages: { findFirst: stub({ id: 'won-stage' }) },
      rndtechnosoft_crm_lead_activities: { create: activity },
      rndtechnosoft_crm_audit_logs: { create: audit },
    } as unknown as PrismaService, {} as CrmLeadAssignmentService);
    return { service, activity, audit };
  }

  it('records a created client and invents no project or invoice number', async () => {
    const { service, activity, audit } = serviceWith(null);
    const result = await service.convertDealWon(TENANT, LEAD);

    expect(result).toEqual({ clientId: expect.any(String), clientCode: expect.stringMatching(/^CL-\d{4}-\d{6}$/), clientCreated: true });
    const written = JSON.stringify([result, activity.mock.calls, audit.mock.calls]);
    expect(written).not.toMatch(/PRJ-|INV-|projectCode|invoiceNumber/);
    const title = (activity.mock.calls[0]?.[0] as { data: { title: string } }).data.title;
    expect(title).toBe(`Deal won — client ${result.clientCode} created`);
  });

  it('says the client was linked when it already existed', async () => {
    const { service, activity } = serviceWith({ id: 'existing', client_code: 'CL-2026-123456', company_name: 'Acme' });
    const result = await service.convertDealWon(TENANT, LEAD);

    expect(result).toEqual({ clientId: 'existing', clientCode: 'CL-2026-123456', clientCreated: false });
    expect((activity.mock.calls[0]?.[0] as { data: { title: string } }).data.title).toBe('Deal won — client CL-2026-123456 linked');
  });
});

describe('CrmService.seedCadenceDemoLeads', () => {
  const previous = process.env.CRM_ALLOW_DEMO_SEED;
  afterEach(() => {
    if (previous === undefined) delete process.env.CRM_ALLOW_DEMO_SEED;
    else process.env.CRM_ALLOW_DEMO_SEED = previous;
  });

  it.each([undefined, 'false', '1', 'TRUE'])('refuses without CRM_ALLOW_DEMO_SEED=true (value %s), writing nothing', async (value) => {
    if (value === undefined) delete process.env.CRM_ALLOW_DEMO_SEED;
    else process.env.CRM_ALLOW_DEMO_SEED = value;
    const pipelines = stub(null);
    const service = new CrmService({ rndtechnosoft_crm_pipelines: { findFirst: pipelines } } as unknown as PrismaService, {} as CrmLeadAssignmentService);

    await expect(service.seedCadenceDemoLeads(TENANT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(pipelines).not.toHaveBeenCalled();
  });

  it('proceeds past the gate when the flag is exactly true', async () => {
    process.env.CRM_ALLOW_DEMO_SEED = 'true';
    const pipelines = stub(null);
    const service = new CrmService({ rndtechnosoft_crm_pipelines: { findFirst: pipelines } } as unknown as PrismaService, {} as CrmLeadAssignmentService);

    // With no pipeline it stops at the next check, which proves the gate let it through.
    await expect(service.seedCadenceDemoLeads(TENANT)).rejects.toThrow('No active CRM pipeline');
    expect(pipelines).toHaveBeenCalled();
  });
});
