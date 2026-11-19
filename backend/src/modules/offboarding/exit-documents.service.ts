import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { DocumentPdfService } from '@/modules/documents/document-pdf.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { formatInr, formatLetterDate } from '@/modules/documents/document-templates';
import { defaultDocument, DocNode, documentText, fillDocument, parseDocument } from '@/modules/documents/rich-document';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { serviceLength } from './settlement-calculation';
import { OffboardingNotificationsService } from './offboarding-notifications.service';

type Actor = AuthenticatedTenantUser;

export const EXIT_DOCUMENT_TYPES = ['EXPERIENCE_LETTER', 'RELIEVING_LETTER', 'FULL_AND_FINAL_STATEMENT'] as const;
export type ExitDocumentType = (typeof EXIT_DOCUMENT_TYPES)[number];
const LABELS: Record<ExitDocumentType, string> = { EXPERIENCE_LETTER: 'Experience letter', RELIEVING_LETTER: 'Relieving letter', FULL_AND_FINAL_STATEMENT: 'Full and final statement' };
const SEPARATION_WORDS: Record<string, string> = { RESIGNATION: 'resignation', TERMINATION: 'termination', RETIREMENT: 'retirement', CONTRACT_END: 'contract completion' };
const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const DEFAULT_LAYOUT = { page_size: 'A4', margin_top_mm: 20, margin_right_mm: 20, margin_bottom_mm: 20, margin_left_mm: 20, show_page_numbers: false };

/**
 * Exit letters and the settlement statement, made from the employee's own
 * records (not a candidate's), stored with the other HR letters against the
 * employee and their exit, and versioned. A draft can be regenerated; once
 * issued it never changes. Files are only ever served through the session.
 */
const ISSUED_LABEL: Record<string, string> = { EXPERIENCE_LETTER: 'experience letter', RELIEVING_LETTER: 'relieving letter', FULL_AND_FINAL_STATEMENT: 'full and final settlement statement' };

@Injectable()
export class ExitDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdf: DocumentPdfService,
    private readonly letterheads: LetterheadsService,
    private readonly notifications: OffboardingNotificationsService,
  ) {}

  async list(tenantId: string, separationId: string) {
    await this.separation(tenantId, separationId);
    const [rows, templates] = await Promise.all([
      this.prisma.rndtechnosoft_candidate_documents.findMany({
        where: { tenant_id: tenantId, separation_id: separationId, document_type: { in: [...EXIT_DOCUMENT_TYPES] } },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.rndtechnosoft_document_templates.findMany({
        where: { tenant_id: tenantId, is_archived: false, template_kind: { in: ['EXPERIENCE_LETTER', 'RELIEVING_LETTER'] } },
        orderBy: { template_name: 'asc' }, select: { id: true, template_name: true, template_kind: true },
      }),
    ]);
    const names = await this.memberNames(tenantId, rows.flatMap((r) => [r.created_by_tenant_member_id, r.updated_by_tenant_member_id]));
    return {
      documents: rows.map((r) => ({
        id: r.id, type: r.document_type as ExitDocumentType, label: LABELS[r.document_type as ExitDocumentType], title: r.rendered_title ?? r.document_title,
        status: r.document_status === 'DRAFT' ? 'DRAFT' : 'ISSUED', version: r.version_number,
        generatedBy: names.get(r.updated_by_tenant_member_id ?? r.created_by_tenant_member_id ?? '') ?? null, generatedAt: r.updated_at.toISOString(),
        missing: missingKeys(r.rendered_document as unknown as DocNode | null),
      })),
      templates: templates.map((t) => ({ id: t.id, name: t.template_name, kind: t.template_kind })),
      types: EXIT_DOCUMENT_TYPES.map((type) => ({ type, label: LABELS[type] })),
    };
  }

  /** Makes a document as a draft, or a new version of the draft already there. An issued document is never replaced. */
  async generate(tenantId: string, separationId: string, input: { documentType: ExitDocumentType; templateId?: string; letterheadId?: string }, actor: Actor) {
    const s = await this.separation(tenantId, separationId);
    if (s.rndtechnosoft_employees.user_id === actor.userId) throw new ForbiddenException('You can’t make your own exit letters. Ask someone else in HR.');
    if (!['IN_PROGRESS', 'COMPLETED'].includes(s.separation_status)) throw new BadRequestException('Exit documents are made once the exit is under way.');

    const values = await this.values(tenantId, s, actor);
    const built = input.documentType === 'FULL_AND_FINAL_STATEMENT'
      ? await this.statement(tenantId, s, values, input.letterheadId ?? null)
      : await this.letter(tenantId, input.documentType, input.templateId);
    // A detail the records lack stays visible as {{key}}, so the draft shows it and it can't be issued.
    const fill = { ...values };
    for (const key of missingKeys(built.document)) if (!fill[key]) fill[key] = `{{${key}}}`;
    const document = fillDocument(built.document, fill);
    const { body } = documentText(document);
    const title = `${values.employee_name} - ${LABELS[input.documentType]}`;

    const existing = await this.prisma.rndtechnosoft_candidate_documents.findFirst({ where: { tenant_id: tenantId, separation_id: separationId, document_type: input.documentType } });
    if (existing && existing.document_status !== 'DRAFT') throw new ConflictException(`The ${LABELS[input.documentType].toLowerCase()} has been issued, so it can’t be regenerated.`);
    const id = existing?.id ?? randomUUID();
    const version = (existing?.version_number ?? 0) + 1;
    const layout = { letterhead_id: built.letterheadId, ...built.layout };
    try {
      await this.prisma.$transaction(async (tx) => {
        const content = {
          template_id: built.templateId, template_version_id: built.templateVersionId, document_title: title, rendered_title: title, rendered_body: body,
          rendered_document: document as unknown as Prisma.InputJsonValue, ...layout, version_number: version, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date(),
        };
        if (existing) {
          const changed = await tx.rndtechnosoft_candidate_documents.updateMany({ where: { tenant_id: tenantId, id, document_status: 'DRAFT', version_number: existing.version_number }, data: content });
          if (changed.count !== 1) throw new ConflictException('This document changed while you were working. Reload and try again.');
        } else {
          await tx.rndtechnosoft_candidate_documents.create({
            data: { id, tenant_id: tenantId, candidate_id: null, employee_id: s.employee_id, separation_id: separationId, document_type: input.documentType, document_status: 'DRAFT', created_by_tenant_member_id: actor.tenantMemberId, ...content },
          });
        }
        await tx.rndtechnosoft_candidate_document_versions.create({
          data: {
            id: randomUUID(), tenant_id: tenantId, document_id: id, version_number: version, title, body, document_data: document as unknown as Prisma.InputJsonValue,
            layout_data: layout as unknown as Prisma.InputJsonValue, changelog_note: existing ? 'Regenerated from the exit' : 'Generated from the exit', created_by_tenant_member_id: actor.tenantMemberId,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This document was just generated by someone else. Reload to see it.');
      throw error;
    }
    await this.log(tenantId, actor, existing ? 'EXIT_DOCUMENT_REGENERATED' : 'EXIT_DOCUMENT_GENERATED', id, { separation_id: separationId, new: { type: input.documentType, version, template_id: built.templateId } });
    return this.list(tenantId, separationId);
  }

  /** Issues a draft as official. Letters need the exit completed; the statement needs an approved settlement it still matches. */
  async issue(tenantId: string, separationId: string, documentId: string, actor: Actor) {
    const s = await this.separation(tenantId, separationId);
    if (s.rndtechnosoft_employees.user_id === actor.userId) throw new ForbiddenException('You can’t issue your own exit letters. Ask someone else in HR.');
    const doc = await this.document(tenantId, separationId, documentId);
    if (doc.document_status !== 'DRAFT') throw new ConflictException('This document has already been issued.');
    const missing = missingKeys(doc.rendered_document as unknown as DocNode | null);
    if (missing.length) throw new BadRequestException(`Fill in the missing details first (${missing.join(', ')}), then regenerate it.`);
    if (doc.document_type === 'FULL_AND_FINAL_STATEMENT') {
      const settlement = await this.liveSettlement(tenantId, separationId);
      if (!settlement || !['APPROVED', 'PAID'].includes(settlement.settlement_status)) throw new BadRequestException('The statement can be issued once the settlement is approved.');
      if (settlement.updated_at > doc.updated_at) throw new ConflictException('The settlement changed after this statement was made. Regenerate it first.');
    } else if (s.separation_status !== 'COMPLETED') {
      throw new BadRequestException('Letters are issued once the exit is completed.');
    }
    const changed = await this.prisma.rndtechnosoft_candidate_documents.updateMany({
      where: { tenant_id: tenantId, id: documentId, document_status: 'DRAFT', version_number: doc.version_number },
      data: { document_status: 'APPROVED', updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('This document changed while you were working. Reload and try again.');
    await this.log(tenantId, actor, 'EXIT_DOCUMENT_ISSUED', documentId, { separation_id: separationId, new: { type: doc.document_type, version: doc.version_number } });
    // Their sign-in ends with the exit, so the issued letter reaches them by email, with the PDF.
    this.notifications.notify(tenantId, 'LETTER_ISSUED', separationId, {
      actor, key: `${documentId}:${doc.version_number}`, detail: ISSUED_LABEL[doc.document_type] ?? 'letter',
      attachment: async () => { const file = await this.pdfFile(tenantId, separationId, documentId); return { filename: file.filename, content: Buffer.from(file.bytes), contentType: 'application/pdf' }; },
    });
    return this.list(tenantId, separationId);
  }

  async versions(tenantId: string, separationId: string, documentId: string) {
    await this.document(tenantId, separationId, documentId);
    const rows = await this.prisma.rndtechnosoft_candidate_document_versions.findMany({
      where: { tenant_id: tenantId, document_id: documentId }, orderBy: { version_number: 'desc' },
      select: { version_number: true, changelog_note: true, created_by_tenant_member_id: true, created_at: true },
    });
    const names = await this.memberNames(tenantId, rows.map((r) => r.created_by_tenant_member_id));
    return rows.map((r) => ({ version: r.version_number, note: r.changelog_note, createdBy: names.get(r.created_by_tenant_member_id ?? '') ?? null, createdAt: r.created_at.toISOString() }));
  }

  /** The PDF of the current document, or of one of its versions. */
  async pdfFile(tenantId: string, separationId: string, documentId: string, versionNumber?: number) {
    const doc = await this.document(tenantId, separationId, documentId);
    let document = doc.rendered_document as unknown as DocNode;
    let title = doc.rendered_title ?? doc.document_title;
    let layoutSource = { letterhead_id: doc.letterhead_id, page_size: doc.page_size, margin_top_mm: doc.margin_top_mm, margin_right_mm: doc.margin_right_mm, margin_bottom_mm: doc.margin_bottom_mm, margin_left_mm: doc.margin_left_mm, show_page_numbers: doc.show_page_numbers };
    let version = doc.version_number;
    let dated = doc.updated_at;
    if (versionNumber !== undefined && versionNumber !== doc.version_number) {
      const row = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({ where: { tenant_id: tenantId, document_id: documentId, version_number: versionNumber } });
      if (!row) throw new NotFoundException('Version not found.');
      document = row.document_data as unknown as DocNode;
      title = row.title;
      layoutSource = { ...layoutSource, ...(row.layout_data as Partial<typeof layoutSource> | null) };
      version = row.version_number;
      dated = row.created_at;
    }
    const s = await this.separation(tenantId, separationId);
    const layout = await this.letterheads.layoutFor(tenantId, layoutSource);
    const tenant = await this.prisma.rndtechnosoft_tenants.findFirst({ where: { id: tenantId }, select: { display_name: true, legal_name: true } });
    const bytes = await this.pdf.render({
      companyName: layout.letterhead?.companyName || tenant?.display_name || tenant?.legal_name || 'Company',
      reference: s.rndtechnosoft_employees.employee_code, dateText: formatLetterDate(dated), title, body: documentText(document).body, document,
    }, layout);
    const safe = (text: string) => text.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
    return { bytes, filename: `${safe(title)}_v${version}.pdf` };
  }

  // ── Content ─────────────────────────────────────────────────

  private async letter(tenantId: string, kind: 'EXPERIENCE_LETTER' | 'RELIEVING_LETTER', templateId?: string) {
    const template = await this.prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, template_kind: kind, is_archived: false, ...(templateId ? { id: templateId } : {}) },
      orderBy: { updated_at: 'desc' },
      include: { rndtechnosoft_document_template_versions: { orderBy: { version_number: 'desc' }, take: 1 } },
    });
    if (templateId && !template) throw new NotFoundException('That template was not found, or is not a template for this letter.');
    const version = template?.rndtechnosoft_document_template_versions[0];
    if (template && version?.body_document) {
      return {
        document: parseDocument(kind, version.body_document), templateId: template.id, templateVersionId: version.id, letterheadId: version.letterhead_id,
        layout: { page_size: version.page_size, margin_top_mm: version.margin_top_mm, margin_right_mm: version.margin_right_mm, margin_bottom_mm: version.margin_bottom_mm, margin_left_mm: version.margin_left_mm, show_page_numbers: version.show_page_numbers },
      };
    }
    // No template set up yet: the standard wording, so every exit can still get its letter.
    return { document: defaultDocument(kind)!, templateId: null, templateVersionId: null, letterheadId: null, layout: DEFAULT_LAYOUT };
  }

  /** The settlement as a statement: earnings, recoveries, net, and who approved and paid it. */
  private async statement(tenantId: string, s: SeparationRow, values: Record<string, string>, letterheadId: string | null) {
    const settlement = await this.liveSettlement(tenantId, s.id);
    if (!settlement || !['APPROVED', 'PAID'].includes(settlement.settlement_status)) throw new BadRequestException('The statement is made once the settlement is approved.');
    const names = await this.memberNames(tenantId, [settlement.reviewed_by_tenant_member_id, settlement.approved_by_tenant_member_id, settlement.paid_by_tenant_member_id]);
    const lines = settlement.rndtechnosoft_final_settlement_lines;
    const rupees = (v: Prisma.Decimal) => formatInr(v);
    const text = (t: string, bold = false): DocNode => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });
    const para = (t: string, bold = false): DocNode => ({ type: 'paragraph', content: [text(t, bold)] });
    const cell = (t: string, header = false, bold = false): DocNode => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(t, bold)] });
    const table = (kind: 'EARNING' | 'RECOVERY', total: Prisma.Decimal): DocNode => ({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell(kind === 'EARNING' ? 'Earnings' : 'Recoveries', true), cell('Amount', true)] },
        ...lines.filter((l) => l.line_kind === kind && l.counts_in_total).map((l): DocNode => ({ type: 'tableRow', content: [cell(l.line_label), cell(rupees(l.amount))] })),
        { type: 'tableRow', content: [cell(`Total ${kind === 'EARNING' ? 'earnings' : 'recoveries'}`, false, true), cell(rupees(total), false, true)] },
      ],
    });
    const net = settlement.net_amount;
    const finalSalary = lines.find((l) => l.component_code === 'FINAL_SALARY');
    const finalPeriod = (finalSalary?.basis as { period?: string } | null)?.period;
    const doc: DocNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [text('FULL AND FINAL SETTLEMENT STATEMENT')] },
        para(`Date: ${values.today}`),
        para(`Reference: ${values.exit_reference} (settlement version ${settlement.version_number})`),
        para(`Employee: ${values.employee_name} (${values.employee_code})`),
        para(`Designation: ${values.designation || '—'}, ${values.department || '—'}`),
        para(`Joined ${values.joining_date || '—'}; last working day ${values.last_working_date}; service ${values.employment_duration}`),
        table('EARNING', settlement.total_earnings),
        table('RECOVERY', settlement.total_recoveries),
        para(net.isNegative() ? `Net amount owed by the employee: ${rupees(net.negated())}` : `Net amount payable: ${rupees(net)}`, true),
        ...(finalSalary && finalPeriod ? [para(`The salary for ${finalPeriod} (${rupees(finalSalary.amount)} net) was paid through payroll and is not included above.`)] : []),
        para(`Reviewed by ${names.get(settlement.reviewed_by_tenant_member_id ?? '') ?? '—'}; approved by ${names.get(settlement.approved_by_tenant_member_id ?? '') ?? '—'}${settlement.approved_at ? ` on ${formatLetterDate(settlement.approved_at)}` : ''}.`),
        ...(settlement.payment_date
          ? [para(`Paid on ${formatLetterDate(settlement.payment_date)} by ${settlement.payment_mode?.replace(/_/g, ' ').toLowerCase()}${settlement.payment_reference ? `, reference ${settlement.payment_reference}` : ''}.`)]
          : [para('Payment: not yet made.')]),
        para(`For ${values.company_name}`),
        para('Authorized Signatory'),
      ],
    };
    if (letterheadId) await this.letterheads.layoutFor(tenantId, { ...DEFAULT_LAYOUT, letterhead_id: letterheadId }); // refuses a letterhead from another workspace
    return { document: parseDocument('FULL_AND_FINAL_STATEMENT', doc), templateId: null, templateVersionId: null, letterheadId, layout: DEFAULT_LAYOUT };
  }

  /** Everything an exit letter can say, from the employee's records; never from a candidate's. */
  private async values(tenantId: string, s: SeparationRow, actor: Actor): Promise<Record<string, string>> {
    const e = s.rndtechnosoft_employees;
    const [employment, first, tenant, signatory] = await Promise.all([
      this.prisma.rndtechnosoft_employee_employments.findFirst({
        where: { tenant_id: tenantId, employee_id: e.id, effective_from: { lte: s.last_working_date } }, orderBy: { effective_from: 'desc' },
        select: {
          rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } },
          rndtechnosoft_employment_types: { select: { employment_type_name: true } }, rndtechnosoft_branches: { select: { branch_name: true } },
        },
      }),
      this.prisma.rndtechnosoft_employee_employments.findFirst({ where: { tenant_id: tenantId, employee_id: e.id }, orderBy: { joining_date: 'asc' }, select: { joining_date: true } }),
      this.prisma.rndtechnosoft_tenants.findFirst({ where: { id: tenantId }, select: { display_name: true, legal_name: true } }),
      this.memberNames(tenantId, [actor.tenantMemberId]),
    ]);
    const name = `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim();
    const joined = first?.joining_date ?? e.hire_date;
    const lastDay = isoDate(s.last_working_date);
    const service = joined ? serviceLength(isoDate(joined), lastDay) : null;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const values: Record<string, string> = {
      employee_name: name, candidate_name: name, first_name: e.preferred_name || e.first_name, employee_code: e.employee_code, candidate_id: e.employee_code,
      designation: employment?.rndtechnosoft_designations?.designation_name ?? '', job_title: employment?.rndtechnosoft_designations?.designation_name ?? '',
      department: employment?.rndtechnosoft_departments?.department_name ?? '', employment_type: employment?.rndtechnosoft_employment_types?.employment_type_name ?? '',
      work_location: employment?.rndtechnosoft_branches?.branch_name ?? '',
      joining_date: joined ? formatLetterDate(joined) : '',
      last_working_date: formatLetterDate(s.last_working_date), notice_date: formatLetterDate(s.notice_date),
      separation_type: SEPARATION_WORDS[s.separation_type] ?? s.separation_type.toLowerCase(),
      exit_reference: `${e.employee_code}/EXIT/${lastDay.slice(0, 4)}`,
      employment_duration: service ? [service.years && plural(service.years, 'year'), plural(service.months, 'month')].filter(Boolean).join(' ') : '',
      signatory_name: signatory.get(actor.tenantMemberId) ?? '',
      company_name: tenant?.display_name || tenant?.legal_name || '',
      today: formatLetterDate(new Date()), date: formatLetterDate(new Date()), current_date: formatLetterDate(new Date()),
    };
    return values;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async separation(tenantId: string, id: string) {
    const row = await this.prisma.rndtechnosoft_employee_separations.findFirst({
      where: { tenant_id: tenantId, id },
      select: {
        id: true, employee_id: true, separation_type: true, separation_status: true, notice_date: true, last_working_date: true,
        rndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true, preferred_name: true, hire_date: true, user_id: true } },
      },
    });
    if (!row) throw new NotFoundException('Exit not found.');
    return row;
  }

  private async document(tenantId: string, separationId: string, documentId: string) {
    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({ where: { tenant_id: tenantId, id: documentId, separation_id: separationId, document_type: { in: [...EXIT_DOCUMENT_TYPES] } } });
    if (!doc) throw new NotFoundException('Document not found.');
    return doc;
  }

  private liveSettlement(tenantId: string, separationId: string) {
    return this.prisma.rndtechnosoft_final_settlements.findFirst({
      where: { tenant_id: tenantId, separation_id: separationId, settlement_status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID'] } },
      include: { rndtechnosoft_final_settlement_lines: { orderBy: { display_order: 'asc' } } },
    });
  }

  private async memberNames(tenantId: string, ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((v): v is string => !!v))];
    if (!wanted.length) return new Map<string, string>();
    const rows = await this.prisma.rndtechnosoft_tenant_members.findMany({ where: { tenant_id: tenantId, id: { in: wanted } }, select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } });
    return new Map(rows.map((m) => [m.id, m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email]));
  }

  private log(tenantId: string, actor: Actor, actionCode: string, documentId: string, values: { new?: Record<string, unknown> } & Record<string, unknown>) {
    const { new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EXIT_DOCUMENT', entityId: documentId, newValues, metadata });
  }
}

type SeparationRow = Awaited<ReturnType<ExitDocumentsService['separation']>>;

/**
 * The placeholders in a document: before filling, every one it uses; after
 * filling, only those the records had no value for (left as {{key}}).
 */
export function missingKeys(doc: DocNode | null): string[] {
  if (!doc) return [];
  const missing = new Set<string>();
  const walk = (n: DocNode) => {
    if (n.type === 'placeholder') missing.add(String(n.attrs?.key));
    if (n.type === 'text') for (const m of (n.text ?? '').matchAll(TOKEN)) missing.add(m[1]);
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...missing];
}
