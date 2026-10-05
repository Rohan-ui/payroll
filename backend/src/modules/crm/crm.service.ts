import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { LeadVisibility, onVisibleLead, visibleLeads } from './lead-visibility';
import { CadenceQueryDto } from './dto/cadence-query.dto';
import { randomInt, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import {
  SORTED_COUNTRY_CODES,
  parsePhoneWithCountryCode,
} from '@/common/utils/country-codes.util';
import {
  CADENCE_STEPS_MASTER,
  CADENCE_REPLY_BRANCHES,
  CADENCE_INDUSTRIES,
  CadenceChannel,
  CadenceState,
  CadenceStep,
  CadenceTemplate,
  ReplyBranch,
  computeStepDueDate,
  nextCadenceStep,
  evaluateStepDueStatus,
  interpolateText,
} from './crm-cadence.helper';

export const BASELINE_INDUSTRIES = [
  {
    id: 'ind_mfg',
    name: 'Manufacturing',
    sub_industries: [
      { id: 'sub_mfg_chem', name: 'Chemical', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_plast', name: 'Plastic', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_wire', name: 'Engineering Wire', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_cnc', name: 'CNC Machining & Tooling', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_auto', name: 'Automotive Components', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_pack', name: 'Packaging Materials', industry_id: 'ind_mfg' },
      { id: 'sub_mfg_mach', name: 'Heavy Machinery & Equipment', industry_id: 'ind_mfg' },
    ],
  },
  {
    id: 'ind_health',
    name: 'Healthcare & Medical',
    sub_industries: [
      { id: 'sub_hlth_hosp', name: 'Hospitals & Clinics', industry_id: 'ind_health' },
      { id: 'sub_hlth_pharma', name: 'Pharmaceuticals & Biotech', industry_id: 'ind_health' },
      { id: 'sub_hlth_eq', name: 'Medical Equipment Mfg.', industry_id: 'ind_health' },
      { id: 'sub_hlth_diag', name: 'Diagnostic Labs', industry_id: 'ind_health' },
      { id: 'sub_hlth_dent', name: 'Dental Clinics', industry_id: 'ind_health' },
      { id: 'sub_hlth_ayur', name: 'Ayurveda & Wellness', industry_id: 'ind_health' },
    ],
  },
  {
    id: 'ind_chem',
    name: 'Chemical & Petrochemical',
    sub_industries: [
      { id: 'sub_chem_spec', name: 'Specialty Chemicals', industry_id: 'ind_chem' },
      { id: 'sub_chem_solv', name: 'Industrial Solvents', industry_id: 'ind_chem' },
      { id: 'sub_chem_agro', name: 'Agro-Chemicals & Fertilizers', industry_id: 'ind_chem' },
      { id: 'sub_chem_dyes', name: 'Dyes & Pigments', industry_id: 'ind_chem' },
      { id: 'sub_chem_api', name: 'API & Bulk Drug Ingredients', industry_id: 'ind_chem' },
    ],
  },
  {
    id: 'ind_it',
    name: 'Information Technology & Software',
    sub_industries: [
      { id: 'sub_it_saas', name: 'SaaS & Cloud Software', industry_id: 'ind_it' },
      { id: 'sub_it_apps', name: 'Web & Mobile App Engineering', industry_id: 'ind_it' },
      { id: 'sub_it_ai', name: 'AI & Machine Learning Automation', industry_id: 'ind_it' },
      { id: 'sub_it_sec', name: 'Cyber Security & VAPT', industry_id: 'ind_it' },
      { id: 'sub_it_erp', name: 'ERP & Enterprise Solutions', industry_id: 'ind_it' },
    ],
  },
  {
    id: 'ind_re',
    name: 'Real Estate & Construction',
    sub_industries: [
      { id: 'sub_re_res', name: 'Residential Developers', industry_id: 'ind_re' },
      { id: 'sub_re_comm', name: 'Commercial & IT Parks', industry_id: 'ind_re' },
      { id: 'sub_re_log', name: 'Industrial Warehousing & Logistics', industry_id: 'ind_re' },
      { id: 'sub_re_epc', name: 'EPC Construction & Infrastructure', industry_id: 'ind_re' },
      { id: 'sub_re_int', name: 'Interior Architecture & Design', industry_id: 'ind_re' },
    ],
  },
  {
    id: 'ind_ret',
    name: 'Retail & E-Commerce',
    sub_industries: [
      { id: 'sub_ret_d2c', name: 'D2C Brands', industry_id: 'ind_ret' },
      { id: 'sub_ret_omni', name: 'Omnichannel Retail Chains', industry_id: 'ind_ret' },
      { id: 'sub_ret_tex', name: 'Textile & Fashion Apparel', industry_id: 'ind_ret' },
      { id: 'sub_ret_fmcg', name: 'FMCG Packaged Goods', industry_id: 'ind_ret' },
      { id: 'sub_ret_elec', name: 'Consumer Electronics', industry_id: 'ind_ret' },
    ],
  },
  {
    id: 'ind_fin',
    name: 'Financial & Professional Services',
    sub_industries: [
      { id: 'sub_fin_wlth', name: 'Wealth Management & Advisory', industry_id: 'ind_fin' },
      { id: 'sub_fin_nbfc', name: 'NBFC & Business Lending', industry_id: 'ind_fin' },
      { id: 'sub_fin_ca', name: 'Chartered Accountancy & Tax', industry_id: 'ind_fin' },
      { id: 'sub_fin_legal', name: 'Legal & Corporate Compliance', industry_id: 'ind_fin' },
      { id: 'sub_fin_mgmt', name: 'Management Consulting', industry_id: 'ind_fin' },
    ],
  },
  {
    id: 'ind_hosp',
    name: 'Hospitality & Tourism',
    sub_industries: [
      { id: 'sub_hosp_htl', name: 'Hotels & Luxury Resorts', industry_id: 'ind_hosp' },
      { id: 'sub_hosp_qsr', name: 'Fine Dining & QSR Chains', industry_id: 'ind_hosp' },
      { id: 'sub_hosp_tour', name: 'Travel & Tour Operations', industry_id: 'ind_hosp' },
      { id: 'sub_hosp_evt', name: 'Event & Exhibition Management', industry_id: 'ind_hosp' },
    ],
  },
];

/**
 * Loading sample outreach leads writes invented companies and people into the
 * workspace, so it is allowed only where CRM_ALLOW_DEMO_SEED=true (a demo or
 * sandbox deployment). Off by default.
 */
export const isCrmDemoSeedAllowed = () => process.env.CRM_ALLOW_DEMO_SEED === 'true';

/**
 * The pipeline that leads converted from Client Outreach enter: each
 * workspace's pipeline with this code (codes are unique per workspace, set in
 * CRM Masters → Pipelines). There is no fallback to another pipeline.
 */
export const COLD_FUNNEL_PIPELINE_CODE = 'COLD_FUNNEL';

/** The related records a lead is listed with, on the board, in the list and in API answers. */
const LEAD_LIST_INCLUDE = {
  rndtechnosoft_crm_stages: true,
  rndtechnosoft_crm_pipelines: true,
  rndtechnosoft_crm_lead_sources: true,
  rndtechnosoft_crm_services_master: true,
  rndtechnosoft_tenant_members: {
    include: { rndtechnosoft_users: true },
  },
} satisfies Prisma.rndtechnosoft_crm_leadsInclude;

type LeadListRow = Prisma.rndtechnosoft_crm_leadsGetPayload<{ include: typeof LEAD_LIST_INCLUDE }>;

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: CrmLeadAssignmentService,
  ) {}

  private pagination(requestedPage?: number, requestedLimit?: number) {
    const page = Number.isInteger(requestedPage) && requestedPage! > 0 ? requestedPage! : 1;
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit!)) : 25;
    return { page, limit, skip: (page - 1) * limit };
  }

  private pageMeta(total: number, page: number, limit: number, itemCount = limit) {
    return { total, page, limit, totalPages: Math.ceil(total / limit), hasMore: (page - 1) * limit + itemCount < total };
  }

  private pageResult<T>(items: T[], total: number, page: number, limit: number) {
    return { items, ...this.pageMeta(total, page, limit, items.length) };
  }

  // ==========================================
  // PIPELINES & STAGES
  // ==========================================

  async getPipelines(tenantId: string, visibility: LeadVisibility) {
    const pipelines = await this.prisma.rndtechnosoft_crm_pipelines.findMany({
      where: { tenant_id: tenantId },
      orderBy: { sort_order: 'asc' },
      include: {
        rndtechnosoft_crm_stages: {
          orderBy: { sort_order: 'asc' },
          include: {
            _count: {
              select: { rndtechnosoft_crm_leads: true },
            },
          },
        },
      },
    });

    return Promise.all(
      pipelines.map(async (p) => {
        const stagesWithRollups = await Promise.all(
          p.rndtechnosoft_crm_stages.map(async (stg) => {
            const leads = await this.prisma.rndtechnosoft_crm_leads.findMany({
              where: { tenant_id: tenantId, stage_id: stg.id, is_lost: false, ...visibleLeads(visibility) },
              select: { budget_amount: true },
            });

            const grossValue = leads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
            const weightedValue = Math.round(grossValue * (stg.stage_probability / 100));

            return {
              ...stg,
              leadCount: leads.length,
              grossValue,
              weightedValue,
            };
          }),
        );

        return {
          ...p,
          stages: stagesWithRollups,
        };
      }),
    );
  }

  async createPipeline(tenantId: string, data: { name: string; code: string; isDefault?: boolean }) {
    return this.prisma.rndtechnosoft_crm_pipelines.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        name: data.name,
        code: data.code.toUpperCase(),
        is_default: data.isDefault || false,
      },
    });
  }

  // ==========================================
  // LEADS LIFECYCLE & DIRECTORY
  // ==========================================

  async getLeads(
    tenantId: string,
    visibility: LeadVisibility,
    query: {
      pipelineId?: string;
      stageId?: string;
      temperature?: string;
      sourceId?: string;
      assignedUserId?: string;
      industry?: string;
      subIndustry?: string;
      search?: string;
      origin?: string;
      service?: string;
      excludeOutreach?: boolean;
      isWon?: boolean;
      isLost?: boolean;
      page?: number;
      limit?: number;
      unpaginated?: boolean;
    },
  ) {
    const { page, limit, skip } = this.pagination(query.page, query.limit);
    const where: Prisma.rndtechnosoft_crm_leadsWhereInput = { tenant_id: tenantId };
    if (query.pipelineId) where.pipeline_id = query.pipelineId;
    if (query.stageId) where.stage_id = query.stageId;
    if (query.temperature && query.temperature !== 'ALL') where.temperature = query.temperature;
    if (query.sourceId) where.source_id = query.sourceId;
    if (query.assignedUserId) where.assigned_tenant_member_id = query.assignedUserId;
    if (query.industry && query.industry !== 'ALL') where.industry = query.industry;
    if (query.subIndustry && query.subIndustry !== 'ALL') where.sub_industry = query.subIndustry;
    if (typeof query.isWon === 'boolean') where.is_won = query.isWon;
    if (typeof query.isLost === 'boolean') where.is_lost = query.isLost;
    const conditions: Prisma.rndtechnosoft_crm_leadsWhereInput[] = [];
    if (query.origin === 'EXISTING') conditions.push({ OR: [{ is_existing_client: true }, { client_id: { not: null } }] });
    if (query.origin === 'NEW') conditions.push({ AND: [{ OR: [{ is_existing_client: false }, { is_existing_client: null }] }, { client_id: null }] });
    if (query.service && query.service !== 'ALL') where.primary_service = query.service;
    if (query.excludeOutreach) conditions.push({ OR: [
      { custom_attributes: { equals: Prisma.DbNull } },
      { custom_attributes: { path: ['cadence'], equals: Prisma.AnyNull } },
      { custom_attributes: { path: ['cadence', 'status'], equals: 'CONVERTED' } },
      { custom_attributes: { path: ['cadence', 'convertedToOpportunity'], equals: true } },
    ] });
    // Only the leads this member may see; an assignee filter narrows within them.
    if (!visibility.all) conditions.push(visibleLeads(visibility));
    if (conditions.length) where.AND = conditions;

    if (query.search) {
      where.OR = [
        { company_name: { contains: query.search, mode: 'insensitive' } },
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { lead_code: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { industry: { contains: query.search, mode: 'insensitive' } },
        { sub_industry: { contains: query.search, mode: 'insensitive' } },
        { primary_service: { contains: query.search, mode: 'insensitive' } },
        { rndtechnosoft_tenant_members: { rndtechnosoft_users: { display_name: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [rawLeads, total, stages, pipelines, sources, members, clients] = await Promise.all([
      this.prisma.rndtechnosoft_crm_leads.findMany({
        where,
        // Newest first, so a lead just added is always on the first page.
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...(query.unpaginated ? {} : { skip, take: limit }),
        include: LEAD_LIST_INCLUDE,
      }),
      this.prisma.rndtechnosoft_crm_leads.count({ where }),
      this.prisma.rndtechnosoft_crm_stages.findMany({
        where: { tenant_id: tenantId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.rndtechnosoft_crm_pipelines.findMany({
        where: { tenant_id: tenantId },
        orderBy: { sort_order: 'asc' },
      }),
      this.prisma.rndtechnosoft_crm_lead_sources.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
        include: { rndtechnosoft_users: true },
      }),
      this.prisma.rndtechnosoft_crm_clients.findMany({
        where: { tenant_id: tenantId },
        orderBy: { company_name: 'asc' },
        take: 100,
      }),
    ]);

    const salesPersons = members.map((m) => {
      const parts = (m.rndtechnosoft_users.display_name || 'Sales Rep').split(' ');
      return {
        id: m.id,
        user_id: m.user_id,
        first_name: parts[0] || 'User',
        last_name: parts.slice(1).join(' ') || '',
        name: m.rndtechnosoft_users.display_name,
        email: m.rndtechnosoft_users.email,
        designation: 'Sales Representative',
      };
    });

    const mappedLeads = rawLeads.map((l) => this.toLeadListItem(l));

    return {
      leads: mappedLeads,
      pagination: this.pageMeta(total, page, limit, mappedLeads.length),
      stages,
      pipelines,
      sources,
      salesPersons,
      clients,
    };
  }

  /** A lead as the board and the list show it. */
  private toLeadListItem(l: LeadListRow) {
    const assignedUser = l.rndtechnosoft_tenant_members?.rndtechnosoft_users;
    const userParts = (assignedUser?.display_name || '').split(' ');
    return {
      ...l,
      stage_name: l.rndtechnosoft_crm_stages?.name || 'New',
      stage_color: l.rndtechnosoft_crm_stages?.color || '#2563eb',
      stage_order: l.rndtechnosoft_crm_stages?.sort_order || 0,
      is_won: l.rndtechnosoft_crm_stages?.is_won || l.is_won,
      is_lost: l.rndtechnosoft_crm_stages?.is_lost || l.is_lost,
      pipeline_name: l.rndtechnosoft_crm_pipelines?.name || 'Default Pipeline',
      source_name: l.rndtechnosoft_crm_lead_sources?.name || 'Inbound',
      assigned_user_id: l.assigned_tenant_member_id,
      assigned_user_name: assignedUser?.display_name || 'Unassigned',
      assigned_user_first_name: userParts[0] || 'Unassigned',
      assigned_user_last_name: userParts.slice(1).join(' ') || '',
      assigned_user_email: assignedUser?.email || '',
      assigned_user_designation: 'Sales Representative',
      existing_client_name: l.company_name,
      existing_client_status: l.is_won ? 'ACTIVE' : 'PROSPECT',
    };
  }

  async getLeadById(tenantId: string, visibility: LeadVisibility, leadId: string) {
    const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) },
      include: {
        rndtechnosoft_crm_stages: true,
        rndtechnosoft_crm_pipelines: true,
        rndtechnosoft_crm_services_master: true,
        rndtechnosoft_crm_lead_sources: true,
        rndtechnosoft_tenant_members: {
          include: { rndtechnosoft_users: true },
        },
        rndtechnosoft_crm_lead_activities: {
          orderBy: { created_at: 'desc' },
          include: {
            rndtechnosoft_tenant_members: {
              include: { rndtechnosoft_users: true },
            },
          },
        },
        rndtechnosoft_crm_lead_followups: {
          orderBy: { scheduled_at: 'asc' },
        },
        rndtechnosoft_crm_meetings: {
          orderBy: { scheduled_at: 'desc' },
        },
        rndtechnosoft_crm_quotations: {
          orderBy: { created_at: 'desc' },
          include: { rndtechnosoft_crm_quotation_items: true },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead opportunity not found');
    }

    const assignedUser = lead.rndtechnosoft_tenant_members?.rndtechnosoft_users;
    return {
      ...lead,
      stage_name: lead.rndtechnosoft_crm_stages?.name,
      stage_color: lead.rndtechnosoft_crm_stages?.color,
      pipeline_name: lead.rndtechnosoft_crm_pipelines?.name,
      source_name: lead.rndtechnosoft_crm_lead_sources?.name,
      assigned_user_id: lead.assigned_tenant_member_id,
      assigned_user_name: assignedUser?.display_name || 'Unassigned',
      assigned_user_email: assignedUser?.email,
      activities: lead.rndtechnosoft_crm_lead_activities.map((a) => ({
        ...a,
        created_by_name: a.rndtechnosoft_tenant_members?.rndtechnosoft_users?.display_name || 'System',
      })),
      followups: lead.rndtechnosoft_crm_lead_followups,
      meetings: lead.rndtechnosoft_crm_meetings,
      quotations: lead.rndtechnosoft_crm_quotations.map((q) => ({
        ...q,
        status: q.quotation_status,
        total_amount: Number(q.total_amount),
        items: q.rndtechnosoft_crm_quotation_items,
      })),
    };
  }

  /**
   * The pipeline and stage a new lead goes into: those requested, when they are
   * this workspace's and the stage is in that pipeline, or the default sales
   * pipeline's first stage. A workspace without one is told how to fix it.
   */
  private async leadPlacement(tenantId: string, requestedPipelineId?: string, requestedStageId?: string) {
    const pipeline = requestedPipelineId
      ? await this.prisma.rndtechnosoft_crm_pipelines.findFirst({ where: { tenant_id: tenantId, id: requestedPipelineId }, select: { id: true } })
      : await this.prisma.rndtechnosoft_crm_pipelines.findFirst({ where: { tenant_id: tenantId, pipeline_kind: 'SALES' }, orderBy: { is_default: 'desc' }, select: { id: true } });
    if (!pipeline) {
      throw new BadRequestException(
        requestedPipelineId ? 'That pipeline does not exist in this workspace.' : 'Create a sales pipeline with at least one stage (CRM Masters → Pipelines) before adding leads.',
      );
    }
    const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
      where: { tenant_id: tenantId, pipeline_id: pipeline.id, ...(requestedStageId ? { id: requestedStageId } : {}) },
      orderBy: { sort_order: 'asc' },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException(requestedStageId ? 'That stage is not in the chosen pipeline.' : 'Add at least one stage to the pipeline before adding leads.');
    }
    return { pipelineId: pipeline.id, stageId: stage.id };
  }

  /**
   * Creates a record with a free <prefix>-<year>-<number> code (lead, client,
   * quotation), retrying if another record took the same number meanwhile.
   */
  private async withUniqueCode<T>(prefix: string, create: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const code = `${prefix}-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
      try {
        return await create(code);
      } catch (error) {
        const isCodeClash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          /lead_code|client_code|quotation_number|uq_crm_leads_code|uq_crm_clients_code|uq_crm_quotations_number/.test(JSON.stringify(error.meta?.target ?? ''));
        if (!isCodeClash || attempt >= 4) throw error;
      }
    }
  }

  /**
   * `outreachFunnel` names the Client Outreach pipeline a COLD lead is enrolled
   * through; `createdVia` says where the lead came from in its activity log;
   * `firstNameOptional` lets a lead without a contact name in (spreadsheet
   * imports, which require a phone instead).
   */
  async createLead(tenantId: string, data: any, memberId?: string, options: { outreachFunnel?: string; createdVia?: string; firstNameOptional?: boolean } = {}) {
    const leadId = randomUUID();
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
    const companyName = text(data.companyName ?? data.company_name);
    const firstName = text(data.firstName ?? data.first_name);
    const email = text(data.email)?.toLowerCase() ?? null;
    const missing = [!companyName && 'company name', !firstName && !options.firstNameOptional && 'first name', !email && 'email'].filter(Boolean);
    if (missing.length > 0) throw new BadRequestException(`A lead needs a ${missing.join(', ')}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) throw new BadRequestException('Enter a valid email address for the lead.');

    const { pipelineId, stageId } = await this.leadPlacement(tenantId, data.pipelineId || data.pipeline_id, data.stageId || data.stage_id);
    // A lead given to someone else on creation goes only to an eligible member of this workspace.
    const chosenAssignee = text(data.assignedTenantMemberId) ?? text(data.assigned_user_id);
    if (chosenAssignee && chosenAssignee !== memberId) await this.assignments.eligibleAssignee(this.prisma, tenantId, chosenAssignee);

    const temperature = data.temperature || 'WARM';
    let customAttributes = data.customAttributes || data.custom_attributes;

    // Auto-enroll COLD leads into 30-day cadence
    if (temperature === 'COLD' && (!customAttributes || !customAttributes.cadence)) {
      const now = new Date();
      const [firstStep] = await this.getCadenceSteps(tenantId);
      const dueDate = computeStepDueDate(now, firstStep?.dayOffset || 0);
      customAttributes = {
        ...(customAttributes || {}),
        cadence: {
          funnelName: options.outreachFunnel ?? 'RND Gold Funnel',
          status: 'ACTIVE',
          industry: data.industry || 'general',
          enrolledAt: now.toISOString(),
          currentStepIndex: 0,
          currentDay: 1,
          nextDueAt: dueDate.toISOString(),
          completedSteps: [],
        },
      };
    }

    const lead = await this.withUniqueCode('LD', (leadCode) => this.prisma.rndtechnosoft_crm_leads.create({
      data: {
        id: leadId,
        tenant_id: tenantId,
        lead_code: leadCode,
        company_name: companyName!,
        first_name: firstName,
        last_name: data.lastName || data.last_name || null,
        designation: data.designation || null,
        email: email!,
        phone: text(data.phone),
        whatsapp_number: data.whatsappNumber || data.whatsapp_number || data.phone || null,
        alternate_email: data.alternateEmail || data.alternate_email || null,
        alternate_phone: data.alternatePhone || data.alternate_phone || null,
        website_url: data.websiteUrl || data.website_url || null,
        linkedin_url: data.linkedinUrl || data.linkedin_url || null,
        linkedin_company_url: data.linkedinCompanyUrl || data.linkedin_company_url || null,
        website_status: text(data.websiteStatus ?? data.website_status),
        city: data.city || null,
        state: data.state || null,
        address: data.address || null,
        postal_code: data.postalCode || data.postal_code || null,
        country_code: data.countryCode || data.country_code || 'IN',
        industry: text(data.industry),
        sub_industry: data.subIndustry || data.sub_industry || null,
        primary_service_id: data.primaryServiceId || data.primary_service_id || null,
        primary_service: data.primaryService || data.primary_service || null,
        requirement_brief: data.requirementBrief || data.requirement_brief || null,
        internal_notes: data.internalNotes || data.internal_notes || null,
        budget_amount: data.budgetAmount || data.budget_amount ? new Prisma.Decimal(data.budgetAmount || data.budget_amount) : new Prisma.Decimal(0),
        currency_code: data.currencyCode || data.currency_code || 'INR',
        pipeline_id: pipelineId,
        stage_id: stageId,
        source_id: data.sourceId || data.source_id || null,
        assigned_tenant_member_id: data.assignedTenantMemberId || data.assigned_user_id || memberId || null,
        temperature,
        ai_score: data.aiScore || data.ai_score || 50,
        win_probability: data.winProbability ? new Prisma.Decimal(data.winProbability) : new Prisma.Decimal(20),
        urgency: data.urgency || 'MEDIUM',
        custom_attributes: customAttributes || undefined,
        cadence_step: 1,
      },
    }));

    // Record creation activity
    await this.logActivity(tenantId, lead.id, 'NOTE', 'Lead Created', `Lead account created via ${options.createdVia ?? 'CRM Workspace'}`, memberId);
    await this.logAudit(tenantId, 'CREATE', 'LEAD', lead.id, { company_name: lead.company_name, lead_code: lead.lead_code }, memberId);

    return lead;
  }

  async updateLead(tenantId: string, visibility: LeadVisibility, id: string, data: any, memberId?: string) {
    const existing = await this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id, ...visibleLeads(visibility) },
    });
    if (!existing) throw new NotFoundException('Lead not found');

    const updateData: any = {};
    if (data.companyName !== undefined || data.company_name !== undefined) updateData.company_name = data.companyName || data.company_name;
    if (data.firstName !== undefined || data.first_name !== undefined) updateData.first_name = data.firstName || data.first_name;
    if (data.lastName !== undefined || data.last_name !== undefined) updateData.last_name = data.lastName || data.last_name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.whatsappNumber !== undefined || data.whatsapp_number !== undefined) updateData.whatsapp_number = data.whatsappNumber || data.whatsapp_number;
    if (data.websiteUrl !== undefined || data.website_url !== undefined) updateData.website_url = data.websiteUrl || data.website_url;
    if (data.linkedinUrl !== undefined || data.linkedin_url !== undefined) updateData.linkedin_url = data.linkedinUrl || data.linkedin_url;
    if (data.linkedinCompanyUrl !== undefined || data.linkedin_company_url !== undefined) updateData.linkedin_company_url = data.linkedinCompanyUrl || data.linkedin_company_url;
    if (data.primaryService !== undefined || data.primary_service !== undefined) updateData.primary_service = data.primaryService || data.primary_service;
    if (data.designation !== undefined) updateData.designation = data.designation;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.postalCode !== undefined || data.postal_code !== undefined) updateData.postal_code = data.postalCode || data.postal_code;
    if (data.gstin !== undefined) updateData.gstin = data.gstin;
    if (data.pan !== undefined) updateData.pan = data.pan;
    if (data.industry !== undefined) updateData.industry = data.industry;
    if (data.subIndustry !== undefined || data.sub_industry !== undefined) updateData.sub_industry = data.subIndustry || data.sub_industry;
    if (data.requirementBrief !== undefined || data.requirement_brief !== undefined) updateData.requirement_brief = data.requirementBrief || data.requirement_brief;
    if (data.internalNotes !== undefined || data.internal_notes !== undefined) updateData.internal_notes = data.internalNotes || data.internal_notes;
    if (data.budgetAmount !== undefined || data.budget_amount !== undefined) updateData.budget_amount = new Prisma.Decimal(data.budgetAmount || data.budget_amount);
    if (data.temperature !== undefined) updateData.temperature = data.temperature;
    if (data.urgency !== undefined) updateData.urgency = data.urgency;
    if (data.isWon !== undefined || data.is_won !== undefined) updateData.is_won = data.isWon ?? data.is_won;
    if (data.isLost !== undefined || data.is_lost !== undefined) updateData.is_lost = data.isLost ?? data.is_lost;
    if (data.aiScore !== undefined || data.ai_score !== undefined) updateData.ai_score = Number(data.aiScore || data.ai_score);
    if (data.winProbability !== undefined || data.win_probability !== undefined) updateData.win_probability = new Prisma.Decimal(data.winProbability || data.win_probability);
    // A new assignee must be an eligible member of this workspace; the change goes on the lead's activity.
    let assignmentNote: string | null = null;
    const assigneeField = data.assignedUserId !== undefined ? data.assignedUserId : data.assigned_user_id;
    if (assigneeField !== undefined) {
      const next: string | null = typeof assigneeField === 'string' && assigneeField.trim() ? assigneeField.trim() : null;
      if (next !== existing.assigned_tenant_member_id) {
        const assignee = next ? await this.assignments.eligibleAssignee(this.prisma, tenantId, next) : null;
        updateData.assigned_tenant_member_id = next;
        assignmentNote = assignee ? `Assigned to ${assignee.name}` : 'Unassigned';
      }
    }
    if (data.pipelineId !== undefined || data.pipeline_id !== undefined) updateData.pipeline_id = data.pipelineId || data.pipeline_id;
    if (data.customAttributes !== undefined || data.custom_attributes !== undefined) updateData.custom_attributes = data.customAttributes || data.custom_attributes;

    const targetStageId = data.stageId || data.stage_id;
    if (targetStageId && targetStageId !== existing.stage_id) {
      updateData.stage_id = targetStageId;
      updateData.stage_entered_at = new Date();

      const stageInfo = await this.prisma.rndtechnosoft_crm_stages.findFirst({
        where: { tenant_id: tenantId, id: targetStageId },
      });
      if (stageInfo) {
        if (stageInfo.is_won) {
          updateData.is_won = true;
          updateData.temperature = 'WON';
          updateData.closed_at = new Date();
        } else if (stageInfo.is_lost) {
          updateData.is_lost = true;
          updateData.temperature = 'LOST';
          updateData.closed_at = new Date();
        }
      }

      await this.logActivity(
        tenantId,
        id,
        'STAGE_CHANGE',
        `Stage updated to ${stageInfo?.name || targetStageId}`,
        `Moved stage from ${existing.stage_id} to ${targetStageId}`,
        memberId,
      );
    }

    const updated = await this.prisma.rndtechnosoft_crm_leads.update({
      where: { id },
      data: updateData,
    });

    if (assignmentNote) await this.logActivity(tenantId, id, 'ASSIGNMENT', assignmentNote, undefined, memberId);
    await this.logAudit(tenantId, 'UPDATE', 'LEAD', id, updateData, memberId);
    return updated;
  }

  async deleteLead(tenantId: string, visibility: LeadVisibility, id: string, memberId?: string) {
    const existing = await this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id, ...visibleLeads(visibility) },
    });
    if (!existing) throw new NotFoundException('Lead not found');

    await this.prisma.rndtechnosoft_crm_lead_activities.deleteMany({ where: { lead_id: id } });
    await this.prisma.rndtechnosoft_crm_lead_followups.deleteMany({ where: { lead_id: id } });
    await this.prisma.rndtechnosoft_crm_meetings.deleteMany({ where: { lead_id: id } });

    await this.prisma.rndtechnosoft_crm_leads.delete({ where: { id } });
    await this.logAudit(tenantId, 'DELETE', 'LEAD', id, { company_name: existing.company_name }, memberId);

    return { success: true };
  }

  async bulkLeadAction(
    tenantId: string,
    visibility: LeadVisibility,
    body: {
      action: string;
      leadIds: string[];
      assignedUserId?: string;
      stageId?: string;
    },
    memberId?: string,
  ) {
    const { action, leadIds, assignedUserId, stageId } = body;
    if (!leadIds || leadIds.length === 0) return { count: 0 };
    await this.assertLeadsVisible(tenantId, visibility, leadIds);

    // Reassigning is handled by CrmLeadAssignmentService (checked and all-or-nothing).
    if (action === 'delete') {
      await this.prisma.rndtechnosoft_crm_leads.deleteMany({
        where: { tenant_id: tenantId, id: { in: leadIds } },
      });
      await this.logAudit(tenantId, 'BULK_DELETE', 'LEAD', leadIds[0], { leadIds }, memberId);
    } else if (action === 'stage_change' && stageId) {
      await this.prisma.rndtechnosoft_crm_leads.updateMany({
        where: { tenant_id: tenantId, id: { in: leadIds } },
        data: { stage_id: stageId, stage_entered_at: new Date() },
      });
      await this.logAudit(tenantId, 'BULK_STAGE_CHANGE', 'LEAD', leadIds[0], { leadIds, stageId }, memberId);
    } else {
      // Never report success for an action that did nothing.
      throw new BadRequestException('This bulk action is not available.');
    }

    return { success: true, count: leadIds.length };
  }

  // ==========================================
  // LEAD IMPORT / EXPORT / TEMPLATE
  // ==========================================

  async generateLeadImportTemplate(tenantId: string): Promise<Buffer> {
    // 1. Fetch Tenant's Dynamic Industries & Sub-Industries
    let industriesList: string[] = [];
    let subIndustriesList: string[] = [];

    const tenantSetting = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
    });
    const settingsJson: any = (tenantSetting?.settings as any) || {};
    const configuredIndustries: any[] = settingsJson.industries || [];

    if (configuredIndustries.length > 0) {
      industriesList = configuredIndustries.map((i: any) => i.name).filter(Boolean);
      configuredIndustries.forEach((i: any) => {
        if (Array.isArray(i.sub_industries)) {
          i.sub_industries.forEach((s: any) => {
            const subName = typeof s === 'string' ? s : s.name;
            if (subName && !subIndustriesList.includes(subName)) {
              subIndustriesList.push(subName);
            }
          });
        }
      });
    }

    if (industriesList.length === 0) {
      industriesList = BASELINE_INDUSTRIES.map((i) => i.name);
      BASELINE_INDUSTRIES.forEach((i) => {
        i.sub_industries.forEach((s) => {
          if (!subIndustriesList.includes(s.name)) {
            subIndustriesList.push(s.name);
          }
        });
      });
    }

    // 2. Fetch Tenant's Lead Sources
    const sourcesRows = await this.prisma.rndtechnosoft_crm_lead_sources.findMany({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: { sort_order: 'asc' },
    });
    let sourcesList = sourcesRows.map((s) => s.name);
    if (sourcesList.length === 0) {
      sourcesList = [
        'Cold Outreach (Outbound SOP)',
        'IndiaMART',
        'TradeIndia',
        'Google My Business',
        'Justdial',
        'Inbound Website Form',
        'LinkedIn Outreach',
        'Referral & Network',
        'Direct Phone / WhatsApp',
      ];
    }

    // 3. Fetch Tenant's Active Team Members
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
      include: {
        rndtechnosoft_users: true,
        rndtechnosoft_tenant_member_roles: {
          include: { rndtechnosoft_roles: true },
        },
      },
    });

    let usersList = members.map((m) => {
      const u = m.rndtechnosoft_users;
      const r = m.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles;
      return `${u.display_name}${r?.role_name ? ` (${r.role_name})` : ''}`;
    }).filter(Boolean);

    if (usersList.length === 0) {
      usersList = ['Ravi Shah (Admin)', 'Rahul Verma (Sales Head)'];
    }

    const INDIAN_STATES = [
      'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi NCR', 'Goa', 'Gujarat', 
      'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 
      'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 
      'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'
    ];

    const COUNTRIES = [
      'India', 'United States', 'United Arab Emirates', 'United Kingdom', 
      'Singapore', 'Canada', 'Australia', 'Germany', 'Saudi Arabia', 'Other'
    ];

    const WEBSITE_STATUSES = [
      'ACTIVE', 'INACTIVE', 'NO_WEBSITE', 'UNDER_CONSTRUCTION', 'REDIRECT'
    ];

    const countryCodesList = SORTED_COUNTRY_CODES.map((c) => `${c.code} (${c.flag} ${c.name})`);

    // 4. Build Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Voogyo CRM & ERP';
    workbook.lastModifiedBy = 'Voogyo CRM';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Leads_Import_Template', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    const refWs = workbook.addWorksheet('CRM_Masters', {
      views: [{ showGridLines: true }],
    });

    refWs.columns = [
      { header: 'Allowed Industries', key: 'industries', width: 35 },
      { header: 'Allowed Sub-Industries', key: 'sub_industries', width: 35 },
      { header: 'Allowed Lead Sources', key: 'sources', width: 35 },
      { header: 'States & Regions', key: 'states', width: 25 },
      { header: 'Countries', key: 'countries', width: 25 },
      { header: 'Temperatures', key: 'temperatures', width: 18 },
      { header: 'Urgency Levels', key: 'urgencies', width: 18 },
      { header: 'Country Calling Codes', key: 'country_codes', width: 30 },
      { header: 'Website Statuses', key: 'website_statuses', width: 22 },
      { header: 'Assigned Team Members', key: 'assigned_users', width: 32 },
    ];

    const refHeaderRow = refWs.getRow(1);
    refHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    refHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    refHeaderRow.height = 25;
    refHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const maxRefRows = Math.max(
      industriesList.length,
      subIndustriesList.length,
      sourcesList.length,
      INDIAN_STATES.length,
      COUNTRIES.length,
      countryCodesList.length,
      WEBSITE_STATUSES.length,
      usersList.length,
    );

    for (let r = 0; r < maxRefRows; r++) {
      refWs.addRow([
        industriesList[r] || '',
        subIndustriesList[r] || '',
        sourcesList[r] || '',
        INDIAN_STATES[r] || '',
        COUNTRIES[r] || '',
        r === 0 ? 'HOT' : r === 1 ? 'WARM' : r === 2 ? 'COLD' : '',
        r === 0 ? 'HIGH' : r === 1 ? 'MEDIUM' : r === 2 ? 'LOW' : '',
        countryCodesList[r] || '',
        WEBSITE_STATUSES[r] || '',
        usersList[r] || '',
      ]);
    }

    ws.columns = [
      { header: 'Date Created', key: 'date_created', width: 16 },
      { header: 'Company Name *', key: 'company_name', width: 28 },
      { header: 'First Name *', key: 'first_name', width: 18 },
      { header: 'Last Name', key: 'last_name', width: 18 },
      { header: 'Designation', key: 'designation', width: 22 },
      { header: 'Email *', key: 'email', width: 28 },
      { header: 'Secondary Email', key: 'secondary_email', width: 28 },
      { header: 'Country Code *', key: 'country_code', width: 24 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Alternate Phone', key: 'alternate_phone', width: 20 },
      { header: 'WhatsApp Number', key: 'whatsapp_number', width: 20 },
      { header: 'Industry *', key: 'industry', width: 30 },
      { header: 'Sub Industry', key: 'sub_industry', width: 30 },
      { header: 'Website URL', key: 'website_url', width: 28 },
      { header: 'LinkedIn Company URL', key: 'linkedin_company_url', width: 30 },
      { header: 'Personal LinkedIn URL', key: 'personal_linkedin_url', width: 30 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 22 },
      { header: 'Country', key: 'country', width: 18 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'Pincode', key: 'pincode', width: 16 },
      { header: 'Website Status', key: 'website_status', width: 20 },
      { header: 'Assigned To', key: 'assigned_to', width: 28 },
      { header: 'Lead Source', key: 'lead_source', width: 28 },
      { header: 'Budget Amount', key: 'budget_amount', width: 20 },
      { header: 'Internal Notes', key: 'internal_notes', width: 36 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4338CA' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // In-Cell Dropdown Validations
    (ws as any).dataValidations.add('H2:H1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$H$2:$H$${countryCodesList.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Country Code',
      error: 'Please select a country code from the dropdown list.',
    });

    (ws as any).dataValidations.add('L2:L1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$A$2:$A$${industriesList.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Industry',
      error: 'Please select an industry from the dropdown list.',
    });

    (ws as any).dataValidations.add('M2:M1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$B$2:$B$${subIndustriesList.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Sub-Industry',
      error: 'Please select a sub-industry from the dropdown list.',
    });

    (ws as any).dataValidations.add('R2:R1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$D$2:$D$${INDIAN_STATES.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid State',
      error: 'Please select a state from the dropdown.',
    });

    (ws as any).dataValidations.add('S2:S1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$E$2:$E$${COUNTRIES.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Country',
      error: 'Please select a country from the dropdown.',
    });

    (ws as any).dataValidations.add('V2:V1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$I$2:$I$${WEBSITE_STATUSES.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Website Status',
      error: 'Please select ACTIVE, INACTIVE, NO_WEBSITE, UNDER_CONSTRUCTION, or REDIRECT.',
    });

    (ws as any).dataValidations.add('W2:W1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$J$2:$J$${usersList.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Assignee',
      error: 'Please select an active team member from the dropdown list.',
    });

    (ws as any).dataValidations.add('X2:X1000', {
      type: 'list',
      allowBlank: true,
      formulae: [`CRM_Masters!$C$2:$C$${sourcesList.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Source',
      error: 'Please select a valid lead source from the dropdown.',
    });

    // Add 3 realistic sample rows
    ws.addRow({
      date_created: '2026-03-20',
      company_name: 'Apex Polymer Industries',
      first_name: 'Rajesh',
      last_name: 'Shah',
      designation: 'Managing Director',
      email: 'rajesh@apexpolymer.com',
      secondary_email: 'accounts@apexpolymer.com',
      country_code: '+91 (🇮🇳 India)',
      phone: '98250 12345',
      alternate_phone: '079 2650 1234',
      whatsapp_number: '98250 12345',
      industry: 'Manufacturing',
      sub_industry: 'Plastic',
      website_url: 'https://apexpolymer.com',
      linkedin_company_url: 'https://linkedin.com/company/apex-polymer',
      personal_linkedin_url: 'https://linkedin.com/in/rajesh-shah-apex',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      address: 'Plot 42, GIDC Industrial Estate, Phase 2, Vatva',
      pincode: '382445',
      website_status: 'ACTIVE',
      assigned_to: usersList[0] || 'Ravi Shah',
      lead_source: sourcesList[0] || 'Cold Outreach (Outbound SOP)',
      budget_amount: 750000,
      internal_notes: 'Urgent requirement for ERP production scheduling and automated quotation engine',
    });

    ws.addRow({
      date_created: '2026-03-19',
      company_name: 'Zenith BioTech Labs',
      first_name: 'Dr. Ananya',
      last_name: 'Iyer',
      designation: 'Head of Procurement',
      email: 'ananya.iyer@zenithbiotech.in',
      secondary_email: 'purchase@zenithbiotech.in',
      country_code: '+91 (🇮🇳 India)',
      phone: '98401 67890',
      alternate_phone: '080 4123 5678',
      whatsapp_number: '98401 67890',
      industry: 'Healthcare & Medical',
      sub_industry: 'Pharmaceuticals & Biotech',
      website_url: 'https://zenithbiotech.in',
      linkedin_company_url: 'https://linkedin.com/company/zenith-biotech',
      personal_linkedin_url: 'https://linkedin.com/in/dr-ananya-iyer',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      address: '7th Floor, Bio-Innovation Hub, Electronic City Phase 1',
      pincode: '560100',
      website_status: 'ACTIVE',
      assigned_to: usersList[1] || usersList[0] || 'Ravi Shah',
      lead_source: sourcesList.find((s) => s.includes('IndiaMART')) || sourcesList[1] || 'IndiaMART',
      budget_amount: 1200000,
      internal_notes: 'Looking for LIMS inventory & laboratory batch compliance tracking',
    });

    ws.addRow({
      date_created: '2026-03-18',
      company_name: 'Precision Wire & Cable Corp',
      first_name: 'Amit',
      last_name: 'Patel',
      designation: 'VP Operations',
      email: 'amit@precisionwire.co.in',
      secondary_email: 'ops@precisionwire.co.in',
      country_code: '+91 (🇮🇳 India)',
      phone: '98980 45678',
      alternate_phone: '0265 245 8900',
      whatsapp_number: '98980 45678',
      industry: 'Manufacturing',
      sub_industry: 'Engineering Wire',
      website_url: 'https://precisionwire.co.in',
      linkedin_company_url: 'https://linkedin.com/company/precision-wire-corp',
      personal_linkedin_url: 'https://linkedin.com/in/amit-patel',
      city: 'Vadodara',
      state: 'Gujarat',
      country: 'India',
      address: 'Survey No. 118, Makarpura GIDC Industrial Area',
      pincode: '390010',
      website_status: 'ACTIVE',
      assigned_to: usersList[0] || 'Ravi Shah',
      lead_source: sourcesList.find((s) => s.includes('TradeIndia')) || sourcesList[2] || 'TradeIndia',
      budget_amount: 500000,
      internal_notes: 'Needs sales pipeline management and client WhatsApp cadence engine',
    });

    for (let i = 2; i <= 4; i++) {
      const row = ws.getRow(i);
      row.height = 24;
      row.alignment = { vertical: 'middle' };
      row.font = { name: 'Arial', size: 10 };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportLeads(tenantId: string, visibility: LeadVisibility, filters: any): Promise<Buffer> {
    const leadsResult = await this.getLeads(tenantId, visibility, { ...filters, unpaginated: true });
    const leads = Array.isArray(leadsResult) ? leadsResult : (leadsResult.leads || []);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Voogyo CRM & ERP';
    workbook.lastModifiedBy = 'Voogyo CRM';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('CRM_Leads_Export', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    ws.columns = [
      { header: 'Date Created', key: 'date_created', width: 16 },
      { header: 'Company Name *', key: 'company_name', width: 28 },
      { header: 'First Name *', key: 'first_name', width: 18 },
      { header: 'Last Name', key: 'last_name', width: 18 },
      { header: 'Designation', key: 'designation', width: 22 },
      { header: 'Email *', key: 'email', width: 28 },
      { header: 'Secondary Email', key: 'secondary_email', width: 28 },
      { header: 'Country Code *', key: 'country_code', width: 24 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Alternate Phone', key: 'alternate_phone', width: 20 },
      { header: 'WhatsApp Number', key: 'whatsapp_number', width: 20 },
      { header: 'Industry *', key: 'industry', width: 30 },
      { header: 'Sub Industry', key: 'sub_industry', width: 30 },
      { header: 'Website URL', key: 'website_url', width: 28 },
      { header: 'LinkedIn Company URL', key: 'linkedin_company_url', width: 30 },
      { header: 'Personal LinkedIn URL', key: 'personal_linkedin_url', width: 30 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 22 },
      { header: 'Country', key: 'country', width: 18 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'Pincode', key: 'pincode', width: 16 },
      { header: 'Website Status', key: 'website_status', width: 20 },
      { header: 'Assigned To', key: 'assigned_to', width: 28 },
      { header: 'Lead Source', key: 'lead_source', width: 28 },
      { header: 'Budget Amount', key: 'budget_amount', width: 20 },
      { header: 'Internal Notes', key: 'internal_notes', width: 36 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E1B4B' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    leads.forEach((l: any) => {
      const parsedPhone = parsePhoneWithCountryCode(l.phone || '');
      const parsedAltPhone = parsePhoneWithCountryCode(l.alternate_phone || '');
      const parsedWa = parsePhoneWithCountryCode(l.whatsapp_number || '');

      let dateCreated = '';
      if (l.created_at) {
        try {
          dateCreated = new Date(l.created_at).toISOString().slice(0, 10);
        } catch {
          dateCreated = String(l.created_at).slice(0, 10);
        }
      }

      // The lead's own values only; an empty field stays empty.
      const country = SORTED_COUNTRY_CODES.find((c) => c.iso === l.country_code);
      ws.addRow({
        date_created: dateCreated,
        company_name: l.company_name || '',
        first_name: l.first_name || '',
        last_name: l.last_name || '',
        designation: l.designation || '',
        email: l.email || '',
        secondary_email: l.alternate_email || '',
        country_code: (l.phone && parsedPhone.countryCode) || country?.code || '',
        phone: parsedPhone.number || l.phone || '',
        alternate_phone: parsedAltPhone.number || l.alternate_phone || '',
        whatsapp_number: parsedWa.number || l.whatsapp_number || '',
        industry: l.industry || '',
        sub_industry: l.sub_industry || '',
        website_url: l.website_url || '',
        linkedin_company_url: l.linkedin_company_url || '',
        personal_linkedin_url: l.linkedin_url || '',
        city: l.city || '',
        state: l.state || '',
        country: country?.name || '',
        address: l.address || '',
        pincode: l.postal_code || '',
        website_status: l.website_status || '',
        assigned_to: l.rndtechnosoft_tenant_members?.rndtechnosoft_users?.display_name || '',
        lead_source: l.rndtechnosoft_crm_lead_sources?.name || '',
        budget_amount: Number(l.budget_amount) || 0,
        internal_notes: l.internal_notes || l.requirement_brief || '',
      });
    });

    const totalRows = ws.rowCount;
    for (let i = 2; i <= totalRows; i++) {
      const row = ws.getRow(i);
      row.height = 24;
      row.alignment = { vertical: 'middle' };
      row.font = { name: 'Arial', size: 10 };
      if (i % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async handleInboundWebhook(tenantId: string, payload: any) {
    const defaultPipe = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
      where: { tenant_id: tenantId, pipeline_kind: 'SALES' },
      orderBy: { is_default: 'desc' },
    });
    const defaultStage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
      where: { tenant_id: tenantId, pipeline_id: defaultPipe?.id },
      orderBy: { sort_order: 'asc' },
    });

    // Only what the sender provided: a lead without a company, name or email is refused, not invented.
    const companyName = payload.company_name || payload.company || payload.sender_company || null;
    const firstName = payload.first_name || payload.name?.split(' ')[0] || payload.sender_name || null;
    const lastName = payload.last_name || payload.name?.split(' ').slice(1).join(' ') || '';
    const email = payload.email || payload.sender_email || null;
    const phone = payload.phone || payload.mobile || payload.sender_mobile || null;
    const requirement = payload.requirement || payload.query || payload.message || payload.brief || '';
    const sourceName = payload.source || payload.channel || 'Inbound Webhook';

    const lead = await this.createLead(
      tenantId,
      {
        company_name: companyName,
        first_name: firstName,
        last_name: lastName || null,
        email,
        phone,
        whatsapp_number: phone,
        industry: payload.industry || null,
        city: payload.city || null,
        state: payload.state || null,
        budget_amount: Number(payload.budget) || 0,
        temperature: 'HOT',
        pipeline_id: defaultPipe?.id,
        stage_id: defaultStage?.id,
      },
    );

    await this.logAudit(tenantId, 'WEBHOOK_INGEST', 'LEAD', lead.id, { sourceName, payload });
    return lead;
  }

  async convertDealWon(tenantId: string, visibility: LeadVisibility, leadId: string, memberId?: string) {
    const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    // 1. Ensure Client record exists
    let client = await this.prisma.rndtechnosoft_crm_clients.findFirst({
      where: { tenant_id: tenantId, company_name: lead.company_name },
    });
    const clientCreated = !client;

    if (!client) {
      client = await this.withUniqueCode('CL', (clientCode) => this.prisma.rndtechnosoft_crm_clients.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          client_code: clientCode,
          company_name: lead.company_name,
          // A lead imported without a contact name is reached by its email.
          contact_person: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email,
          email: lead.email,
          phone: lead.phone,
          billing_address: lead.address || lead.city || null,
          gstin: lead.gstin,
          pan: lead.pan,
          client_status: 'ACTIVE',
          created_from_lead_id: lead.id,
        },
      }));
    }

    // 2. Find WON stage if present
    const wonStage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
      where: { tenant_id: tenantId, is_won: true },
    });

    // 3. Mark Lead Won
    await this.prisma.rndtechnosoft_crm_leads.update({
      where: { id: lead.id },
      data: {
        is_won: true,
        temperature: 'WON',
        stage_id: wonStage?.id || lead.stage_id,
        converted_client_id: client.id,
        closed_at: new Date(),
      },
    });

    // Only what actually happened: no project or invoice exists yet, so none is named.
    const outcome = `client ${client.client_code} ${clientCreated ? 'created' : 'linked'}`;
    await this.logActivity(
      tenantId,
      lead.id,
      'STATUS_CHANGE',
      `Deal won — ${outcome}`,
      `${client.company_name} (${client.client_code}) ${clientCreated ? 'was created as a client' : 'was already a client and is now linked to this deal'}.`,
      memberId,
    );

    await this.logAudit(
      tenantId,
      'CONVERT_WON',
      'LEAD',
      lead.id,
      { clientId: client.id, clientCode: client.client_code, clientCreated },
      memberId,
    );

    return {
      clientId: client.id,
      clientCode: client.client_code,
      clientCreated,
    };
  }

  // ==========================================
  // 30-DAY OUTREACH CADENCE ENGINE
  // ==========================================

  async getCadenceMatrix(tenantId: string, visibility: LeadVisibility, leadId?: string, filterStatus: string = 'ALL', query: Partial<CadenceQueryDto> = {}) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { tenant_code: true },
    });
    const tenantName = tenant?.tenant_code || 'Voogyo';

    if (leadId) {
      const lead = await this.getLeadById(tenantId, visibility, leadId);
      const customAttr = (lead.custom_attributes as any) || {};
      return {
        lead,
        cadence: customAttr.cadence || null,
        masterSteps: await this.getCadenceSteps(tenantId),
        replyBranches: await this.getReplyBranches(tenantId),
        industries: CADENCE_INDUSTRIES,
      };
    }

    const steps = await this.getCadenceSteps(tenantId);
    const { page, limit, skip } = this.pagination(query.page, Math.min(query.limit ?? 50, 50));
    const normalize = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const matchesTaxonomy = (value: string, filter?: string) => !filter || filter === 'ALL' || normalize(value) === normalize(filter);
    const stats = { totalEnrolled: 0, activeCount: 0, dueTodayCount: 0, overdueCount: 0, completedCount: 0, branchedCount: 0, convertedCount: 0,
      platformCounts: { WHATSAPP: 0, EMAIL: 0, LINKEDIN: 0, PHONE: 0 } };
    const industryCounts: Record<string, number> = {};
    const subIndustryCounts: Record<string, number> = {};
    const pageIds: string[] = [];
    let total = 0;
    let enrolledCount = 0;
    const where: Prisma.rndtechnosoft_crm_leadsWhereInput = { tenant_id: tenantId, ...visibleLeads(visibility) };
    const search = query.search?.trim();
    if (search) {
      where.OR = ['company_name', 'first_name', 'last_name', 'email', 'phone', 'whatsapp_number', 'lead_code', 'industry', 'sub_industry'].map(field => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }
    // ponytail: scan compact metadata in bounded batches for JSON cadence rules and totals;
    // move classification into indexed relational fields if tenant size makes this slow.
    let cursor: string | undefined;
    while (true) {
      const batch = await this.prisma.rndtechnosoft_crm_leads.findMany({
        where, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { id: true, custom_attributes: true, temperature: true, industry: true, sub_industry: true, is_won: true, created_at: true },
      });
      for (const lead of batch) {
        const attr = lead.custom_attributes as { cadence?: CadenceState } | null;
        const cadence = attr?.cadence;
        if (!cadence && lead.temperature !== 'COLD') continue;
        const status = cadence?.status ?? 'ACTIVE';
        if (filterStatus !== 'ALL' && status !== filterStatus) continue;
        const industry = lead.industry || cadence?.industry || 'general';
        const subIndustry = lead.sub_industry || '';
        enrolledCount++;
        industryCounts[normalize(industry)] = (industryCounts[normalize(industry)] ?? 0) + 1;
        if (matchesTaxonomy(industry, query.industry)) {
          subIndustryCounts[normalize(subIndustry)] = (subIndustryCounts[normalize(subIndustry)] ?? 0) + 1;
        }
        if (!matchesTaxonomy(industry, query.industry) || !matchesTaxonomy(subIndustry, query.subIndustry)) continue;
        const step = nextCadenceStep(steps, { completedSteps: cadence?.completedSteps ?? [] }) ?? steps[steps.length - 1];
        if (query.channel && query.channel !== 'ALL' && !step.channels.includes(query.channel as CadenceChannel)) continue;
        const dueStatus = status === 'ACTIVE' ? evaluateStepDueStatus(cadence?.nextDueAt || lead.created_at) : 'UPCOMING';
        const category = status === 'CONVERTED' || cadence?.convertedToOpportunity || lead.is_won ? 'CONVERTED' : status;
        stats.totalEnrolled++;
        if (category === 'CONVERTED') stats.convertedCount++;
        else if (category === 'COMPLETED') stats.completedCount++;
        else if (category === 'BRANCHED') stats.branchedCount++;
        else if (category === 'ACTIVE') {
          stats.activeCount++;
          if (dueStatus === 'OVERDUE') stats.overdueCount++;
          if (dueStatus === 'DUE_TODAY') stats.dueTodayCount++;
          if (dueStatus !== 'UPCOMING') step.channels.forEach(ch => stats.platformCounts[ch]++);
        }
        const queue = query.queue ?? 'ALL';
        const inQueue = queue === 'ALL' || (queue === 'ALL_ACTIVE' ? category === 'ACTIVE'
          : queue === 'ACTION_RADAR' ? category === 'ACTIVE' && dueStatus !== 'UPCOMING' : category === queue);
        if (!inQueue) continue;
        if (total >= skip && pageIds.length < limit) pageIds.push(lead.id);
        total++;
      }
      if (batch.length < 500) break;
      cursor = batch[batch.length - 1].id;
    }
    const leads = pageIds.length ? await this.prisma.rndtechnosoft_crm_leads.findMany({
      where: { tenant_id: tenantId, id: { in: pageIds } }, take: limit,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: { rndtechnosoft_tenant_members: { select: { rndtechnosoft_users: { select: { display_name: true } } } } },
    }) : [];

    const activeList: any[] = [];
    const overdueList: any[] = [];
    const dueTodayList: any[] = [];
    const upcomingList: any[] = [];
    const completedList: any[] = [];
    const branchedList: any[] = [];
    const convertedList: any[] = [];

    for (const lead of leads) {
      const customAttr = (lead.custom_attributes as any) || {};
      let cadence: CadenceState | null = customAttr.cadence || null;

      if (!cadence) {
        if (lead.temperature === 'COLD') {
          // Auto-prepare display cadence for cold leads
          cadence = {
            funnelName: 'RND Gold Funnel',
            status: 'ACTIVE',
            industry: lead.industry || 'general',
            enrolledAt: lead.created_at.toISOString(),
            currentStepIndex: 0,
            currentDay: 1,
            nextDueAt: lead.created_at.toISOString(),
            completedSteps: [],
          };
        } else {
          continue;
        }
      }

      if (filterStatus !== 'ALL' && cadence.status !== filterStatus) {
        continue;
      }

      // Where the lead is in this workspace's playbook; once past the last step, that step.
      const currentMasterStep = nextCadenceStep(steps, cadence) ?? steps[steps.length - 1];
      const stepDueDate = cadence.nextDueAt ? new Date(cadence.nextDueAt) : new Date(lead.created_at);
      const dueStatus = cadence.status === 'ACTIVE' ? evaluateStepDueStatus(stepDueDate) : 'UPCOMING';

      const vars = {
        firstName: lead.first_name ?? undefined,
        lastName: lead.last_name || '',
        companyName: lead.company_name,
        industry: cadence.industry || 'general',
        phone: lead.whatsapp_number || lead.phone || undefined,
        email: lead.email,
      };

      const enrichedItem = {
        ...lead,
        cadence,
        assigned_user_name: lead.rndtechnosoft_tenant_members?.rndtechnosoft_users?.display_name || 'Unassigned',
        currentStep: {
          ...currentMasterStep,
          dueDate: stepDueDate.toISOString(),
          dueStatus,
          interpolatedTemplates: {
            linkedin: currentMasterStep.templates.linkedin
              ? {
                  ...currentMasterStep.templates.linkedin,
                  message: currentMasterStep.templates.linkedin.message
                    ? interpolateText(currentMasterStep.templates.linkedin.message, vars)
                    : undefined,
                }
              : undefined,
            email: currentMasterStep.templates.email
              ? {
                  subject: interpolateText(currentMasterStep.templates.email.subject, vars),
                  body: interpolateText(currentMasterStep.templates.email.body, vars),
                }
              : undefined,
            whatsapp: currentMasterStep.templates.whatsapp
              ? {
                  message: interpolateText(currentMasterStep.templates.whatsapp.message, vars),
                }
              : undefined,
            phone: currentMasterStep.templates.phone
              ? {
                  pitchScript: interpolateText(currentMasterStep.templates.phone.pitchScript, vars),
                  afterCallTakenWhatsApp: interpolateText(currentMasterStep.templates.phone.afterCallTakenWhatsApp, vars),
                  missedCallWhatsApp: interpolateText(currentMasterStep.templates.phone.missedCallWhatsApp, vars),
                }
              : undefined,
          },
        },
      };

      if (cadence.status === 'CONVERTED' || cadence.convertedToOpportunity || lead.is_won) {
        convertedList.push(enrichedItem);
      } else if (cadence.status === 'COMPLETED') {
        completedList.push(enrichedItem);
      } else if (cadence.status === 'BRANCHED') {
        branchedList.push(enrichedItem);
      } else if (cadence.status === 'ACTIVE') {
        activeList.push(enrichedItem);

        if (dueStatus === 'OVERDUE') {
          overdueList.push(enrichedItem);
        } else if (dueStatus === 'DUE_TODAY') {
          dueTodayList.push(enrichedItem);
        } else {
          upcomingList.push(enrichedItem);
        }
      }
    }

    return {
      tenantName,
      stats,
      pagination: this.pageMeta(total, page, limit, leads.length),
      facets: { enrolledCount, industryCounts, subIndustryCounts },
      radar: {
        overdue: overdueList,
        dueToday: dueTodayList,
        upcoming: upcomingList,
        allActive: activeList,
        completed: completedList,
        branched: branchedList,
        converted: convertedList,
      },
      masterSteps: steps,
      replyBranches: await this.getReplyBranches(tenantId),
      industries: CADENCE_INDUSTRIES,
      // Tells the screen whether to offer "load sample leads".
      demoSeedAllowed: isCrmDemoSeedAllowed(),
    };
  }

  async executeCadenceAction(tenantId: string, visibility: LeadVisibility, body: any, memberId?: string) {
    const { action, leadId, leadIds, industry, channel, notes, branchKey } = body;
    const targetIds: string[] = Array.isArray(leadIds) ? leadIds : leadId ? [leadId] : [];
    const scope = visibleLeads(visibility);

    if (action === 'ENROLL') {
      const now = new Date();
      const [firstStep] = await this.getCadenceSteps(tenantId);
      const dueDate = computeStepDueDate(now, firstStep.dayOffset);

      for (const id of targetIds) {
        const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id, ...scope } });
        if (!lead) continue;

        const customAttr = (lead.custom_attributes as any) || {};
        const cadence: CadenceState = {
          funnelName: 'RND Gold Funnel',
          status: 'ACTIVE',
          industry: industry || lead.industry || 'general',
          enrolledAt: now.toISOString(),
          currentStepIndex: 0,
          currentDay: 1,
          nextDueAt: dueDate.toISOString(),
          completedSteps: [],
        };

        await this.prisma.rndtechnosoft_crm_leads.update({
          where: { id },
          data: {
            temperature: 'COLD',
            custom_attributes: { ...customAttr, cadence },
          },
        });
        await this.logActivity(tenantId, id, 'NOTE', 'Enrolled in 30-Day Outbound Cadence', `Target industry: ${industry || 'general'}`, memberId);
      }
      return { success: true, count: targetIds.length };
    }

    if (action === 'COMPLETE_STEP' && leadId) {
      const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId, ...scope } });
      if (!lead) throw new NotFoundException('Lead not found');

      const customAttr = (lead.custom_attributes as any) || {};
      const cadence: CadenceState = customAttr.cadence || {
        funnelName: 'RND Gold Funnel',
        status: 'ACTIVE',
        industry: lead.industry || 'general',
        enrolledAt: new Date().toISOString(),
        currentStepIndex: 0,
        currentDay: 1,
        nextDueAt: new Date().toISOString(),
        completedSteps: [],
      };

      // The step due now in this workspace's playbook, found by day so playbook edits never skip or repeat one.
      const steps = await this.getCadenceSteps(tenantId);
      const executedStep = nextCadenceStep(steps, cadence);
      const currentIndex = executedStep ? steps.indexOf(executedStep) : steps.length;

      if (executedStep) {
        cadence.completedSteps = [
          ...(cadence.completedSteps ?? []),
          {
            stepIndex: currentIndex,
            dayNumber: executedStep.dayNumber,
            completedAt: new Date().toISOString(),
            channelsUsed: channel ? [channel] : executedStep.channels,
            notes: notes || 'Step executed successfully',
          },
        ];
      }

      const nextIndex = currentIndex + 1;
      const nextStep = steps[nextIndex];
      if (nextStep) {
        cadence.currentStepIndex = nextIndex;
        const nextDue = computeStepDueDate(new Date(), nextStep.dayOffset - (executedStep?.dayOffset || 0));
        cadence.nextDueAt = nextDue.toISOString();
      } else {
        cadence.status = 'COMPLETED';
        cadence.nextDueAt = '';
      }

      await this.prisma.rndtechnosoft_crm_leads.update({
        // Composite [tenant_id, id] key keeps the write inside this tenant.
        where: { tenant_id_id: { tenant_id: tenantId, id: leadId } },
        data: {
          cadence_step: nextIndex + 1,
          touchpoints_count: { increment: 1 },
          last_contacted_at: new Date(),
          custom_attributes: { ...customAttr, cadence },
        },
      });

      await this.logActivity(tenantId, leadId, channel || 'WHATSAPP', `Cadence Step ${currentIndex + 1} Done: ${executedStep?.title || 'Touchpoint'}`, notes, memberId);
      return { success: true, nextStepIndex: cadence.currentStepIndex, status: cadence.status };
    }

    if (action === 'CONVERT_OPPORTUNITY') {
      return this.convertOutreachLead(tenantId, visibility, body, memberId);
    }

    // The screens send BRANCH_REPLY (with feedbackNotes); CHANGE_BRANCH is the older name.
    if ((action === 'CHANGE_BRANCH' || action === 'BRANCH_REPLY') && leadId && branchKey) {
      const replyNotes: string | undefined = notes ?? body.feedbackNotes;
      const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId, ...scope } });
      if (!lead) throw new NotFoundException('Lead not found');

      // One of this workspace's objection strategies; never a key that is not in its list.
      const branches = await this.getReplyBranches(tenantId);
      const branch = typeof branchKey === 'string' && Object.prototype.hasOwnProperty.call(branches, branchKey) ? branches[branchKey] : undefined;
      if (!branch) throw new BadRequestException('That objection strategy no longer exists. Reload the page and choose one from the list.');
      const customAttr = (lead.custom_attributes as any) || {};
      const cadence: CadenceState = customAttr.cadence || ({} as any);

      cadence.status = 'BRANCHED';
      cadence.branchReply = {
        branchKey,
        repliedAt: new Date().toISOString(),
        leadFeedback: replyNotes || '',
        actionTaken: branch?.suggestedAction || 'Branch Triggered',
      };

      await this.prisma.rndtechnosoft_crm_leads.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: leadId } },
        data: {
          temperature: branch?.nextLeadTemperature || 'WARM',
          custom_attributes: { ...customAttr, cadence },
        },
      });

      await this.logActivity(tenantId, leadId, 'STATUS_CHANGE', `Branched to SOP: ${branch?.label || branchKey}`, replyNotes, memberId);
      return { success: true, branch: branchKey };
    }

    // An action this endpoint does not know, or one missing its lead, changes nothing, so it must not report success.
    throw new BadRequestException('That outreach action is not recognised or is missing the lead it applies to.');
  }

  /**
   * Converts a lead in the outreach cadence into a sales opportunity: the same
   * lead record moves into the chosen pipeline and stage (by default the Cold
   * Funnel and its first open stage) and its cadence is marked converted.
   * Opportunities are leads in this schema, so nothing is duplicated. One
   * transaction, with the lead row locked, so two clicks cannot both convert it
   * and a failure leaves it untouched.
   */
  private async convertOutreachLead(tenantId: string, visibility: LeadVisibility, body: any, memberId?: string) {
    const leadId: unknown = body.leadId;
    if (typeof leadId !== 'string' || !leadId) throw new BadRequestException('Choose the outreach lead to convert.');
    const optionalId = (value: unknown, message: string): string | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      if (typeof value !== 'string' || !CrmService.UUID_PATTERN.test(value)) throw new BadRequestException(message);
      return value;
    };
    const chosenPipelineId = optionalId(body.pipelineId, 'Choose the pipeline the opportunity goes to.');
    const chosenStageId = optionalId(body.stageId, 'Choose the stage the opportunity starts in.');

    // The chosen active pipeline of this workspace; otherwise the Cold Funnel, never some other pipeline silently.
    const pipeline = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
      where: chosenPipelineId
        ? { tenant_id: tenantId, id: chosenPipelineId, is_active: true, pipeline_kind: 'SALES' }
        : // Case-insensitive: CRM Masters stores a code as typed.
          { tenant_id: tenantId, code: { equals: COLD_FUNNEL_PIPELINE_CODE, mode: 'insensitive' }, is_active: true, pipeline_kind: 'SALES' },
      orderBy: { created_at: 'asc' },
      select: { id: true, name: true },
    });
    if (!pipeline && chosenPipelineId) {
      throw new BadRequestException('That pipeline is not an active sales pipeline in this workspace. Choose another pipeline and convert again.');
    }
    if (!pipeline) {
      throw new BadRequestException(
        `The Cold Funnel, where converted leads go by default, is not set up in this workspace. Choose a target pipeline, or in CRM Masters → Pipelines add a pipeline named "Cold Funnel" (its code becomes ${COLD_FUNNEL_PIPELINE_CODE}) with at least one stage, then convert again.`,
      );
    }
    // The chosen stage, or the first open stage by the configured order; won and lost stages are where deals end, not start.
    const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
      where: { tenant_id: tenantId, pipeline_id: pipeline.id, is_won: false, is_lost: false, ...(chosenStageId ? { id: chosenStageId } : {}) },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { id: true, name: true },
    });
    if (!stage && chosenStageId) {
      throw new BadRequestException(`That stage is not an open stage of the ${pipeline.name} pipeline. Choose one of its open stages and convert again.`);
    }
    if (!stage) {
      throw new BadRequestException(`The ${pipeline.name} pipeline has no open stage. Add one in CRM Masters → Pipeline Stages, or choose another pipeline, then convert again.`);
    }

    const temperature = body.temperature === 'HOT' || body.temperature === 'WARM' ? body.temperature : 'WARM';
    const rawBudget = body.budgetAmount ?? body.budget_amount;
    let budget: Prisma.Decimal | undefined;
    if (rawBudget !== undefined && rawBudget !== null && rawBudget !== '') {
      try {
        budget = new Prisma.Decimal(rawBudget);
      } catch {
        throw new BadRequestException('Enter the deal value as a number.');
      }
      if (budget.isNegative()) throw new BadRequestException('The deal value cannot be negative.');
    }
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const converted = await this.prisma.$transaction(async (tx) => {
      // Locks the row: a second conversion of the same lead waits here, then sees it converted.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${leadId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Lead not found');

      const lead = await tx.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) } });
      if (!lead) throw new NotFoundException('Lead not found');
      const customAttr = (lead.custom_attributes as Record<string, any> | null) || {};
      const cadence = customAttr.cadence as CadenceState | undefined;
      if (!cadence) throw new BadRequestException(`${lead.company_name} is not in the outreach cadence, so there is nothing to convert.`);
      if (cadence.status === 'CONVERTED' || cadence.convertedToOpportunity) {
        throw new ConflictException(`${lead.company_name} was already converted and is in the Sales Pipeline.`);
      }
      if (lead.is_won || lead.is_lost) {
        throw new ConflictException(`${lead.company_name} is already closed as ${lead.is_won ? 'won' : 'lost'}.`);
      }

      const now = new Date();
      await tx.rndtechnosoft_crm_leads.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: leadId } },
        data: {
          pipeline_id: pipeline.id,
          stage_id: stage.id,
          stage_entered_at: now,
          temperature,
          ...(budget !== undefined ? { budget_amount: budget } : {}),
          custom_attributes: {
            ...customAttr,
            cadence: { ...cadence, status: 'CONVERTED', convertedToOpportunity: true, convertedAt: now.toISOString(), nextDueAt: '' },
          },
        },
      });
      await tx.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          lead_id: leadId,
          performed_by_tenant_member_id: memberId || null,
          activity_type: 'STATUS_CHANGE',
          title: `Converted from Client Outreach to ${pipeline.name} › ${stage.name}`,
          description: notes,
        },
      });
      return tx.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: tenantId, id: leadId }, include: LEAD_LIST_INCLUDE });
    });

    await this.logAudit(
      tenantId,
      'CONVERT_OPPORTUNITY',
      'LEAD',
      leadId,
      {
        pipelineId: pipeline.id,
        stageId: stage.id,
        temperature,
        ...(budget !== undefined ? { budgetAmount: budget.toString() } : {}),
        ...(typeof body.conversionChannel === 'string' && body.conversionChannel ? { channel: body.conversionChannel.slice(0, 32) } : {}),
      },
      memberId,
    );

    return {
      success: true,
      message: `${converted.company_name} is now in ${pipeline.name} › ${stage.name}`,
      lead: this.toLeadListItem(converted),
      pipeline: { id: pipeline.id, name: pipeline.name },
      stage: { id: stage.id, name: stage.name },
    };
  }

  // ==========================================
  // ACTIVITIES, FOLLOWUPS & MEETINGS
  // ==========================================

  async getActivities(tenantId: string, visibility: LeadVisibility, leadId?: string, requestedPage?: number, requestedLimit?: number) {
    const { page, limit, skip } = this.pagination(requestedPage, requestedLimit);
    const where: Prisma.rndtechnosoft_crm_lead_activitiesWhereInput = { tenant_id: tenantId, ...onVisibleLead(visibility) };
    if (leadId) where.lead_id = leadId;

    const [activities, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_lead_activities.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          rndtechnosoft_crm_leads: { select: { company_name: true, lead_code: true } },
          rndtechnosoft_tenant_members: {
            include: { rndtechnosoft_users: true },
          },
        },
      }),
      this.prisma.rndtechnosoft_crm_lead_activities.count({ where }),
    ]);

    const items = activities.map((a) => ({
      ...a,
      lead_company_name: a.rndtechnosoft_crm_leads?.company_name,
      lead_code: a.rndtechnosoft_crm_leads?.lead_code,
      created_by_name: a.rndtechnosoft_tenant_members?.rndtechnosoft_users?.display_name || 'System',
    }));
    return this.pageResult(items, total, page, limit);
  }

  async addActivity(
    tenantId: string,
    visibility: LeadVisibility,
    body: {
      leadId: string;
      activityType: string;
      title: string;
      description?: string;
      durationSeconds?: number;
      callDisposition?: string;
    },
    memberId?: string,
  ) {
    await this.assertLeadsVisible(tenantId, visibility, [body.leadId]);
    const activity = await this.prisma.rndtechnosoft_crm_lead_activities.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        lead_id: body.leadId,
        performed_by_tenant_member_id: memberId || null,
        activity_type: body.activityType || 'NOTE',
        title: body.title,
        description: body.description || null,
        duration_seconds: body.durationSeconds || null,
        call_disposition: body.callDisposition || null,
      },
    });

    await this.prisma.rndtechnosoft_crm_leads.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: body.leadId } },
      data: {
        last_contacted_at: new Date(),
        touchpoints_count: { increment: 1 },
      },
    });

    return activity;
  }

  /**
   * Refuses unless every lead is one this member may see. A lead they may not
   * see is answered as not found, the same as one that does not exist.
   */
  async assertLeadsVisible(tenantId: string, visibility: LeadVisibility, leadIds: unknown[]) {
    const ids = [...new Set(leadIds)];
    const valid = ids.every((id): id is string => typeof id === 'string' && CrmService.UUID_PATTERN.test(id));
    const found = valid ? await this.prisma.rndtechnosoft_crm_leads.count({ where: { tenant_id: tenantId, id: { in: ids as string[] }, ...visibleLeads(visibility) } }) : -1;
    if (found !== ids.length) throw new NotFoundException(ids.length === 1 ? 'Lead not found' : 'Some of the selected leads were not found. Reload the page and try again.');
  }

  /** Refuses a follow-up, meeting or quotation whose lead this member may not see, as not found. */
  private async assertRecordOnVisibleLead(count: Promise<number>, label: string) {
    if ((await count) === 0) throw new NotFoundException(`${label} not found`);
  }

  private async logActivity(
    tenantId: string,
    leadId: string,
    activityType: string,
    title: string,
    description?: string,
    memberId?: string,
  ) {
    try {
      await this.prisma.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          lead_id: leadId,
          performed_by_tenant_member_id: memberId || null,
          activity_type: activityType,
          title,
          description: description || null,
        },
      });
    } catch {
      // ignore logging failures
    }
  }

  async getFollowups(tenantId: string, visibility: LeadVisibility, requestedPage?: number, requestedLimit?: number) {
    const { page, limit, skip } = this.pagination(requestedPage, requestedLimit);
    const where = { tenant_id: tenantId, ...onVisibleLead(visibility) };
    const [followups, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_lead_followups.findMany({
        where,
        orderBy: { scheduled_at: 'asc' },
        skip,
        take: limit,
        include: {
          rndtechnosoft_crm_leads: {
            select: { id: true, company_name: true, first_name: true, last_name: true, phone: true, email: true },
          },
        },
      }),
      this.prisma.rndtechnosoft_crm_lead_followups.count({ where }),
    ]);

    const items = followups.map((f) => {
      const isOverdue = f.status === 'PENDING' && new Date(f.scheduled_at) < new Date();
      return {
        ...f,
        lead_company_name: f.rndtechnosoft_crm_leads?.company_name,
        contact_name: `${f.rndtechnosoft_crm_leads?.first_name || ''} ${f.rndtechnosoft_crm_leads?.last_name || ''}`.trim(),
        lead_phone: f.rndtechnosoft_crm_leads?.phone,
        lead_email: f.rndtechnosoft_crm_leads?.email,
        is_overdue: isOverdue,
      };
    });
    return this.pageResult(items, total, page, limit);
  }

  async createFollowup(
    tenantId: string,
    visibility: LeadVisibility,
    body: {
      leadId: string;
      scheduledAt: string;
      followupType?: string;
      priority?: string;
      instructions?: string;
    },
    memberId?: string,
  ) {
    await this.assertLeadsVisible(tenantId, visibility, [body.leadId]);
    const followup = await this.prisma.rndtechnosoft_crm_lead_followups.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        lead_id: body.leadId,
        scheduled_at: new Date(body.scheduledAt),
        followup_type: body.followupType || 'CALL',
        priority: body.priority || 'MEDIUM',
        instructions: body.instructions || null,
        status: 'PENDING',
        assigned_to_tenant_member_id: memberId || null,
      },
    });

    await this.prisma.rndtechnosoft_crm_leads.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: body.leadId } },
      data: { next_followup_at: new Date(body.scheduledAt) },
    });

    await this.logActivity(tenantId, body.leadId, 'FOLLOWUP', `Scheduled ${body.followupType || 'Follow-up'}`, body.instructions, memberId);
    return followup;
  }

  async updateFollowup(tenantId: string, visibility: LeadVisibility, id: string, body: any, memberId?: string) {
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_lead_followups.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Follow-up');
    const updateData: any = {};
    if (body.status) updateData.status = body.status;
    if (body.outcomeNote || body.outcome_note) updateData.outcome_note = body.outcomeNote || body.outcome_note;
    if (body.status === 'COMPLETED') updateData.completed_at = new Date();

    // Composite [tenant_id, id] key: another tenant's follow-up id is a 404.
    const followup = await this.prisma.rndtechnosoft_crm_lead_followups.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: updateData,
    });

    if (body.status === 'COMPLETED') {
      await this.logActivity(tenantId, followup.lead_id, 'FOLLOWUP', `Follow-up Completed`, body.outcomeNote || 'Completed', memberId);
    }

    return followup;
  }

  async deleteFollowup(tenantId: string, visibility: LeadVisibility, id: string) {
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_lead_followups.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Follow-up');
    await this.prisma.rndtechnosoft_crm_lead_followups.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } });
    return { success: true };
  }

  async getMeetings(tenantId: string, visibility: LeadVisibility, requestedPage?: number, requestedLimit?: number) {
    const { page, limit, skip } = this.pagination(requestedPage, requestedLimit);
    const where = { tenant_id: tenantId, ...onVisibleLead(visibility) };
    const [meetings, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_meetings.findMany({
        where,
        orderBy: { scheduled_at: 'desc' },
        skip,
        take: limit,
        include: {
          rndtechnosoft_crm_leads: {
            select: { id: true, company_name: true, first_name: true, last_name: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.rndtechnosoft_crm_meetings.count({ where }),
    ]);

    const items = meetings.map((m) => ({
      ...m,
      lead_company_name: m.rndtechnosoft_crm_leads?.company_name,
      contact_name: `${m.rndtechnosoft_crm_leads?.first_name || ''} ${m.rndtechnosoft_crm_leads?.last_name || ''}`.trim(),
      lead_email: m.rndtechnosoft_crm_leads?.email,
      lead_phone: m.rndtechnosoft_crm_leads?.phone,
    }));
    return this.pageResult(items, total, page, limit);
  }

  async createMeeting(tenantId: string, visibility: LeadVisibility, body: any, memberId?: string) {
    await this.assertLeadsVisible(tenantId, visibility, [body.leadId]);
    const meeting = await this.prisma.rndtechnosoft_crm_meetings.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        lead_id: body.leadId,
        title: body.title || 'Client Discovery Call',
        meeting_type: body.meetingType || 'GOOGLE_MEET',
        scheduled_at: new Date(body.scheduledAt),
        meeting_link: body.meetingLink || null,
        status: 'SCHEDULED',
      },
    });

    await this.logActivity(tenantId, body.leadId, 'MEETING', `Meeting Scheduled: ${body.title}`, `Meeting link: ${body.meetingLink || 'Direct'}`, memberId);
    return meeting;
  }

  async updateMeeting(tenantId: string, visibility: LeadVisibility, id: string, body: any, memberId?: string) {
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_meetings.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Meeting');
    const updateData: any = {};
    if (body.title) updateData.title = body.title;
    if (body.status) updateData.status = body.status;
    if (body.minutesOfMeeting || body.mom_text) updateData.minutes_of_meeting = body.minutesOfMeeting || body.mom_text;
    if (body.status === 'COMPLETED') updateData.status = 'COMPLETED';

    const meeting = await this.prisma.rndtechnosoft_crm_meetings.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: updateData,
    });

    if (body.minutesOfMeeting || body.mom_text) {
      await this.logActivity(tenantId, meeting.lead_id, 'NOTE', `Meeting Minutes Logged for: ${meeting.title}`, body.minutesOfMeeting || body.mom_text, memberId);
    }

    return meeting;
  }

  async deleteMeeting(tenantId: string, visibility: LeadVisibility, id: string) {
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_meetings.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Meeting');
    await this.prisma.rndtechnosoft_crm_meetings.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } });
    return { success: true };
  }

  // ==========================================
  // GST QUOTATIONS
  // ==========================================

  async getQuotations(tenantId: string, visibility: LeadVisibility, requestedPage?: number, requestedLimit?: number) {
    const { page, limit, skip } = this.pagination(requestedPage, requestedLimit);
    const where = { tenant_id: tenantId, ...onVisibleLead(visibility) };
    const [quotations, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_quotations.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          rndtechnosoft_crm_leads: {
            select: { id: true, company_name: true, first_name: true, last_name: true, email: true },
          },
          rndtechnosoft_crm_quotation_items: true,
        },
      }),
      this.prisma.rndtechnosoft_crm_quotations.count({ where }),
    ]);

    const items = quotations.map((q) => ({
      ...q,
      status: q.quotation_status,
      grand_total: Number(q.total_amount),
      total_amount: Number(q.total_amount),
      lead_company_name: q.rndtechnosoft_crm_leads?.company_name,
      contact_person: `${q.rndtechnosoft_crm_leads?.first_name || ''} ${q.rndtechnosoft_crm_leads?.last_name || ''}`.trim(),
      items: q.rndtechnosoft_crm_quotation_items,
    }));
    return this.pageResult(items, total, page, limit);
  }

  async getQuotationById(tenantId: string, visibility: LeadVisibility, id: string) {
    const quotation = await this.prisma.rndtechnosoft_crm_quotations.findFirst({
      where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) },
      include: {
        rndtechnosoft_crm_leads: true,
        rndtechnosoft_crm_quotation_items: true,
      },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    return {
      ...quotation,
      status: quotation.quotation_status,
      lead: quotation.rndtechnosoft_crm_leads,
      items: quotation.rndtechnosoft_crm_quotation_items,
    };
  }

  /**
   * Prices quotation lines and GST in decimal, never floating point, rounding
   * each amount once to paise: a line is quantity × rate, and tax is 9% CGST +
   * 9% SGST within the state or 18% IGST between states.
   */
  private priceQuotation(rawItems: unknown, rawTaxMode: unknown) {
    const lines: any[] = Array.isArray(rawItems) ? rawItems : [];
    if (lines.length === 0) throw new BadRequestException('Add at least one line item to the quotation.');
    if (lines.length > 200) throw new BadRequestException('A quotation can have at most 200 lines.');
    const decimal = (value: unknown, fallback: string, line: number, field: string) => {
      try {
        return new Prisma.Decimal(value === undefined || value === null || value === '' ? fallback : (value as Prisma.Decimal.Value));
      } catch {
        throw new BadRequestException(`Line ${line}: enter the ${field} as a number.`);
      }
    };
    const items = lines.map((item, index) => {
      const quantity = decimal(item.quantity, '1', index + 1, 'quantity');
      const unitRate = decimal(item.unitRate ?? item.unit_rate, '0', index + 1, 'rate');
      const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null;
      if (!description) throw new BadRequestException(`Line ${index + 1} needs a description.`);
      if (quantity.lte(0) || unitRate.lt(0)) throw new BadRequestException(`Line ${index + 1} needs a positive quantity and a rate of zero or more.`);
      const serviceId = item.serviceId || item.service_id || null;
      if (serviceId !== null && (typeof serviceId !== 'string' || !CrmService.UUID_PATTERN.test(serviceId))) {
        throw new BadRequestException(`Line ${index + 1}: choose the service from the list.`);
      }
      const sacCode = typeof (item.sacCode ?? item.sac_code) === 'string' ? String(item.sacCode ?? item.sac_code).trim().slice(0, 32) || null : null;
      return { description, quantity, unitRate, serviceId, sacCode, lineAmount: quantity.mul(unitRate).toDecimalPlaces(2) };
    });

    const subtotal = items.reduce((sum, line) => sum.add(line.lineAmount), new Prisma.Decimal(0));
    const taxMode = rawTaxMode === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE';
    const cgst = taxMode === 'INTRA_STATE' ? subtotal.mul('0.09').toDecimalPlaces(2) : new Prisma.Decimal(0);
    const sgst = taxMode === 'INTRA_STATE' ? subtotal.mul('0.09').toDecimalPlaces(2) : new Prisma.Decimal(0);
    const igst = taxMode === 'INTER_STATE' ? subtotal.mul('0.18').toDecimalPlaces(2) : new Prisma.Decimal(0);
    const totalTax = cgst.add(sgst).add(igst);
    return { items, taxMode, subtotal, cgst, sgst, igst, totalTax, grandTotal: subtotal.add(totalTax) };
  }

  /** The quotation's line rows, in order, for a transaction to write. */
  private quotationLineRows(tenantId: string, quotationId: string, items: ReturnType<CrmService['priceQuotation']>['items']) {
    return items.map((line, index) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      quotation_id: quotationId,
      service_id: line.serviceId,
      description: line.description,
      sac_code: line.sacCode ?? undefined,
      quantity: line.quantity,
      unit_rate: line.unitRate,
      line_amount: line.lineAmount,
      sort_order: index + 1,
    }));
  }

  /** Validity in days (1–365, 30 when not given) turned into the last valid date. */
  private quotationValidUntil(validDays: unknown) {
    const days = validDays === undefined || validDays === null || validDays === '' ? 30 : Number(validDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new BadRequestException('The quotation must be valid for 1 to 365 days.');
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + days);
    return validUntil;
  }

  private quotationNotes(notes: unknown) {
    if (notes === undefined || notes === null) return null;
    if (typeof notes !== 'string') throw new BadRequestException('The notes must be text.');
    if (notes.trim().length > 2000) throw new BadRequestException('The notes must be 2,000 characters or fewer.');
    return notes.trim() || null;
  }

  async createQuotation(tenantId: string, visibility: LeadVisibility, body: any, memberId?: string) {
    const leadId = body.leadId || body.lead_id;
    if (!leadId) throw new BadRequestException('Choose the lead this quotation is for.');
    if (typeof leadId !== 'string' || !CrmService.UUID_PATTERN.test(leadId)) throw new NotFoundException('Lead not found');
    const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');

    const priced = this.priceQuotation(body.items, body.taxMode);
    const validUntil = this.quotationValidUntil(body.validDays);
    const notes = this.quotationNotes(body.notes);
    const quoteId = randomUUID();

    // The quotation and its lines are written together or not at all.
    const quotation = await this.withUniqueCode('QT', (quoteNumber) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.rndtechnosoft_crm_quotations.create({
          data: {
            id: quoteId,
            tenant_id: tenantId,
            quotation_number: quoteNumber,
            lead_id: lead.id,
            client_state: body.clientState || null,
            branch_state: body.branchState || null,
            tax_mode: priced.taxMode,
            subtotal: priced.subtotal,
            cgst_amount: priced.cgst,
            sgst_amount: priced.sgst,
            igst_amount: priced.igst,
            total_tax: priced.totalTax,
            total_amount: priced.grandTotal,
            valid_until: validUntil,
            notes,
            quotation_status: 'DRAFT',
          },
        });
        await tx.rndtechnosoft_crm_quotation_items.createMany({ data: this.quotationLineRows(tenantId, quoteId, priced.items) });
        return created;
      }),
    );

    await this.logActivity(tenantId, quotation.lead_id, 'QUOTATION', `Quotation Generated: ${quotation.quotation_number}`, `Grand Total: ₹${priced.grandTotal.toFixed(2)}`, memberId);
    return quotation;
  }

  /**
   * Changes a quotation's status, or edits a draft: its lines, tax type, states,
   * validity and notes. Lines and tax change only while the quotation is a
   * draft, and every total is recalculated from the lines; a sent, accepted or
   * rejected quotation keeps the amounts it was issued with.
   */
  async updateQuotation(tenantId: string, visibility: LeadVisibility, id: string, body: any, memberId?: string) {
    const statuses = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];
    if (body.status !== undefined && !statuses.includes(body.status)) {
      throw new BadRequestException('The status must be DRAFT, SENT, ACCEPTED or REJECTED.');
    }
    if (typeof id !== 'string' || !CrmService.UUID_PATTERN.test(id)) throw new NotFoundException('Quotation not found');
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_quotations.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Quotation');
    const editsContent = body.items !== undefined || body.taxMode !== undefined;

    const quote = await this.prisma.$transaction(async (tx) => {
      // Locked, so a status change and an edit cannot interleave.
      const locked = await tx.$queryRaw<{ quotation_status: string; quotation_number: string }[]>`
        SELECT quotation_status, quotation_number FROM rndtechnosoft_crm_quotations WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Quotation not found');
      const current = locked[0];

      if (!editsContent) {
        return tx.rndtechnosoft_crm_quotations.update({
          where: { tenant_id_id: { tenant_id: tenantId, id } },
          data: { ...(body.status ? { quotation_status: body.status } : {}), updated_at: new Date() },
        });
      }

      if (current.quotation_status !== 'DRAFT') {
        throw new ConflictException(`Only draft quotations can be edited. ${current.quotation_number} is ${current.quotation_status.toLowerCase()}; change it back to draft first.`);
      }
      const existingLines = body.items === undefined
        ? await tx.rndtechnosoft_crm_quotation_items.findMany({ where: { tenant_id: tenantId, quotation_id: id }, orderBy: { sort_order: 'asc' } })
        : null;
      const existing = await tx.rndtechnosoft_crm_quotations.findFirstOrThrow({ where: { tenant_id: tenantId, id }, select: { tax_mode: true } });
      const priced = this.priceQuotation(
        body.items ?? existingLines!.map((line) => ({ description: line.description, quantity: line.quantity, unitRate: line.unit_rate, serviceId: line.service_id, sacCode: line.sac_code })),
        body.taxMode ?? existing.tax_mode,
      );
      await tx.rndtechnosoft_crm_quotation_items.deleteMany({ where: { tenant_id: tenantId, quotation_id: id } });
      await tx.rndtechnosoft_crm_quotation_items.createMany({ data: this.quotationLineRows(tenantId, id, priced.items) });
      return tx.rndtechnosoft_crm_quotations.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          tax_mode: priced.taxMode,
          subtotal: priced.subtotal,
          cgst_amount: priced.cgst,
          sgst_amount: priced.sgst,
          igst_amount: priced.igst,
          total_tax: priced.totalTax,
          total_amount: priced.grandTotal,
          ...(body.clientState !== undefined ? { client_state: body.clientState || null } : {}),
          ...(body.branchState !== undefined ? { branch_state: body.branchState || null } : {}),
          ...(body.validDays !== undefined ? { valid_until: this.quotationValidUntil(body.validDays) } : {}),
          ...(body.notes !== undefined ? { notes: this.quotationNotes(body.notes) } : {}),
          ...(body.status ? { quotation_status: body.status } : {}),
          updated_at: new Date(),
        },
      });
    });

    if (editsContent) {
      await this.logActivity(tenantId, quote.lead_id, 'QUOTATION', `Quotation ${quote.quotation_number} edited`, `Grand Total: ₹${quote.total_amount.toFixed(2)}`, memberId);
    }
    if (body.status) {
      await this.logActivity(tenantId, quote.lead_id, 'STATUS_CHANGE', `Quotation ${quote.quotation_number} status: ${body.status}`, undefined, memberId);
    }

    return quote;
  }

  async deleteQuotation(tenantId: string, visibility: LeadVisibility, id: string) {
    await this.assertRecordOnVisibleLead(this.prisma.rndtechnosoft_crm_quotations.count({ where: { tenant_id: tenantId, id, ...onVisibleLead(visibility) } }), 'Quotation');
    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_crm_quotation_items.deleteMany({ where: { tenant_id: tenantId, quotation_id: id } }),
      this.prisma.rndtechnosoft_crm_quotations.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } }),
    ]);
    return { success: true };
  }

  async getQuotationTemplates(tenantId: string) {
    return this.prisma.rndtechnosoft_crm_quotation_templates.findMany({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: { template_name: 'asc' },
    });
  }

  // ==========================================
  // CLIENTS
  // ==========================================

  async getClients(tenantId: string, requestedPage?: number, requestedLimit?: number) {
    const { page, limit, skip } = this.pagination(requestedPage, requestedLimit);
    const where = { tenant_id: tenantId };
    const [items, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_clients.findMany({ where, orderBy: { company_name: 'asc' }, skip, take: limit }),
      this.prisma.rndtechnosoft_crm_clients.count({ where }),
    ]);
    return this.pageResult(items, total, page, limit);
  }

  async createClient(tenantId: string, body: any) {
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
    const companyName = text(body.company_name ?? body.companyName);
    const contactPerson = text(body.contact_person ?? body.contactPerson);
    const email = text(body.email)?.toLowerCase() ?? null;
    const missing = [!companyName && 'company name', !contactPerson && 'contact person', !email && 'email'].filter(Boolean);
    if (missing.length > 0) throw new BadRequestException(`A client needs a ${missing.join(', ')}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) throw new BadRequestException('Enter a valid email address for the client.');

    return this.withUniqueCode('CL', (clientCode) =>
      this.prisma.rndtechnosoft_crm_clients.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          client_code: clientCode,
          company_name: companyName!,
          contact_person: contactPerson!,
          email: email!,
          phone: text(body.phone),
          billing_address: text(body.address ?? body.billing_address ?? body.city),
          gstin: text(body.gstin),
          pan: text(body.pan_number ?? body.pan),
          client_status: text(body.status) ?? 'ACTIVE',
        },
      }),
    );
  }

  async updateClient(tenantId: string, id: string, body: any) {
    // Only client fields are writable; ids, codes and tenant ownership are not.
    const pick = (...keys: string[]) => {
      const key = keys.find((k) => body?.[k] !== undefined);
      return key === undefined ? undefined : body[key];
    };
    return this.prisma.rndtechnosoft_crm_clients.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: {
        company_name: pick('company_name', 'companyName'),
        contact_person: pick('contact_person', 'contactPerson'),
        email: pick('email'),
        phone: pick('phone'),
        billing_address: pick('billing_address', 'address'),
        gstin: pick('gstin'),
        pan: pick('pan', 'pan_number'),
        client_status: pick('client_status', 'status'),
        updated_at: new Date(),
      },
    });
  }

  // ==========================================
  // CRM MASTERS & TAXONOMY
  // ==========================================

  // ==========================================
  // OUTREACH PLAYBOOK (30-DAY SOP STEPS)
  // ==========================================

  /**
   * The workspace's outreach playbook, ordered by day: its own steps, or the
   * default steps until it first changes one. Default steps carry ids of the
   * form default-day-N so Masters can edit or remove them like any other.
   */
  async getCadenceSteps(tenantId: string): Promise<(CadenceStep & { id: string })[]> {
    const rows = await this.prisma.rndtechnosoft_crm_sop_steps_master.findMany({
      where: { tenant_id: tenantId },
      orderBy: { day_number: 'asc' },
    });
    if (rows.length === 0) return CADENCE_STEPS_MASTER.map((step) => ({ ...step, id: `default-day-${step.dayNumber}` }));
    return rows.map((row, index) => ({
      id: row.id,
      stepIndex: index,
      dayNumber: row.day_number,
      dayOffset: row.day_number - 1,
      title: row.title,
      goal: row.primary_objective,
      channels: row.channels as CadenceChannel[],
      timingGuide: row.timing_guide ?? '',
      roleNote: row.role_note ?? '',
      templates: row.templates as CadenceTemplate,
    }));
  }

  /** A playbook step as CRM Masters lists and edits it. */
  private toSopStepRow(step: CadenceStep & { id: string }) {
    return {
      id: step.id,
      day_number: step.dayNumber,
      day_offset: step.dayOffset,
      title: step.title,
      goal: step.goal,
      channels: step.channels,
      timing_guide: step.timingGuide,
      role_note: step.roleNote,
      templates: step.templates,
      is_active: true,
    };
  }

  /** Validates a step from the Masters editor into the columns it is saved in. */
  private parseSopStep(body: any) {
    const text = (value: unknown, label: string, max: number, required: boolean): string => {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (value !== undefined && value !== null && typeof value !== 'string') throw new BadRequestException(`${label} must be text.`);
      if (required && !trimmed) throw new BadRequestException(`Enter the ${label.toLowerCase()}.`);
      if (trimmed.length > max) throw new BadRequestException(`${label} must be ${max.toLocaleString('en-IN')} characters or fewer.`);
      return trimmed;
    };
    // Messages keep their line breaks and spacing as written.
    const message = (value: unknown, label: string): string => {
      if (value === undefined || value === null) return '';
      if (typeof value !== 'string') throw new BadRequestException(`${label} must be text.`);
      if (value.length > 10000) throw new BadRequestException(`${label} must be 10,000 characters or fewer.`);
      return value;
    };

    const dayNumber = Number(body.day_number);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 60) {
      throw new BadRequestException('The day number must be a whole number from 1 to 60.');
    }
    const allowedChannels: CadenceChannel[] = ['WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'];
    const channels = Array.isArray(body.channels) ? allowedChannels.filter((channel) => body.channels.includes(channel)) : [];
    if (channels.length === 0) throw new BadRequestException('Choose at least one channel for this step.');

    const raw = body.templates && typeof body.templates === 'object' ? body.templates : {};
    const templates: CadenceTemplate = {};
    if (raw.whatsapp) templates.whatsapp = { message: message(raw.whatsapp.message, 'The WhatsApp message') };
    if (raw.email) {
      templates.email = { subject: message(raw.email.subject, 'The email subject'), body: message(raw.email.body, 'The email body') };
    }
    if (raw.linkedin) {
      const actions = ['CONNECT', 'ENGAGE_POST', 'SHARE_POST', 'FAREWELL'] as const;
      templates.linkedin = {
        actionType: actions.find((action) => action === raw.linkedin.actionType) ?? 'CONNECT',
        message: message(raw.linkedin.message, 'The LinkedIn message'),
        actionNote: message(raw.linkedin.actionNote, 'The LinkedIn action note'),
      };
    }
    if (raw.phone) {
      templates.phone = {
        pitchScript: message(raw.phone.pitchScript, 'The call script'),
        afterCallTakenWhatsApp: message(raw.phone.afterCallTakenWhatsApp, 'The after-call WhatsApp message'),
        missedCallWhatsApp: message(raw.phone.missedCallWhatsApp, 'The missed-call WhatsApp message'),
      };
    }

    return {
      day_number: dayNumber,
      title: text(body.title, 'Step title', 160, true),
      primary_objective: text(body.goal, 'Strategic goal', 500, true),
      channels,
      timing_guide: text(body.timing_guide, 'Timing guide', 255, false) || null,
      role_note: text(body.role_note, 'Role note', 500, false) || null,
      templates: templates as Prisma.InputJsonObject,
    };
  }

  /**
   * Locks the workspace's playbook for one change and, while it is still on
   * the default steps, copies them in so the workspace owns them from now on.
   * Returns the saved row id of the step named by stepId (a row id or a
   * default step's id), or throws when there is no such step.
   */
  private async claimSopPlaybook(tx: Prisma.TransactionClient, tenantId: string, stepId?: unknown): Promise<string | undefined> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-sop-steps:${tenantId}`}, 0))`;
    if ((await tx.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: tenantId } })) === 0) {
      await tx.rndtechnosoft_crm_sop_steps_master.createMany({
        data: CADENCE_STEPS_MASTER.map((step) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          day_number: step.dayNumber,
          title: step.title,
          primary_objective: step.goal,
          channels: step.channels,
          timing_guide: step.timingGuide,
          role_note: step.roleNote,
          templates: step.templates as Prisma.InputJsonObject,
        })),
      });
    }
    if (stepId === undefined) return undefined;

    const gone = new NotFoundException('That step no longer exists. Reload the page to see the current playbook.');
    const defaultDay = typeof stepId === 'string' ? /^default-day-(\d+)$/.exec(stepId) : null;
    if (!defaultDay && (typeof stepId !== 'string' || !CrmService.UUID_PATTERN.test(stepId))) throw gone;
    const row = await tx.rndtechnosoft_crm_sop_steps_master.findFirst({
      where: defaultDay ? { tenant_id: tenantId, day_number: Number(defaultDay[1]) } : { tenant_id: tenantId, id: stepId as string },
      select: { id: true },
    });
    if (!row) throw gone;
    return row.id;
  }

  /** Adds a playbook step, or changes the one stepId names. One step per day. */
  async saveSopStep(tenantId: string, body: any, memberId?: string, stepId?: unknown) {
    const isUpdate = stepId !== undefined;
    const input = this.parseSopStep(body);

    const saved = await this.prisma.$transaction(async (tx) => {
      const rowId = await this.claimSopPlaybook(tx, tenantId, stepId);
      const clash = await tx.rndtechnosoft_crm_sop_steps_master.findFirst({
        where: { tenant_id: tenantId, day_number: input.day_number, ...(rowId ? { NOT: { id: rowId } } : {}) },
        select: { title: true },
      });
      if (clash) {
        throw new ConflictException(`Day ${input.day_number} already has a step ("${clash.title}"). Choose another day, or edit that step.`);
      }
      return rowId
        ? tx.rndtechnosoft_crm_sop_steps_master.update({
            where: { tenant_id_id: { tenant_id: tenantId, id: rowId } },
            data: { ...input, updated_at: new Date() },
          })
        : tx.rndtechnosoft_crm_sop_steps_master.create({ data: { id: randomUUID(), tenant_id: tenantId, ...input } });
    });

    await this.logAudit(tenantId, isUpdate ? 'UPDATE' : 'CREATE', 'SOP_STEP', saved.id, { day_number: saved.day_number, title: saved.title }, memberId);
    const step = (await this.getCadenceSteps(tenantId)).find((candidate) => candidate.id === saved.id);
    return step ? this.toSopStepRow(step) : null;
  }

  /** Removes a playbook step. A playbook keeps at least one step. */
  async deleteSopStep(tenantId: string, stepId: unknown, memberId?: string) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const id = await this.claimSopPlaybook(tx, tenantId, stepId);
      if ((await tx.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: tenantId } })) <= 1) {
        throw new ConflictException('The outreach playbook needs at least one step. Add another step before removing this one.');
      }
      return tx.rndtechnosoft_crm_sop_steps_master.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: id as string } } });
    });
    await this.logAudit(tenantId, 'DELETE', 'SOP_STEP', removed.id, { day_number: removed.day_number, title: removed.title }, memberId);
  }

  /**
   * The workspace's objection strategies (reply branches) by key: its own, or
   * the default strategies until it first changes one. Default strategies
   * carry ids of the form default-branch-KEY so Masters can edit or remove them.
   */
  async getReplyBranches(tenantId: string): Promise<Record<string, ReplyBranch & { id: string }>> {
    const rows = await this.prisma.rndtechnosoft_crm_sop_reply_branches_master.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    if (rows.length === 0) {
      return Object.fromEntries(Object.values(CADENCE_REPLY_BRANCHES).map((branch) => [branch.key, { ...branch, id: `default-branch-${branch.key}` }]));
    }
    return Object.fromEntries(
      rows.map((row) => [
        row.branch_key,
        {
          id: row.id,
          key: row.branch_key,
          label: row.label,
          triggerCondition: row.trigger_condition,
          nextLeadTemperature: row.next_lead_temperature as ReplyBranch['nextLeadTemperature'],
          suggestedAction: row.suggested_action,
          recommendedResponseScript: row.recommended_response_script,
          whatsappMessage: row.whatsapp_message,
          ...(row.email_subject || row.email_body ? { emailMessage: { subject: row.email_subject ?? '', body: row.email_body ?? '' } } : {}),
        },
      ]),
    );
  }

  /** An objection strategy as CRM Masters lists and edits it. */
  private toReplyBranchRow(branch: ReplyBranch & { id: string }) {
    return {
      id: branch.id,
      branch_key: branch.key,
      label: branch.label,
      trigger_condition: branch.triggerCondition,
      next_lead_temperature: branch.nextLeadTemperature,
      suggested_action: branch.suggestedAction,
      recommended_response_script: branch.recommendedResponseScript,
      whatsapp_message: branch.whatsappMessage,
      email_subject: branch.emailMessage?.subject ?? '',
      email_body: branch.emailMessage?.body ?? '',
      is_active: true,
    };
  }

  /** Validates a strategy from the Masters editor into the columns it is saved in. */
  private parseReplyBranch(body: any) {
    const text = (value: unknown, label: string, max: number, required: boolean): string => {
      if (value !== undefined && value !== null && typeof value !== 'string') throw new BadRequestException(`${label} must be text.`);
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (required && !trimmed) throw new BadRequestException(`Enter the ${label.toLowerCase()}.`);
      if (trimmed.length > max) throw new BadRequestException(`${label} must be ${max.toLocaleString('en-IN')} characters or fewer.`);
      return trimmed;
    };
    const temperatures = ['HOT', 'WARM', 'COLD', 'LOST'] as const;
    const temperature = body.next_lead_temperature ?? 'WARM';
    if (!temperatures.includes(temperature)) throw new BadRequestException('Choose the next lead temperature: HOT, WARM, COLD or LOST.');
    const whatsappMessage = text(body.whatsapp_message, 'WhatsApp response script', 10000, true);
    return {
      label: text(body.label, 'Objection label', 120, true),
      trigger_condition: text(body.trigger_condition, 'Trigger condition', 255, false),
      suggested_action: text(body.suggested_action, 'Suggested SDR action', 255, false),
      next_lead_temperature: temperature as string,
      whatsapp_message: whatsappMessage,
      // The script shown to the rep; the WhatsApp script unless one is given.
      recommended_response_script: text(body.recommended_response_script, 'Recommended response script', 10000, false) || whatsappMessage,
      email_subject: text(body.email_subject, 'Email subject', 255, false) || null,
      email_body: text(body.email_body, 'Email body', 10000, false) || null,
    };
  }

  /**
   * Locks the workspace's objection strategies for one change and, while it is
   * still on the defaults, copies them in. Returns the saved row id of the
   * strategy named by branchId (a row id or a default strategy's id).
   */
  private async claimReplyBranches(tx: Prisma.TransactionClient, tenantId: string, branchId?: unknown): Promise<string | undefined> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-sop-branches:${tenantId}`}, 0))`;
    if ((await tx.rndtechnosoft_crm_sop_reply_branches_master.count({ where: { tenant_id: tenantId } })) === 0) {
      await tx.rndtechnosoft_crm_sop_reply_branches_master.createMany({
        data: Object.values(CADENCE_REPLY_BRANCHES).map((branch, index) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          branch_key: branch.key,
          label: branch.label,
          trigger_condition: branch.triggerCondition,
          suggested_action: branch.suggestedAction,
          recommended_response_script: branch.recommendedResponseScript,
          next_lead_temperature: branch.nextLeadTemperature,
          whatsapp_message: branch.whatsappMessage,
          email_subject: branch.emailMessage?.subject ?? null,
          email_body: branch.emailMessage?.body ?? null,
          sort_order: index,
        })),
      });
    }
    if (branchId === undefined) return undefined;

    const gone = new NotFoundException('That objection strategy no longer exists. Reload the page to see the current list.');
    const defaultKey = typeof branchId === 'string' ? /^default-branch-([a-z0-9_]+)$/.exec(branchId) : null;
    if (!defaultKey && (typeof branchId !== 'string' || !CrmService.UUID_PATTERN.test(branchId))) throw gone;
    const row = await tx.rndtechnosoft_crm_sop_reply_branches_master.findFirst({
      where: defaultKey ? { tenant_id: tenantId, branch_key: defaultKey[1] } : { tenant_id: tenantId, id: branchId as string },
      select: { id: true },
    });
    if (!row) throw gone;
    return row.id;
  }

  /**
   * Adds an objection strategy, or changes the one branchId names. A new
   * strategy's key comes from its label; an existing key never changes,
   * because leads' recorded replies refer to it.
   */
  async saveReplyBranch(tenantId: string, body: any, memberId?: string, branchId?: unknown) {
    const isUpdate = branchId !== undefined;
    const input = this.parseReplyBranch(body);

    const saved = await this.prisma.$transaction(async (tx) => {
      const rowId = await this.claimReplyBranches(tx, tenantId, branchId);
      if (rowId) {
        return tx.rndtechnosoft_crm_sop_reply_branches_master.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: rowId } },
          data: { ...input, updated_at: new Date() },
        });
      }
      const existing = await tx.rndtechnosoft_crm_sop_reply_branches_master.findMany({
        where: { tenant_id: tenantId },
        select: { branch_key: true, sort_order: true },
      });
      const taken = new Set(existing.map((row) => row.branch_key));
      const base = input.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 56) || 'strategy';
      let key = base;
      for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
      return tx.rndtechnosoft_crm_sop_reply_branches_master.create({
        data: { id: randomUUID(), tenant_id: tenantId, branch_key: key, sort_order: Math.max(-1, ...existing.map((row) => row.sort_order)) + 1, ...input },
      });
    });

    await this.logAudit(tenantId, isUpdate ? 'UPDATE' : 'CREATE', 'SOP_BRANCH', saved.id, { branch_key: saved.branch_key, label: saved.label }, memberId);
    return this.toReplyBranchRow((await this.getReplyBranches(tenantId))[saved.branch_key]);
  }

  /**
   * Removes an objection strategy. Leads that already took it keep their
   * recorded reply. A workspace keeps at least one strategy.
   */
  async deleteReplyBranch(tenantId: string, branchId: unknown, memberId?: string) {
    const removed = await this.prisma.$transaction(async (tx) => {
      const id = await this.claimReplyBranches(tx, tenantId, branchId);
      if ((await tx.rndtechnosoft_crm_sop_reply_branches_master.count({ where: { tenant_id: tenantId } })) <= 1) {
        throw new ConflictException('Keep at least one objection strategy. Add another before removing this one.');
      }
      return tx.rndtechnosoft_crm_sop_reply_branches_master.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: id as string } } });
    });
    await this.logAudit(tenantId, 'DELETE', 'SOP_BRANCH', removed.id, { branch_key: removed.branch_key, label: removed.label }, memberId);
  }

  async getMasters(tenantId: string, type?: string) {
    if (type === 'services') {
      return this.prisma.rndtechnosoft_crm_services_master.findMany({
        where: { tenant_id: tenantId },
        orderBy: { sort_order: 'asc' },
      });
    }

    if (type === 'stages') {
      return this.prisma.rndtechnosoft_crm_stages.findMany({
        where: { tenant_id: tenantId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      });
    }

    if (type === 'pipelines') {
      // With how many stages and deals each has, for the Masters list.
      const pipelines = await this.prisma.rndtechnosoft_crm_pipelines.findMany({
        where: { tenant_id: tenantId },
        orderBy: { sort_order: 'asc' },
        include: { _count: { select: { rndtechnosoft_crm_stages: true, rndtechnosoft_crm_leads: true } } },
      });
      return pipelines.map(({ _count, ...pipeline }) => ({
        ...pipeline,
        stages_count: _count.rndtechnosoft_crm_stages,
        leads_count: _count.rndtechnosoft_crm_leads,
      }));
    }

    if (type === 'sources') {
      return this.prisma.rndtechnosoft_crm_lead_sources.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
      });
    }

    if (type === 'lost-reasons') {
      return this.prisma.rndtechnosoft_crm_lost_reasons_master.findMany({
        where: { tenant_id: tenantId },
        orderBy: { reason_name: 'asc' },
      });
    }

    if (type === 'industries') {
      return this.getIndustriesMaster(tenantId);
    }

    if (type === 'sop-steps') {
      return (await this.getCadenceSteps(tenantId)).map((step) => this.toSopStepRow(step));
    }

    if (type === 'sop-branches') {
      return Object.values(await this.getReplyBranches(tenantId)).map((branch) => this.toReplyBranchRow(branch));
    }

    // Default: bundle of active masters
    const [services, stages, pipelines, sources, lostReasons, sopSteps] = await Promise.all([
      this.prisma.rndtechnosoft_crm_services_master.findMany({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_crm_stages.findMany({ where: { tenant_id: tenantId }, orderBy: { sort_order: 'asc' } }),
      this.prisma.rndtechnosoft_crm_pipelines.findMany({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_crm_lead_sources.findMany({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_crm_lost_reasons_master.findMany({ where: { tenant_id: tenantId } }),
      this.getCadenceSteps(tenantId),
    ]);

    return {
      services,
      stages,
      pipelines,
      sources,
      lostReasons,
      industries: CADENCE_INDUSTRIES,
      sopSteps,
      replyBranches: Object.values(await this.getReplyBranches(tenantId)),
    };
  }

  /** Matches a canonical UUID, the format every identifier column expects. */
  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Resolves a pipeline referenced by a request, inside the caller's tenant.
   *
   * The composite [tenant_id, pipeline_id] foreign key already prevents a
   * cross-tenant reference, but it reports that as a constraint violation.
   * Checking here turns a malformed or foreign identifier into a clear
   * message naming what the caller should do.
   */
  private async resolvePipelineForTenant(
    tenantId: string,
    pipelineId: unknown,
  ): Promise<string> {
    if (typeof pipelineId !== 'string' || pipelineId.trim().length === 0) {
      throw new BadRequestException(
        'Choose a pipeline for this stage. Create a pipeline first if none exists.',
      );
    }

    const candidate = pipelineId.trim();

    if (!CrmService.UUID_PATTERN.test(candidate)) {
      throw new BadRequestException(
        'The selected pipeline is not valid. Reload the page and choose a pipeline from the list.',
      );
    }

    const pipeline = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
      where: { id: candidate, tenant_id: tenantId },
      select: { id: true },
    });

    if (!pipeline) {
      // Same answer whether it belongs to another tenant or does not exist.
      throw new NotFoundException('That pipeline was not found in this workspace.');
    }

    return pipeline.id;
  }

  async createMaster(tenantId: string, type: string, body: any) {
    if (type === 'services') {
      return this.prisma.rndtechnosoft_crm_services_master.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          name: body.name,
          category: body.category || 'General',
          sac_code: body.sac_code || body.sacCode || '998314',
          default_rate: new Prisma.Decimal(body.default_rate || body.defaultRate || 0),
          is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
          sort_order: body.sort_order || 1,
        },
      });
    }

    if (type === 'stages') {
      const pipelineId = await this.resolvePipelineForTenant(
        tenantId,
        body.pipeline_id ?? body.pipelineId,
      );

      return this.prisma.rndtechnosoft_crm_stages.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          pipeline_id: pipelineId,
          name: body.name,
          color: body.color || '#2563eb',
          stage_probability: Number(body.stage_probability || body.stageProbability || 20),
          sort_order: Number(body.sort_order || body.sortOrder || 1),
          sla_duration_hours: Number(body.sla_duration_hours || body.slaDurationHours || 48),
          is_won: Boolean(body.is_won),
          is_lost: Boolean(body.is_lost),
        },
      });
    }

    if (type === 'pipelines') {
      const kind = CrmService.pipelineKind(body.pipeline_kind) ?? 'SALES';
      const isDefault = Boolean(body.is_default);
      if (kind === 'OUTREACH' && isDefault) throw new BadRequestException(CrmService.OUTREACH_NOT_DEFAULT);
      return this.prisma.$transaction(async (tx) => {
        const pipeline = await tx.rndtechnosoft_crm_pipelines.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            name: body.name,
            code: body.code || body.name.toUpperCase().replace(/\s+/g, '_'),
            pipeline_kind: kind,
            is_default: isDefault,
          },
        });
        // Outreach leads move through the cadence, not stages; they wait in this one stage until converted.
        if (kind === 'OUTREACH') {
          await tx.rndtechnosoft_crm_stages.create({
            data: { id: randomUUID(), tenant_id: tenantId, pipeline_id: pipeline.id, name: 'In cadence', sort_order: 1 },
          });
        }
        return pipeline;
      });
    }

    if (type === 'sources') {
      return this.prisma.rndtechnosoft_crm_lead_sources.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          name: body.name,
          channel: body.channel || 'DIRECT',
          is_active: true,
        },
      });
    }

    if (type === 'lost-reasons') {
      const reasonName = typeof body.reason_name === 'string' ? body.reason_name.trim() : '';
      if (!reasonName) throw new BadRequestException('Enter the lost reason.');
      if (reasonName.length > 160) throw new BadRequestException('The lost reason must be 160 characters or fewer.');
      return this.prisma.rndtechnosoft_crm_lost_reasons_master.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          reason_name: reasonName,
          is_active: body.is_active !== undefined ? Boolean(Number(body.is_active)) : true,
        },
      });
    }

    return { success: true };
  }

  async updateMaster(tenantId: string, type: string, id: string, body: any) {
    if (type === 'services') {
      return this.prisma.rndtechnosoft_crm_services_master.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          name: body.name,
          category: body.category,
          sac_code: body.sac_code || body.sacCode,
          default_rate: body.default_rate !== undefined ? new Prisma.Decimal(body.default_rate) : undefined,
          is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
        },
      });
    }

    if (type === 'stages') {
      // A stage can move to another pipeline only while no lead is in it; otherwise those leads
      // would sit in one pipeline with a stage of another.
      let pipelineId: string | undefined;
      if (body.pipeline_id !== undefined && body.pipeline_id !== null && body.pipeline_id !== '') {
        const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
          where: { tenant_id: tenantId, id },
          select: { name: true, pipeline_id: true },
        });
        if (!stage) throw new NotFoundException('That stage no longer exists. Reload the page.');
        if (body.pipeline_id !== stage.pipeline_id) {
          pipelineId = await this.resolvePipelineForTenant(tenantId, body.pipeline_id);
          const leads = await this.prisma.rndtechnosoft_crm_leads.count({ where: { tenant_id: tenantId, stage_id: id } });
          if (leads > 0) {
            throw new ConflictException(
              `${leads} lead${leads === 1 ? ' is' : 's are'} in "${stage.name}", so it can't move to another pipeline. Move them to another stage on the Sales Pipeline board first.`,
            );
          }
        }
      }
      return this.prisma.rndtechnosoft_crm_stages.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          ...(pipelineId ? { pipeline_id: pipelineId } : {}),
          name: body.name,
          color: body.color,
          stage_probability: body.stage_probability !== undefined ? Number(body.stage_probability) : undefined,
          sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
          sla_duration_hours: body.sla_duration_hours !== undefined ? Number(body.sla_duration_hours) : undefined,
          is_won: body.is_won !== undefined ? Boolean(body.is_won) : undefined,
          is_lost: body.is_lost !== undefined ? Boolean(body.is_lost) : undefined,
        },
      });
    }

    if (type === 'pipelines') {
      return this.updatePipeline(tenantId, id, body);
    }

    if (type === 'lost-reasons') {
      // Leads refer to a lost reason by id, so renaming one keeps it on every lead that has it.
      const gone = new NotFoundException('That lost reason no longer exists. Reload the page.');
      if (typeof id !== 'string' || !CrmService.UUID_PATTERN.test(id)) throw gone;
      const reasonName = typeof body.reason_name === 'string' ? body.reason_name.trim() : '';
      if (!reasonName) throw new BadRequestException('Enter the lost reason.');
      if (reasonName.length > 160) throw new BadRequestException('The lost reason must be 160 characters or fewer.');
      const reason = await this.prisma.rndtechnosoft_crm_lost_reasons_master.findFirst({ where: { tenant_id: tenantId, id }, select: { id: true } });
      if (!reason) throw gone;
      return this.prisma.rndtechnosoft_crm_lost_reasons_master.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { reason_name: reasonName, ...(body.is_active !== undefined ? { is_active: Boolean(Number(body.is_active)) } : {}) },
      });
    }

    if (type === 'sources') {
      // Leads refer to a source by id, so renaming one keeps it on every lead that has it.
      if (typeof id !== 'string' || !CrmService.UUID_PATTERN.test(id)) throw new NotFoundException('That lead source no longer exists. Reload the page.');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw new BadRequestException('Enter the source name.');
      if (name.length > 100) throw new BadRequestException('The source name must be 100 characters or fewer.');
      const channel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim() : 'DIRECT';
      if (channel.length > 64) throw new BadRequestException('The channel group must be 64 characters or fewer.');
      const source = await this.prisma.rndtechnosoft_crm_lead_sources.findFirst({ where: { tenant_id: tenantId, id }, select: { id: true } });
      if (!source) throw new NotFoundException('That lead source no longer exists. Reload the page.');
      return this.prisma.rndtechnosoft_crm_lead_sources.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { name, channel, ...(body.is_active !== undefined ? { is_active: Boolean(Number(body.is_active)) } : {}) },
      });
    }

    return { success: true };
  }

  private static readonly OUTREACH_NOT_DEFAULT =
    'A Client Outreach pipeline cannot be the default pipeline: new leads without a pipeline go to the default, which must be a sales pipeline.';

  /** A pipeline type sent by CRM Masters; undefined when none was sent. */
  private static pipelineKind(value: unknown): 'SALES' | 'OUTREACH' | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === 'SALES' || value === 'OUTREACH') return value;
    throw new BadRequestException('Choose whether the pipeline is a sales pipeline or a Client Outreach pipeline.');
  }

  /**
   * Renames a pipeline or changes its code, type, default flag or active flag. Codes
   * are unique in a workspace regardless of case (the Cold Funnel is found by
   * code that way), and one pipeline at most is the default. A pipeline's type
   * changes only while it has no leads, and an outreach pipeline is never the
   * default.
   */
  private async updatePipeline(tenantId: string, id: unknown, body: any) {
    const gone = new NotFoundException('That pipeline no longer exists. Reload the page.');
    if (typeof id !== 'string' || !CrmService.UUID_PATTERN.test(id)) throw gone;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new BadRequestException('Enter the pipeline name.');
    if (name.length > 120) throw new BadRequestException('The pipeline name must be 120 characters or fewer.');
    const typedCode = typeof body.code === 'string' ? body.code.trim() : '';
    const code = typedCode || name.toUpperCase().replace(/\s+/g, '_');
    if (code.length > 64) throw new BadRequestException('The pipeline code must be 64 characters or fewer.');

    return this.prisma.$transaction(async (tx) => {
      const pipeline = await tx.rndtechnosoft_crm_pipelines.findFirst({
        where: { tenant_id: tenantId, id },
        select: { id: true, name: true, pipeline_kind: true, is_default: true, _count: { select: { rndtechnosoft_crm_leads: true } } },
      });
      if (!pipeline) throw gone;
      const kind = CrmService.pipelineKind(body.pipeline_kind);
      if (kind && kind !== pipeline.pipeline_kind && pipeline._count.rndtechnosoft_crm_leads > 0) {
        const leads = pipeline._count.rndtechnosoft_crm_leads;
        throw new ConflictException(`The "${pipeline.name}" pipeline has ${leads} lead${leads === 1 ? '' : 's'}, so its type cannot change. Create a new pipeline of the other type instead.`);
      }
      const clash = await tx.rndtechnosoft_crm_pipelines.findFirst({
        where: { tenant_id: tenantId, code: { equals: code, mode: 'insensitive' }, NOT: { id } },
        select: { name: true },
      });
      if (clash) throw new ConflictException(`The "${clash.name}" pipeline already uses the code ${code}. Choose another code.`);

      const isDefault = body.is_default !== undefined ? Boolean(Number(body.is_default)) : undefined;
      if ((kind ?? pipeline.pipeline_kind) === 'OUTREACH' && (isDefault ?? pipeline.is_default)) {
        throw new BadRequestException(CrmService.OUTREACH_NOT_DEFAULT);
      }
      if (isDefault) {
        await tx.rndtechnosoft_crm_pipelines.updateMany({ where: { tenant_id: tenantId, is_default: true, NOT: { id } }, data: { is_default: false } });
      }
      return tx.rndtechnosoft_crm_pipelines.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          name,
          code,
          ...(kind ? { pipeline_kind: kind } : {}),
          ...(isDefault !== undefined ? { is_default: isDefault } : {}),
          ...(body.is_active !== undefined ? { is_active: Boolean(Number(body.is_active)) } : {}),
          updated_at: new Date(),
        },
      });
    });
  }

  /**
   * Deletes a master record. One still in use is refused, saying how many
   * leads (or quotation lines) use it, so no lead is left pointing at nothing
   * and nothing about those leads changes.
   */
  async deleteMaster(tenantId: string, type: string, id: string) {
    const gone = new NotFoundException('That record no longer exists. Reload the page.');
    if (typeof id !== 'string' || !CrmService.UUID_PATTERN.test(id)) throw gone;
    const scope = { tenant_id: tenantId, id };
    const leadCount = (where: Prisma.rndtechnosoft_crm_leadsWhereInput) => this.prisma.rndtechnosoft_crm_leads.count({ where: { tenant_id: tenantId, ...where } });
    const leadsPhrase = (count: number) => `${count} lead${count === 1 ? '' : 's'}`;

    let name: string;
    let remove: () => Promise<unknown>;
    if (type === 'stages') {
      const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({ where: scope, select: { name: true } });
      if (!stage) throw gone;
      const count = await leadCount({ stage_id: id });
      if (count > 0) {
        throw new ConflictException(`${leadsPhrase(count)} ${count === 1 ? 'is' : 'are'} in "${stage.name}". Move them to another stage on the Sales Pipeline board, then delete it.`);
      }
      name = stage.name;
      remove = () => this.prisma.rndtechnosoft_crm_stages.delete({ where: { tenant_id_id: scope } });
    } else if (type === 'pipelines') {
      const pipeline = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({ where: scope, select: { name: true } });
      if (!pipeline) throw gone;
      const count = await leadCount({ pipeline_id: id });
      if (count > 0) {
        throw new ConflictException(`${leadsPhrase(count)} ${count === 1 ? 'is' : 'are'} in the "${pipeline.name}" pipeline. Move them to another pipeline, then delete it.`);
      }
      name = pipeline.name;
      // Its stages go with it.
      remove = () => this.prisma.rndtechnosoft_crm_pipelines.delete({ where: { tenant_id_id: scope } });
    } else if (type === 'sources') {
      const source = await this.prisma.rndtechnosoft_crm_lead_sources.findFirst({ where: scope, select: { name: true } });
      if (!source) throw gone;
      const count = await leadCount({ source_id: id });
      if (count > 0) throw new ConflictException(`"${source.name}" is the source of ${leadsPhrase(count)}, so it can't be deleted. Change their source first.`);
      name = source.name;
      remove = () => this.prisma.rndtechnosoft_crm_lead_sources.delete({ where: { tenant_id_id: scope } });
    } else if (type === 'services') {
      const service = await this.prisma.rndtechnosoft_crm_services_master.findFirst({ where: scope, select: { name: true } });
      if (!service) throw gone;
      const [leads, lines] = await Promise.all([
        leadCount({ primary_service_id: id }),
        this.prisma.rndtechnosoft_crm_quotation_items.count({ where: { tenant_id: tenantId, service_id: id } }),
      ]);
      if (leads + lines > 0) {
        const uses = [leads > 0 ? leadsPhrase(leads) : '', lines > 0 ? `${lines} quotation line${lines === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
        throw new ConflictException(`"${service.name}" is the service on ${uses}, so it can't be deleted. Change their service first.`);
      }
      name = service.name;
      remove = () => this.prisma.rndtechnosoft_crm_services_master.delete({ where: { tenant_id_id: scope } });
    } else if (type === 'lost-reasons') {
      const reason = await this.prisma.rndtechnosoft_crm_lost_reasons_master.findFirst({ where: scope, select: { reason_name: true } });
      if (!reason) throw gone;
      const count = await leadCount({ lost_reason_id: id });
      if (count > 0) throw new ConflictException(`"${reason.reason_name}" is the lost reason of ${leadsPhrase(count)}, so it can't be deleted.`);
      name = reason.reason_name;
      remove = () => this.prisma.rndtechnosoft_crm_lost_reasons_master.delete({ where: { tenant_id_id: scope } });
    } else if (type === 'quotation-templates') {
      // Quotations copy a template's lines, so nothing refers back to it.
      const template = await this.prisma.rndtechnosoft_crm_quotation_templates.findFirst({ where: scope, select: { template_name: true } });
      if (!template) throw gone;
      name = template.template_name;
      remove = () => this.prisma.rndtechnosoft_crm_quotation_templates.delete({ where: { tenant_id_id: scope } });
    } else {
      throw new BadRequestException('That kind of record cannot be deleted here.');
    }

    try {
      await remove();
    } catch (error) {
      // Someone started using it between the check and the delete.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(`"${name}" has just been put to use, so it can't be deleted. Reload the page to see where.`);
      }
      throw error;
    }
    return { success: true };
  }

  /**
   * Saves the order CRM Masters shows after a drag: pipeline stages (the sales
   * board's columns) or pipelines, numbered 1, 2, 3… in the order sent. All or
   * nothing, and only records of this workspace; any other list is refused
   * rather than reported as saved.
   */
  async reorderMasters(tenantId: string, body: any, memberId?: string) {
    const type = body?.masterType;
    const ids: unknown = body?.orderedIds;
    if (type !== 'stages' && type !== 'pipelines') throw new BadRequestException('Only pipelines and pipeline stages can be reordered.');
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === 'string' && CrmService.UUID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('The new order could not be read. Reload the page and try again.');
    }
    const orderedIds = ids as string[];
    const stale = new BadRequestException('Some of these records no longer exist. Reload the page and try again.');
    await this.prisma.$transaction(async (tx) => {
      const where = { tenant_id: tenantId, id: { in: orderedIds } };
      const found = type === 'stages' ? await tx.rndtechnosoft_crm_stages.count({ where }) : await tx.rndtechnosoft_crm_pipelines.count({ where });
      if (found !== orderedIds.length) throw stale;
      for (const [index, id] of orderedIds.entries()) {
        const data = { sort_order: index + 1, updated_at: new Date() };
        if (type === 'stages') await tx.rndtechnosoft_crm_stages.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data });
        else await tx.rndtechnosoft_crm_pipelines.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data });
      }
    });
    await this.logAudit(tenantId, 'REORDER', type === 'stages' ? 'PIPELINE_STAGE' : 'PIPELINE', tenantId, { ordered_ids: orderedIds }, memberId);
    return { saved: orderedIds.length };
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  async getAuditLogs(tenantId: string, query?: {
    page?: number;
    limit?: number;
    leadId?: string;
    actionType?: string;
    actorId?: string;
    entityType?: string;
    search?: string;
  }) {
    const { page, limit, skip } = this.pagination(query?.page, query?.limit);
    const where: any = { tenant_id: tenantId };
    if (query?.leadId) where.entity_id = query.leadId;
    if (query?.actionType) where.action_type = query.actionType;
    if (query?.actorId) where.actor_id = query.actorId;
    if (query?.entityType) where.entity_type = query.entityType;
    if (query?.search) {
      where.OR = [
        { actor_name: { contains: query.search.trim(), mode: 'insensitive' } },
        { action_type: { contains: query.search.trim(), mode: 'insensitive' } },
        { entity_type: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_audit_logs.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: limit }),
      this.prisma.rndtechnosoft_crm_audit_logs.count({ where }),
    ]);
    return this.pageResult(items, total, page, limit);
  }

  async logAudit(
    tenantId: string,
    actionType: string,
    entityType: string,
    entityId: string,
    details?: any,
    actorId?: string,
  ) {
    try {
      await this.prisma.rndtechnosoft_crm_audit_logs.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          action_type: actionType,
          entity_type: entityType,
          entity_id: entityId,
          actor_id: actorId || null,
          changes_diff: details || undefined,
        },
      });
    } catch {
      // ignore logging failures
    }
  }

  // ==========================================
  // SEED CADENCE DEMO LEADS
  // ==========================================

  async seedCadenceDemoLeads(tenantId: string) {
    if (!isCrmDemoSeedAllowed()) {
      throw new ForbiddenException('Sample leads can only be loaded in a demo or sandbox workspace.');
    }
    const pipeline = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: [{ is_default: 'desc' }, { sort_order: 'asc' }],
    });
    if (!pipeline) throw new BadRequestException('No active CRM pipeline found for tenant');

    const stages = await this.prisma.rndtechnosoft_crm_stages.findMany({
      where: { tenant_id: tenantId, pipeline_id: pipeline.id },
      orderBy: { sort_order: 'asc' },
    });
    const defaultStage = stages[0];
    if (!defaultStage) throw new BadRequestException('No stages found for default pipeline');

    const now = new Date();

    // 1. Ensure Nexus Quantum Labs is richly configured for Day 1: Triple Launch
    const existingNexus = await this.prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, company_name: { contains: 'Nexus', mode: 'insensitive' } },
    });

    const nexusData: any = {
      company_name: 'Nexus Quantum Labs',
      first_name: 'Aditya',
      last_name: 'Kulkarni',
      designation: 'Founder & Chief Technology Officer (CTO)',
      email: 'aditya@nexusquantum.io',
      phone: '+919876543210',
      whatsapp_number: '+919876543210',
      website_url: 'https://nexusquantum.io',
      linkedin_url: 'https://linkedin.com/in/adityakulkarni-nexus',
      linkedin_company_url: 'https://linkedin.com/company/nexus-quantum-labs',
      city: 'Bengaluru',
      state: 'Karnataka',
      country_code: 'IN',
      address: 'Block 4, Embassy Tech Village, Outer Ring Road',
      postal_code: '560103',
      industry: 'information_technology',
      sub_industry: 'saas_cloud',
      primary_service: 'Enterprise Cloud & ERP Modernization',
      requirement_brief: 'Nexus Quantum Labs is scaling their deep-tech platform and requires multi-tenant SaaS architecture, cloud optimization, and high-performance ERP modernization.',
      budget_amount: new Prisma.Decimal(750000),
      currency_code: 'INR',
      pipeline_id: pipeline.id,
      stage_id: defaultStage.id,
      temperature: 'COLD',
      ai_score: 88,
      win_probability: new Prisma.Decimal(65),
      urgency: 'HIGH',
      is_won: false,
      is_lost: false,
      converted_client_id: null,
      converted_project_id: null,
      gstin: '29AABCN1234F1Z5',
      pan: 'AABCN1234F',
      cadence_step: 1,
      touchpoints_count: 1,
      custom_attributes: {
        cadence: {
          status: 'ACTIVE',
          industry: 'information_technology',
          funnelName: 'Voogyo RND 30-Day B2B Outbound SOP',
          currentDay: 1,
          currentStepIndex: 0,
          enrolledAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
          nextDueAt: now.toISOString(),
          completedSteps: [],
        },
      },
    };

    let nexusId = existingNexus?.id;
    if (existingNexus) {
      await this.prisma.rndtechnosoft_crm_leads.update({
        where: { id: existingNexus.id },
        data: nexusData,
      });
    } else {
      nexusId = randomUUID();
      await this.prisma.rndtechnosoft_crm_leads.create({
        data: {
          id: nexusId,
          tenant_id: tenantId,
          lead_code: `LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          ...nexusData,
        },
      });
    }

    // 2. Demo Leads for the other milestones
    const demoLeads = [
      {
        company_name: 'Apex Heavy Engineering Ltd',
        first_name: 'Rajesh',
        last_name: 'Sharma',
        designation: 'VP of Manufacturing & Operations',
        email: 'rajesh.sharma@apexheavy.in',
        phone: '+919825012345',
        whatsapp_number: '+919825012345',
        website_url: 'https://apexheavy.in',
        linkedin_url: 'https://linkedin.com/in/rajeshsharma-apex',
        city: 'Vadodara',
        state: 'Gujarat',
        industry: 'manufacturing',
        sub_industry: 'machinery_industrial',
        primary_service: 'B2B Product Catalog & Plant Virtual Tour',
        requirement_brief: 'Upgrading plant operations with virtual inspection tours and export catalog inquiry funnel.',
        budget_amount: new Prisma.Decimal(1250000),
        temperature: 'COLD',
        ai_score: 75,
        win_probability: new Prisma.Decimal(45),
        urgency: 'MEDIUM',
        currentStepIndex: 1,
        currentDay: 5,
        enrolledDaysAgo: 5,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 4 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
        ],
      },
      {
        company_name: 'CarePulse Super Speciality Hospital',
        first_name: 'Dr. Ananya',
        last_name: 'Roy',
        designation: 'Medical Director & COO',
        email: 'ananya.roy@carepulsehospitals.in',
        phone: '+919830012345',
        whatsapp_number: '+919830012345',
        website_url: 'https://carepulsehospitals.in',
        linkedin_url: 'https://linkedin.com/in/dr-ananya-roy',
        city: 'Pune',
        state: 'Maharashtra',
        industry: 'healthcare',
        sub_industry: 'hospitals_clinics',
        primary_service: 'NABH Hospital Portal & Doctor Booking Engine',
        requirement_brief: 'Digital OPD booking portal, doctor schedule manager, and NABH-compliant health inquiry system.',
        budget_amount: new Prisma.Decimal(1800000),
        temperature: 'WARM',
        ai_score: 82,
        win_probability: new Prisma.Decimal(60),
        urgency: 'HIGH',
        currentStepIndex: 2,
        currentDay: 10,
        enrolledDaysAgo: 10,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 9 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL', 'WHATSAPP'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 5 * 86400000).toISOString(), channelsUsed: ['WHATSAPP', 'EMAIL'] },
        ],
      },
      {
        company_name: 'Zenith Petrochem Corp',
        first_name: 'Sanjay',
        last_name: 'Singhania',
        designation: 'Managing Director',
        email: 'sanjay@zenithpetro.com',
        phone: '+919824056789',
        whatsapp_number: '+919824056789',
        website_url: 'https://zenithpetro.com',
        linkedin_url: 'https://linkedin.com/in/sanjaysinghania-petro',
        city: 'Surat',
        state: 'Gujarat',
        industry: 'chemical',
        sub_industry: 'specialty_chemicals',
        primary_service: 'TDS/MSDS Technical Portal & Global Export Funnel',
        requirement_brief: 'Export portal for REACH/ISO compliant chemical data sheets and bulk procurement quotes.',
        budget_amount: new Prisma.Decimal(2400000),
        temperature: 'WARM',
        ai_score: 90,
        win_probability: new Prisma.Decimal(70),
        urgency: 'HIGH',
        currentStepIndex: 3,
        currentDay: 15,
        enrolledDaysAgo: 15,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 14 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), channelsUsed: ['WHATSAPP'] },
          { stepIndex: 2, dayNumber: 10, completedAt: new Date(now.getTime() - 5 * 86400000).toISOString(), channelsUsed: ['EMAIL', 'LINKEDIN'] },
        ],
      },
      {
        company_name: 'Prestige Skyline Real Estate',
        first_name: 'Vikram',
        last_name: 'Malhotra',
        designation: 'Chief Marketing Officer',
        email: 'vikram.m@prestigeskyline.com',
        phone: '+919821034567',
        whatsapp_number: '+919821034567',
        website_url: 'https://prestigeskyline.com',
        linkedin_url: 'https://linkedin.com/in/vikram-malhotra-realty',
        city: 'Mumbai',
        state: 'Maharashtra',
        industry: 'real_estate',
        sub_industry: 'commercial_realty',
        primary_service: '3D Virtual Walkthroughs & Lead Capture Funnel',
        requirement_brief: 'High-converting landing pages for upcoming luxury tower launch with 3D floor plan explorer.',
        budget_amount: new Prisma.Decimal(3500000),
        temperature: 'HOT',
        ai_score: 95,
        win_probability: new Prisma.Decimal(80),
        urgency: 'HIGH',
        currentStepIndex: 4,
        currentDay: 20,
        enrolledDaysAgo: 20,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 19 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 15 * 86400000).toISOString(), channelsUsed: ['WHATSAPP', 'EMAIL'] },
          { stepIndex: 2, dayNumber: 10, completedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), channelsUsed: ['EMAIL'] },
          { stepIndex: 3, dayNumber: 15, completedAt: new Date(now.getTime() - 5 * 86400000).toISOString(), channelsUsed: ['PHONE', 'WHATSAPP'] },
        ],
      },
      {
        company_name: 'OmniCart Global Logistics',
        first_name: 'Neha',
        last_name: 'Agarwal',
        designation: 'Head of Growth & Partnerships',
        email: 'neha@omnicartlogistics.com',
        phone: '+919811098765',
        whatsapp_number: '+919811098765',
        website_url: 'https://omnicartlogistics.com',
        city: 'Gurugram',
        state: 'Haryana',
        industry: 'logistics',
        sub_industry: '3pl_freight',
        primary_service: 'Instant Freight Rate Calculator & Tracking UI',
        requirement_brief: 'Container tracking widget, rate calculator, and automated customer status notifications.',
        budget_amount: new Prisma.Decimal(850000),
        temperature: 'WARM',
        ai_score: 78,
        win_probability: new Prisma.Decimal(50),
        urgency: 'MEDIUM',
        currentStepIndex: 5,
        currentDay: 25,
        enrolledDaysAgo: 25,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 24 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 20 * 86400000).toISOString(), channelsUsed: ['WHATSAPP'] },
          { stepIndex: 2, dayNumber: 10, completedAt: new Date(now.getTime() - 15 * 86400000).toISOString(), channelsUsed: ['EMAIL'] },
          { stepIndex: 3, dayNumber: 15, completedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), channelsUsed: ['PHONE'] },
          { stepIndex: 4, dayNumber: 20, completedAt: new Date(now.getTime() - 5 * 86400000).toISOString(), channelsUsed: ['EMAIL'] },
        ],
      },
      {
        company_name: 'Saffron Living Luxury Resorts',
        first_name: 'Pooja',
        last_name: 'Mehra',
        designation: 'Director of Hospitality & Experiences',
        email: 'pooja@saffronresorts.com',
        phone: '+919829044556',
        whatsapp_number: '+919829044556',
        website_url: 'https://saffronresorts.com',
        city: 'Jaipur',
        state: 'Rajasthan',
        industry: 'travel',
        sub_industry: 'luxury_resorts',
        primary_service: 'Direct Booking Engine & Destination Showcase',
        requirement_brief: 'Fast mobile booking engine, wedding inquiry portal, and experiential tour showcase.',
        budget_amount: new Prisma.Decimal(900000),
        temperature: 'COLD',
        ai_score: 70,
        win_probability: new Prisma.Decimal(30),
        urgency: 'MEDIUM',
        currentStepIndex: 6,
        currentDay: 30,
        enrolledDaysAgo: 29,
        status: 'ACTIVE',
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 28 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 24 * 86400000).toISOString(), channelsUsed: ['WHATSAPP'] },
          { stepIndex: 2, dayNumber: 10, completedAt: new Date(now.getTime() - 19 * 86400000).toISOString(), channelsUsed: ['EMAIL'] },
          { stepIndex: 3, dayNumber: 15, completedAt: new Date(now.getTime() - 14 * 86400000).toISOString(), channelsUsed: ['PHONE'] },
          { stepIndex: 4, dayNumber: 20, completedAt: new Date(now.getTime() - 9 * 86400000).toISOString(), channelsUsed: ['EMAIL'] },
          { stepIndex: 5, dayNumber: 25, completedAt: new Date(now.getTime() - 4 * 86400000).toISOString(), channelsUsed: ['WHATSAPP'] },
        ],
      },
      {
        company_name: 'Aura FinTech Capital',
        first_name: 'Karthik',
        last_name: 'Venkat',
        designation: 'Co-Founder & Chief Operating Officer',
        email: 'karthik@auracapital.in',
        phone: '+919840011223',
        whatsapp_number: '+919840011223',
        website_url: 'https://auracapital.in',
        city: 'Hyderabad',
        state: 'Telangana',
        industry: 'finance',
        sub_industry: 'fintech_advisory',
        primary_service: 'Client KYC & Secure Investment Portal',
        requirement_brief: 'Institutional investor onboarding workflow with encrypted document verification.',
        budget_amount: new Prisma.Decimal(1500000),
        temperature: 'WARM',
        ai_score: 84,
        win_probability: new Prisma.Decimal(55),
        urgency: 'HIGH',
        currentStepIndex: 2,
        currentDay: 10,
        enrolledDaysAgo: 11,
        status: 'BRANCHED',
        branchReply: {
          branchKey: 'already_have_website',
          repliedAt: new Date(now.getTime() - 12 * 3600 * 1000).toISOString(),
          leadFeedback: 'We already have an existing web portal, but interested in speed audit.',
          actionTaken: 'Shared 3-minute video speed & SEO audit report.',
        },
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL'] },
          { stepIndex: 1, dayNumber: 5, completedAt: new Date(now.getTime() - 6 * 86400000).toISOString(), channelsUsed: ['WHATSAPP'] },
        ],
      },
      {
        company_name: 'Apex Global Cloud Systems',
        first_name: 'Devendra',
        last_name: 'Patel',
        designation: 'VP of Technology & Alliances',
        email: 'devendra@apexcloud.io',
        phone: '+919879011234',
        whatsapp_number: '+919879011234',
        website_url: 'https://apexcloud.io',
        city: 'Ahmedabad',
        state: 'Gujarat',
        industry: 'information_technology',
        sub_industry: 'saas_cloud',
        primary_service: 'Enterprise Multi-Tenant SaaS Architecture',
        requirement_brief: 'Client converted from Cold Cadence Day 5 into an active Sales Pipeline Opportunity.',
        budget_amount: new Prisma.Decimal(1650000),
        temperature: 'HOT',
        ai_score: 92,
        win_probability: new Prisma.Decimal(75),
        urgency: 'HIGH',
        currentStepIndex: 1,
        currentDay: 5,
        enrolledDaysAgo: 8,
        status: 'CONVERTED',
        convertedToOpportunity: true,
        opportunityDealValue: 1650000,
        completedSteps: [
          { stepIndex: 0, dayNumber: 1, completedAt: new Date(now.getTime() - 7 * 86400000).toISOString(), channelsUsed: ['LINKEDIN', 'EMAIL', 'WHATSAPP'] },
        ],
      },
    ];

    for (const demo of demoLeads) {
      const existing = await this.prisma.rndtechnosoft_crm_leads.findFirst({
        where: { tenant_id: tenantId, company_name: demo.company_name },
      });

      const payload: any = {
        company_name: demo.company_name,
        first_name: demo.first_name,
        last_name: demo.last_name,
        designation: demo.designation,
        email: demo.email,
        phone: demo.phone,
        whatsapp_number: demo.whatsapp_number,
        website_url: demo.website_url,
        linkedin_url: (demo as any).linkedin_url || null,
        city: demo.city,
        state: demo.state,
        country_code: 'IN',
        industry: demo.industry,
        sub_industry: demo.sub_industry,
        primary_service: demo.primary_service,
        requirement_brief: demo.requirement_brief,
        budget_amount: demo.budget_amount,
        currency_code: 'INR',
        pipeline_id: pipeline.id,
        stage_id: defaultStage.id,
        temperature: demo.temperature,
        ai_score: demo.ai_score,
        win_probability: demo.win_probability,
        urgency: demo.urgency,
        is_won: demo.status === 'CONVERTED',
        is_lost: false,
        cadence_step: demo.currentStepIndex + 1,
        touchpoints_count: demo.completedSteps.length + 1,
        custom_attributes: {
          cadence: {
            status: demo.status || 'ACTIVE',
            industry: demo.industry,
            funnelName: 'Voogyo RND 30-Day B2B Outbound SOP',
            currentDay: demo.currentDay,
            currentStepIndex: demo.currentStepIndex,
            enrolledAt: new Date(now.getTime() - demo.enrolledDaysAgo * 86400000).toISOString(),
            nextDueAt: now.toISOString(),
            completedSteps: demo.completedSteps,
            branchReply: demo.branchReply || undefined,
            convertedToOpportunity: demo.convertedToOpportunity || undefined,
            opportunityDealValue: demo.opportunityDealValue || undefined,
          },
        },
      };

      if (existing) {
        await this.prisma.rndtechnosoft_crm_leads.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await this.prisma.rndtechnosoft_crm_leads.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            lead_code: `LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
            ...payload,
          },
        });
      }
    }

    return {
      success: true,
      message: 'Nexus Quantum Labs updated & 7 demo milestone leads seeded successfully across the 30-Day SOP funnel',
      nexusId,
    };
  }

  // ==========================================
  // DYNAMIC INDUSTRIES & SUB-INDUSTRIES MASTER
  // ==========================================

  async getIndustriesMaster(tenantId: string) {
    const tenantSetting = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
    });
    const settingsJson: any = (tenantSetting?.settings as any) || {};
    let industries: any[] = settingsJson.industries;

    if (!industries || !Array.isArray(industries) || industries.length === 0) {
      // A deep copy: the built-in list is shared by every workspace and must never be mutated.
      industries = JSON.parse(JSON.stringify(BASELINE_INDUSTRIES));
      await this.saveIndustries(tenantId, industries);
    }

    return industries;
  }

  /**
   * Replaces only `settings.industries`, in one statement, so a concurrent save
   * of another settings section (SMTP, modules, profile) is never overwritten.
   */
  private async saveIndustries(tenantId: string, industries: unknown[]) {
    const patch = JSON.stringify({ industries });
    await this.prisma.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${patch}::jsonb, now(), now())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || EXCLUDED.settings,
          updated_at = now()
    `;
  }

  async createIndustry(tenantId: string, name: string) {
    if (!name || !name.trim()) throw new BadRequestException('Industry name is required');
    const industries = await this.getIndustriesMaster(tenantId);
    const newInd = {
      id: `ind_${randomUUID().slice(0, 8)}`,
      name: name.trim(),
      sub_industries: [],
    };
    industries.push(newInd);

    await this.saveIndustries(tenantId, industries);

    return newInd;
  }

  async updateIndustry(tenantId: string, id: string, name: string) {
    if (!id || !name || !name.trim()) throw new BadRequestException('ID and Name are required');
    const industries = await this.getIndustriesMaster(tenantId);
    const ind = industries.find((i: any) => i.id === id);
    if (!ind) throw new NotFoundException('Industry not found');
    ind.name = name.trim();

    await this.saveIndustries(tenantId, industries);

    return ind;
  }

  async deleteIndustry(tenantId: string, id: string) {
    if (!id) throw new BadRequestException('ID is required');
    let industries = await this.getIndustriesMaster(tenantId);
    industries = industries.filter((i: any) => i.id !== id);

    await this.saveIndustries(tenantId, industries);

    return { success: true };
  }

  async createSubIndustry(tenantId: string, industryId: string, name: string) {
    if (!industryId || !name || !name.trim()) throw new BadRequestException('Industry ID and Name are required');
    const industries = await this.getIndustriesMaster(tenantId);
    const ind = industries.find((i: any) => i.id === industryId);
    if (!ind) throw new NotFoundException('Industry not found');

    if (!Array.isArray(ind.sub_industries)) ind.sub_industries = [];
    const newSub = {
      id: `sub_${randomUUID().slice(0, 8)}`,
      industry_id: industryId,
      name: name.trim(),
    };
    ind.sub_industries.push(newSub);

    await this.saveIndustries(tenantId, industries);

    return newSub;
  }

  async updateSubIndustry(tenantId: string, id: string, name: string) {
    if (!id || !name || !name.trim()) throw new BadRequestException('ID and Name are required');
    const industries = await this.getIndustriesMaster(tenantId);
    let foundSub: any = null;
    for (const ind of industries) {
      if (Array.isArray(ind.sub_industries)) {
        const s = ind.sub_industries.find((sub: any) => sub.id === id);
        if (s) {
          s.name = name.trim();
          foundSub = s;
          break;
        }
      }
    }
    if (!foundSub) throw new NotFoundException('Sub-industry not found');

    await this.saveIndustries(tenantId, industries);

    return foundSub;
  }

  async deleteSubIndustry(tenantId: string, id: string) {
    if (!id) throw new BadRequestException('ID is required');
    const industries = await this.getIndustriesMaster(tenantId);
    for (const ind of industries) {
      if (Array.isArray(ind.sub_industries)) {
        ind.sub_industries = ind.sub_industries.filter((sub: any) => sub.id !== id);
      }
    }

    await this.saveIndustries(tenantId, industries);

    return { success: true };
  }
}
