import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmService } from './crm.service';

/** CRM service rules that need no database: every Prisma call is a stub. */

const TENANT = '11111111-1111-1111-1111-111111111111';
const LEAD = '22222222-2222-2222-2222-222222222222';

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
    } as unknown as PrismaService);

    await service.getLeads(TENANT, { page: 1, limit: 100 });

    const args = findMany.mock.calls[0]?.[0] as { where: unknown; orderBy: unknown; take: number };
    expect(args.orderBy).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
    expect(args.where).toEqual({ tenant_id: TENANT });
    expect(args.take).toBe(100);
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
    } as unknown as PrismaService);
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
    const service = new CrmService({ rndtechnosoft_crm_pipelines: { findFirst: pipelines } } as unknown as PrismaService);

    await expect(service.seedCadenceDemoLeads(TENANT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(pipelines).not.toHaveBeenCalled();
  });

  it('proceeds past the gate when the flag is exactly true', async () => {
    process.env.CRM_ALLOW_DEMO_SEED = 'true';
    const pipelines = stub(null);
    const service = new CrmService({ rndtechnosoft_crm_pipelines: { findFirst: pipelines } } as unknown as PrismaService);

    // With no pipeline it stops at the next check, which proves the gate let it through.
    await expect(service.seedCadenceDemoLeads(TENANT)).rejects.toThrow('No active CRM pipeline');
    expect(pipelines).toHaveBeenCalled();
  });
});
