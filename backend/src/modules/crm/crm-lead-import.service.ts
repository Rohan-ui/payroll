import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { COUNTRY_CODES, CountryCodeItem } from '@/common/utils/country-codes.util';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmService } from './crm.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { ImportLeadsDto, LeadImportRowDto } from './dto/lead-import.dto';
import { sopName } from './crm-cadence.helper';
import { LeadVisibility } from './lead-visibility';

export type LeadImportRowOutcome = 'READY' | 'IMPORTED' | 'DUPLICATE' | 'FAILED';

export interface LeadImportRowResult {
  rowNumber: number;
  outcome: LeadImportRowOutcome;
  companyName: string | null;
  email: string | null;
  /** Why the row was not imported. */
  reasons: string[];
  /** Values in an imported row that were not stored, and why. */
  warnings: string[];
  leadId?: string;
  leadCode?: string;
}

type TextField = Exclude<keyof LeadImportRowDto, 'rowNumber'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The rndtechnosoft_crm_leads column sizes, with how each field is named to the person importing. */
const COLUMN_LIMITS: Partial<Record<TextField, { label: string; max: number }>> = {
  companyName: { label: 'Company name', max: 200 },
  firstName: { label: 'First name', max: 100 },
  lastName: { label: 'Last name', max: 100 },
  email: { label: 'Email', max: 320 },
  alternateEmail: { label: 'Secondary email', max: 320 },
  designation: { label: 'Designation', max: 100 },
  industry: { label: 'Industry', max: 80 },
  subIndustry: { label: 'Sub-industry', max: 100 },
  city: { label: 'City', max: 100 },
  state: { label: 'State', max: 100 },
  postalCode: { label: 'Pincode', max: 20 },
  websiteUrl: { label: 'Website', max: 255 },
  websiteStatus: { label: 'Website status', max: 32 },
  linkedinUrl: { label: 'LinkedIn profile', max: 255 },
  linkedinCompanyUrl: { label: 'Company LinkedIn', max: 255 },
};
/** What an imported row must have; a contact name is optional. */
const REQUIRED: { field: TextField; label: string }[] = [
  { field: 'companyName', label: 'company name' },
  { field: 'email', label: 'email' },
  { field: 'phone', label: 'phone' },
];


const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The country a spreadsheet names: an ISO code ("IN"), a name ("India"), a
 * dial-code picker value ("+91 (🇮🇳 India)") or a dial code ("+91", "91").
 */
export function resolveCountry(raw: string): CountryCodeItem | null {
  const value = raw.trim();
  if (!value) return null;
  const byIso = COUNTRY_CODES.find((c) => c.iso === value.toUpperCase());
  if (byIso) return byIso;
  const named = value.match(/\(([^)]*)\)/)?.[1] ?? value;
  const name = squash(named);
  const byName = name ? COUNTRY_CODES.find((c) => squash(c.name) === name) : undefined;
  if (byName) return byName;
  if (!/^\+?\d{1,4}$/.test(value)) return null;
  const dial = value.startsWith('+') ? value : `+${value}`;
  const byDial = COUNTRY_CODES.filter((c) => c.code === dial).sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  return byDial[0] ?? null;
}

/**
 * The phone numbers in a spreadsheet cell, each as "+<country code> <number>":
 * "98250 12345", "919825012345" (country code already there), "097277 06665"
 * (leading 0), "+971 50 123 4567", "0091…", and cells holding several numbers
 * ("98250 12345 / 98250 67890"). `extraText` is whatever else the cell said
 * ("(Apar Umargam)"), so it can be kept rather than lost.
 */
export function parsePhones(raw: string, dialCode: string): { numbers: string[]; extraText: string } {
  const dialDigits = dialCode.replace(/\D/g, '');
  const numbers: string[] = [];
  for (const part of raw.split(/[/,;|]|\bor\b/i)) {
    const digits = part.replace(/[^\d+]/g, '');
    let international = digits.startsWith('+') ? digits.slice(1).replace(/\+/g, '') : digits.startsWith('00') ? digits.slice(2) : null;
    let national = international === null ? digits.replace(/\+/g, '') : '';
    if (international !== null) {
      // Written with its country code: split it off when it is this lead's country.
      if (!international.startsWith(dialDigits)) {
        if (international.length >= 8 && international.length <= 15) numbers.push(`+${international}`);
        continue;
      }
      national = international.slice(dialDigits.length);
      international = null;
    } else if (national.startsWith(dialDigits) && national.length - dialDigits.length >= 9) {
      national = national.slice(dialDigits.length);
    }
    national = national.replace(/^0/, '');
    if (national.length >= 6 && national.length <= 13) numbers.push(`${dialCode} ${national}`);
  }
  const extraText = raw.replace(/[\d+\-().\s/,;|]/g, ' ').replace(/\bor\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { numbers, extraText };
}

/**
 * A budget cell as an exact decimal string ("1,50,000", "₹ 2500.50", "INR 9000"),
 * or null when it is not a non-negative amount with at most two decimals.
 */
export function parseBudget(raw: string): string | null {
  const value = raw.replace(/₹|inr|rs\.?|,|\s/gi, '');
  return /^\d{1,12}(\.\d{1,2})?$/.test(value) ? value : null;
}

/**
 * Imports spreadsheet rows as leads, into Client Outreach (enrolled in the
 * workspace's outreach cadence) or straight into a sales pipeline, as the
 * person importing chose. Every row is checked here, whatever the import screen
 * already checked. Each row stands alone: one bad row is reported and the rest
 * still import, and a dry run reports the same outcome without saving.
 */
@Injectable()
export class CrmLeadImportService {
  private readonly logger = new Logger(CrmLeadImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly assignments: CrmLeadAssignmentService,
  ) {}

  /**
   * What the import screen offers: the workspace's active pipelines by type,
   * each with its open stages, the outreach cadence imported leads follow, and
   * every active team member, marked with whether leads can be assigned to them
   * (the person importing is chosen by default).
   */
  async options(tenantId: string, actorMemberId: string) {
    const [pipelines, steps, assignees] = await Promise.all([
      this.prisma.rndtechnosoft_crm_pipelines.findMany({
        where: { tenant_id: tenantId, is_active: true },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        select: {
          id: true, name: true, pipeline_kind: true, is_default: true,
          rndtechnosoft_crm_stages: { where: { is_won: false, is_lost: false }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], select: { id: true, name: true } },
        },
      }),
      this.crm.getCadenceSteps(tenantId),
      this.assignments.assignees(tenantId),
    ]);
    return {
      // Every active member of the workspace; `eligible` false for those who can't be given leads (their role can't view leads).
      assignees: assignees.map(({ id, name, email, eligible }) => ({ id, name, email, eligible: eligible || id === actorMemberId })),
      currentMemberId: actorMemberId,
      pipelines: pipelines.map(({ rndtechnosoft_crm_stages: stages, pipeline_kind, is_default, ...p }) => ({ ...p, kind: pipeline_kind, isDefault: is_default, stages })),
      cadence: { name: sopName(steps), steps: steps.length, days: Math.max(0, ...steps.map((s) => s.dayNumber)) },
    };
  }

  async importLeads(tenantId: string, actorMemberId: string, visibility: LeadVisibility, dto: ImportLeadsDto) {
    const outreach = dto.destination === 'CLIENT_OUTREACH';
    const { pipeline, stage } = await this.placement(tenantId, dto);
    const [sources, assignees, cadenceSteps] = await Promise.all([
      this.prisma.rndtechnosoft_crm_lead_sources.findMany({ where: { tenant_id: tenantId }, select: { id: true, name: true } }),
      this.assignments.assignees(tenantId),
      outreach ? this.crm.getCadenceSteps(tenantId) : Promise.resolve([]),
    ]);
    // Into the 30-day SOP itself (no outreach pipeline chosen), or through a Client Outreach pipeline.
    const intoSop = outreach && !dto.pipelineId;
    const target = intoSop ? sopName(cadenceSteps) : pipeline.name;
    const sourceByName = new Map(sources.map((s) => [s.name.trim().toLowerCase(), s.id]));
    // The chosen team member must be one who can be given leads, in this workspace; by default the person importing.
    const chosen = dto.assigneeMemberId && dto.assigneeMemberId !== actorMemberId
      ? await this.assignments.eligibleAssignee(this.prisma, tenantId, dto.assigneeMemberId)
      : null;
    const defaultAssignee = chosen ?? { id: actorMemberId, name: assignees.find((a) => a.id === actorMemberId)?.name ?? 'you' };
    // By email, full name, or a first name only one member has ("Meet", "Sagar").
    const assigneeByKey = new Map<string, (typeof assignees)[number]>();
    const firstNames = new Map<string, (typeof assignees)[number][]>();
    for (const a of assignees) {
      const first = a.name.trim().split(/\s+/)[0].toLowerCase();
      firstNames.set(first, [...(firstNames.get(first) ?? []), a]);
    }
    for (const [first, members] of firstNames) if (members.length === 1) assigneeByKey.set(first, members[0]);
    for (const a of assignees) {
      assigneeByKey.set(a.name.trim().toLowerCase(), a);
      assigneeByKey.set(a.email.toLowerCase(), a);
    }

    const results: LeadImportRowResult[] = [];
    const ready: { result: LeadImportRowResult; data: Record<string, unknown> }[] = [];
    const firstRowByEmail = new Map<string, number>();
    for (const row of dto.rows) {
      const { result, data } = this.prepare(row, { sourceByName, assigneeByKey, defaultAssignee: chosen ? chosen : null });
      results.push(result);
      if (result.outcome === 'FAILED') continue;
      const earlier = firstRowByEmail.get(result.email!);
      if (earlier !== undefined) {
        result.outcome = 'DUPLICATE';
        result.reasons.push(`Same email as row ${earlier} of this file.`);
        continue;
      }
      firstRowByEmail.set(result.email!, row.rowNumber);
      ready.push({ result, data });
    }

    // Leads already in this workspace with the same email are skipped, never duplicated,
    // whoever they are assigned to; the existing lead is named only to those who may see it.
    const existing = firstRowByEmail.size
      ? await this.prisma.rndtechnosoft_crm_leads.findMany({
          where: { tenant_id: tenantId, email: { in: [...firstRowByEmail.keys()], mode: 'insensitive' } },
          select: { email: true, lead_code: true, assigned_tenant_member_id: true },
        })
      : [];
    const existingCode = new Map(existing.map((lead) => [
      lead.email.toLowerCase(),
      visibility.all || lead.assigned_tenant_member_id === visibility.memberId ? lead.lead_code : null,
    ]));

    const createdVia = `spreadsheet import${dto.fileName ? ` (${dto.fileName})` : ''} into ${outreach ? 'Client Outreach' : 'the sales pipeline'}: ${target}`;
    for (const { result, data } of ready) {
      if (existingCode.has(result.email!)) {
        const code = existingCode.get(result.email!);
        result.outcome = 'DUPLICATE';
        result.reasons.push(code ? `A lead with this email already exists (${code}).` : 'A lead with this email already exists in this workspace.');
        continue;
      }
      if (dto.dryRun) continue;
      try {
        const lead = await this.crm.createLead(
          tenantId,
          { ...data, temperature: outreach ? 'COLD' : 'WARM', pipeline_id: pipeline.id, stage_id: stage.id },
          actorMemberId,
          // Into the SOP, enrolled exactly as every other Client Outreach lead is.
          { outreachFunnel: intoSop ? undefined : pipeline.name, createdVia, firstNameOptional: true },
        );
        result.outcome = 'IMPORTED';
        result.leadId = lead.id;
        result.leadCode = lead.lead_code;
      } catch (error) {
        result.outcome = 'FAILED';
        if (error instanceof BadRequestException) {
          result.reasons.push(error.message);
        } else {
          this.logger.error(`Lead import row failed: tenant=${tenantId} row=${result.rowNumber} error=${error instanceof Error ? error.name : 'unknown'}`);
          result.reasons.push('This row could not be saved. Import it again; if it still fails, contact support.');
        }
      }
    }

    const count = (outcome: LeadImportRowOutcome) => results.filter((r) => r.outcome === outcome).length;
    const imported = count('IMPORTED');
    const summary = {
      processed: results.length,
      ready: count('READY'),
      imported,
      duplicates: count('DUPLICATE'),
      failed: count('FAILED'),
      enrolled: outreach ? imported : 0,
      withWarnings: results.filter((r) => r.outcome !== 'FAILED' && r.outcome !== 'DUPLICATE' && r.warnings.length > 0).length,
    };
    if (!dto.dryRun) {
      await this.crm.logAudit(tenantId, 'IMPORT_LEADS', 'LEAD', tenantId, {
        destination: dto.destination, pipeline_id: pipeline.id, stage_id: stage.id, assignee_member_id: defaultAssignee.id, file_name: dto.fileName ?? null, ...summary,
      }, actorMemberId);
    }

    return {
      dryRun: Boolean(dto.dryRun),
      destination: dto.destination,
      pipeline: { id: pipeline.id, name: pipeline.name },
      stage: { id: stage.id, name: stage.name },
      assignee: { id: defaultAssignee.id, name: defaultAssignee.name },
      cadence: outreach ? { name: target, steps: cadenceSteps.length, days: Math.max(0, ...cadenceSteps.map((s) => s.dayNumber)) } : null,
      summary,
      rows: results,
    };
  }

  /**
   * The pipeline and stage the rows go into, checked against the destination.
   * Into the 30-day SOP: where every Client Outreach lead waits until it is
   * converted, the default sales pipeline's first open stage (the cadence keeps
   * it off the sales board). Through a chosen Client Outreach pipeline: its
   * first stage. Into sales: an active sales pipeline and one of its open stages.
   */
  private async placement(tenantId: string, dto: ImportLeadsDto) {
    const outreach = dto.destination === 'CLIENT_OUTREACH';
    if (outreach && !dto.pipelineId) {
      const home = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
        where: { tenant_id: tenantId, pipeline_kind: 'SALES' },
        orderBy: [{ is_default: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
        select: { id: true, name: true, rndtechnosoft_crm_stages: { where: { is_won: false, is_lost: false }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], take: 1, select: { id: true, name: true } } },
      });
      const [stage] = home?.rndtechnosoft_crm_stages ?? [];
      if (!home || !stage) throw new BadRequestException('Create a sales pipeline with at least one stage (CRM Masters → Pipelines) before adding leads.');
      return { pipeline: { id: home.id, name: home.name }, stage };
    }
    const pipeline = await this.prisma.rndtechnosoft_crm_pipelines.findFirst({
      where: { tenant_id: tenantId, id: dto.pipelineId, is_active: true },
      select: { id: true, name: true, pipeline_kind: true },
    });
    if (!pipeline) throw new BadRequestException('That pipeline is not an active pipeline in this workspace. Reload the page and choose another.');
    if (outreach && pipeline.pipeline_kind !== 'OUTREACH') {
      throw new BadRequestException(`"${pipeline.name}" is a sales pipeline. Choose a Client Outreach pipeline, or import into the Sales Pipeline instead.`);
    }
    if (!outreach && pipeline.pipeline_kind !== 'SALES') {
      throw new BadRequestException(`"${pipeline.name}" is a Client Outreach pipeline. Choose a sales pipeline, or import into Client Outreach instead.`);
    }
    const stage = await this.prisma.rndtechnosoft_crm_stages.findFirst({
      where: { tenant_id: tenantId, pipeline_id: pipeline.id, is_won: false, is_lost: false, ...(outreach ? {} : { id: dto.stageId }) },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { id: true, name: true },
    });
    if (!stage) {
      throw new BadRequestException(
        outreach
          ? `The "${pipeline.name}" outreach pipeline has no stage. Add one in CRM Masters → Pipeline Stages, then import again.`
          : `That stage is not an open stage of the "${pipeline.name}" pipeline. Choose one of its open stages.`,
      );
    }
    return { pipeline, stage };
  }

  /** One row's checks and the lead it would create; nothing is read from the database here. */
  private prepare(
    row: LeadImportRowDto,
    lookups: {
      sourceByName: Map<string, string>;
      assigneeByKey: Map<string, { id: string; name: string; eligible: boolean }>;
      /** The member chosen on the import screen; null when the leads go to the person importing. */
      defaultAssignee: { id: string; name: string } | null;
    },
  ) {
    const value = (field: TextField) => (row[field] ?? '').trim();
    const email = value('email').toLowerCase();
    const result: LeadImportRowResult = {
      rowNumber: row.rowNumber,
      outcome: 'READY',
      companyName: value('companyName') || null,
      email: email || null,
      reasons: [],
      warnings: [],
    };

    const missing = REQUIRED.filter(({ field }) => !value(field)).map(({ label }) => label);
    if (missing.length) result.reasons.push(`Missing ${missing.join(', ')}.`);
    if (email && !EMAIL.test(email)) result.reasons.push(`"${email}" is not a valid email address.`);
    const country = value('country') ? resolveCountry(value('country')) : null;
    const dialCode = country?.code ?? '+91';
    const phones = {
      phone: parsePhones(value('phone'), dialCode),
      alternatePhone: parsePhones(value('alternatePhone'), dialCode),
      whatsappNumber: parsePhones(value('whatsappNumber'), dialCode),
    };
    if (value('phone') && phones.phone.numbers.length === 0) result.reasons.push(`"${value('phone')}" is not a phone number.`);

    // Values too long for their column: a required one fails the row, any other is left out and reported.
    const kept: Partial<Record<TextField, string>> = {};
    for (const [field, limit] of Object.entries(COLUMN_LIMITS) as [TextField, { label: string; max: number }][]) {
      const text = value(field);
      if (!text) continue;
      if (text.length <= limit.max) kept[field] = text;
      else if (REQUIRED.some((r) => r.field === field)) result.reasons.push(`${limit.label} is longer than ${limit.max} characters.`);
      else result.warnings.push(`${limit.label} is longer than ${limit.max} characters, so it was not imported.`);
    }
    if (kept.alternateEmail && !EMAIL.test(kept.alternateEmail)) {
      result.warnings.push(`Secondary email "${kept.alternateEmail}" is not a valid email address, so it was not imported.`);
      delete kept.alternateEmail;
    }
    if (result.reasons.length) {
      result.outcome = 'FAILED';
      return { result, data: {} };
    }

    if (value('country') && !country) {
      result.warnings.push(`Country "${value('country')}" is not recognised, so the lead's country was left as India.`);
    }
    // The first number of each phone cell is stored (a second phone number becomes the alternate
    // phone when that column is empty); the whole cell goes to the notes when anything else in it was not stored.
    const phoneNotes: string[] = [];
    const [mainPhone = null, secondPhone] = phones.phone.numbers;
    const optionalPhone = (field: 'alternatePhone' | 'whatsappNumber', label: string) => {
      if (value(field) && phones[field].numbers.length === 0) {
        result.warnings.push(`${label} "${value(field)}" is not a phone number, so it was not imported.`);
        return null;
      }
      if (phones[field].numbers.length > 1 || phones[field].extraText) phoneNotes.push(`${label}: ${value(field)}`);
      return phones[field].numbers[0] ?? null;
    };
    const alternatePhone = optionalPhone('alternatePhone', 'Alternate phone') ?? secondPhone ?? null;
    const whatsappNumber = optionalPhone('whatsappNumber', 'WhatsApp number');
    const phoneStored = alternatePhone === secondPhone ? 2 : 1;
    if (phones.phone.numbers.length > phoneStored || phones.phone.extraText) phoneNotes.unshift(`Phone: ${value('phone')}`);

    let budget: string | null = null;
    if (value('budgetAmount')) {
      budget = parseBudget(value('budgetAmount'));
      if (budget === null) result.warnings.push(`Budget "${value('budgetAmount')}" is not an amount, so it was not imported.`);
    }

    let sourceId: string | undefined;
    if (value('leadSource')) {
      sourceId = lookups.sourceByName.get(value('leadSource').toLowerCase());
      if (!sourceId) result.warnings.push(`Lead source "${value('leadSource')}" is not in CRM Masters → Lead Sources, so it was left blank.`);
    }

    let assigneeId: string | undefined;
    if (value('assignedTo')) {
      // "Amit Patel (SEO Lead)": the name without the role in brackets.
      const named = value('assignedTo').replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
      const assignee = lookups.assigneeByKey.get(value('assignedTo').toLowerCase()) ?? lookups.assigneeByKey.get(named);
      const fallback = lookups.defaultAssignee ? lookups.defaultAssignee.name : 'you';
      if (assignee?.eligible) assigneeId = assignee.id;
      else if (assignee) result.warnings.push(`${assignee.name} cannot be given leads, so the lead was assigned to ${fallback}.`);
      else result.warnings.push(`"${value('assignedTo')}" is not a team member, so the lead was assigned to ${fallback}.`);
    }
    assigneeId ??= lookups.defaultAssignee?.id;

    const data: Record<string, unknown> = {
      company_name: kept.companyName,
      first_name: kept.firstName ?? null,
      last_name: kept.lastName ?? null,
      email,
      alternate_email: kept.alternateEmail ?? null,
      phone: mainPhone,
      alternate_phone: alternatePhone,
      whatsapp_number: whatsappNumber,
      designation: kept.designation ?? null,
      industry: kept.industry ?? null,
      sub_industry: kept.subIndustry ?? null,
      city: kept.city ?? null,
      state: kept.state ?? null,
      country_code: country?.iso,
      address: value('address') || null,
      postal_code: kept.postalCode ?? null,
      website_url: kept.websiteUrl ?? null,
      website_status: kept.websiteStatus ?? null,
      linkedin_url: kept.linkedinUrl ?? null,
      linkedin_company_url: kept.linkedinCompanyUrl ?? null,
      source_id: sourceId,
      assigned_user_id: assigneeId,
      budget_amount: budget,
      requirement_brief: value('requirementBrief') || null,
      internal_notes: [value('internalNotes'), ...phoneNotes].filter(Boolean).join('\n') || null,
    };
    return { result, data };
  }
}
