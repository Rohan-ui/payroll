import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AVAILABLE_TEMPLATE_KINDS, PLACEHOLDERS, renderTemplate, SAMPLE_OFFER_TABLE, sampleTable, sampleValues, templateProblem, TemplateKind, TEMPLATE_KINDS } from './document-templates';
import { LetterheadsService } from './letterheads.service';
import { DocumentPdfService, PageMargins, PdfLetterhead, uniformMargins } from './document-pdf.service';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { defaultDocument, DocNode, DOCUMENT_STYLE, documentText, DocumentProblem, fillDocument, FONT_FAMILIES, FONT_SIZE_RANGE, legacyDocument, parseDocument } from './rich-document';

/** A letter as sent by the editor: a formatted document, or (from before formatting) a heading and plain text. */
export interface ContentInput {
  title?: string;
  body?: string;
  document?: Record<string, unknown>;
}

/** What the editor needs to show documents as they print: the fonts it may offer and how unformatted text looks. */
const DOCUMENT_FORMAT = {
  style: DOCUMENT_STYLE,
  fonts: Object.entries(FONT_FAMILIES).map(([key, f]) => ({ key, label: f.label, css: f.css })),
  fontSizes: { ...FONT_SIZE_RANGE, presets: [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48] },
};

/** A version's page layout as sent by the editor; a field left out is kept as it is. */
export interface LayoutInput {
  letterheadId?: string | null;
  pageSize?: 'A4' | 'LETTER';
  marginsMm?: PageMargins;
  showPageNumbers?: boolean;
}

type LayoutColumns = {
  letterhead_id: string | null;
  page_size: string;
  margin_top_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  show_page_numbers: boolean;
};

const DEFAULT_LAYOUT: LayoutColumns = { letterhead_id: null, page_size: 'A4', margin_top_mm: 20, margin_right_mm: 20, margin_bottom_mm: 20, margin_left_mm: 20, show_page_numbers: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_NAME = { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const nameOf = (m?: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) =>
  m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null;

/**
 * Letter templates and their versions. Wording is edited in a draft; approving
 * the draft fixes it (the previous approved version is retired) and only an
 * approved version can be used for a letter.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly letterheads: LetterheadsService,
    private readonly pdf: DocumentPdfService,
    @Optional() private readonly storage?: PrivateStorageService,
  ) {}

  placeholders() {
    return TEMPLATE_KINDS.map((kind) => ({ kind, available: AVAILABLE_TEMPLATE_KINDS.includes(kind), placeholders: PLACEHOLDERS[kind].map(({ key, description }) => ({ key, description })) }));
  }

  async list(tenantId: string, kind?: string) {
    const rows = await this.prisma.rndtechnosoft_document_templates.findMany({
      where: { tenant_id: tenantId, ...(kind ? { template_kind: kind } : {}) },
      orderBy: [{ template_kind: 'asc' }, { template_name: 'asc' }],
      take: 200,
      include: { rndtechnosoft_document_template_versions: { where: { version_status: { in: ['DRAFT', 'APPROVED'] } }, select: { id: true, version_number: true, version_status: true, title: true } } },
    });
    return rows.map((row) => {
      const approved = row.rndtechnosoft_document_template_versions.find((v) => v.version_status === 'APPROVED') ?? null;
      const draft = row.rndtechnosoft_document_template_versions.find((v) => v.version_status === 'DRAFT') ?? null;
      return {
        id: row.id,
        kind: row.template_kind,
        name: row.template_name,
        isArchived: row.is_archived,
        approvedVersion: approved ? { id: approved.id, number: approved.version_number, title: approved.title } : null,
        draftVersion: draft ? { id: draft.id, number: draft.version_number } : null,
      };
    });
  }

  /** The approved, unarchived templates of a kind, for the modules that make documents from them. */
  async approvedOfKind(tenantId: string, kind: TemplateKind) {
    const rows = await this.prisma.rndtechnosoft_document_templates.findMany({
      where: { tenant_id: tenantId, template_kind: kind, is_archived: false, rndtechnosoft_document_template_versions: { some: { version_status: 'APPROVED' } } },
      orderBy: { template_name: 'asc' },
      take: 200,
      include: { rndtechnosoft_document_template_versions: { where: { version_status: 'APPROVED' }, select: { id: true, version_number: true } } },
    });
    return rows.map((row) => ({ id: row.id, name: row.template_name, versionId: row.rndtechnosoft_document_template_versions[0].id, versionNumber: row.rndtechnosoft_document_template_versions[0].version_number }));
  }

  async get(tenantId: string, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Template not found.');
    const row = await this.prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_document_template_versions: {
          orderBy: { version_number: 'desc' },
          include: { created_by: MEMBER_NAME, approved_by: MEMBER_NAME, rndtechnosoft_letterheads: { select: { letterhead_name: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Template not found.');
    return {
      id: row.id,
      kind: row.template_kind,
      name: row.template_name,
      isArchived: row.is_archived,
      placeholders: PLACEHOLDERS[row.template_kind as TemplateKind].map(({ key, description }) => ({ key, description })),
      format: DOCUMENT_FORMAT,
      versions: row.rndtechnosoft_document_template_versions.map((v) => ({
        id: v.id,
        number: v.version_number,
        status: v.version_status,
        title: v.title,
        body: v.body,
        /** FORMATTED: made in the document editor. PLAIN: plain text from before, shown converted and printed as it always was. */
        format: v.body_document ? 'FORMATTED' : 'PLAIN',
        document: (v.body_document as unknown as DocNode | null) ?? legacyDocument(row.template_kind as TemplateKind, v.title, v.body),
        createdBy: nameOf(v.created_by),
        approvedBy: nameOf(v.approved_by),
        approvedAt: v.approved_at,
        layout: {
          letterheadId: v.letterhead_id,
          letterheadName: v.rndtechnosoft_letterheads?.letterhead_name ?? null,
          pageSize: v.page_size,
          marginsMm: { top: v.margin_top_mm, right: v.margin_right_mm, bottom: v.margin_bottom_mm, left: v.margin_left_mm },
          showPageNumbers: v.show_page_numbers,
        },
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
    };
  }

  async create(tenantId: string, input: { kind: string; name: string } & ContentInput & LayoutInput, actor: AuthenticatedTenantUser) {
    if (!(AVAILABLE_TEMPLATE_KINDS as readonly string[]).includes(input.kind)) throw new BadRequestException('Templates of this kind can’t be created yet. Choose an offer letter, quotation or appraisal letter.');
    const kind = input.kind as TemplateKind;
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Enter a template name.');
    // Without wording, a template starts from the standard letter.
    const content = this.content(kind, input.document || input.title || input.body ? input : { document: defaultDocument(kind) as unknown as Record<string, unknown> });
    const layout = await this.layoutColumns(tenantId, DEFAULT_LAYOUT, input);
    const templateId = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_document_templates.create({
          data: { id: templateId, tenant_id: tenantId, template_kind: kind, template_name: name, created_by_tenant_member_id: actor.tenantMemberId },
        });
        await tx.rndtechnosoft_document_template_versions.create({
          data: { id: randomUUID(), tenant_id: tenantId, template_id: templateId, version_number: 1, ...content, ...layout, created_by_tenant_member_id: actor.tenantMemberId },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A template of this kind already has that name.');
      throw error;
    }
    return this.get(tenantId, templateId);
  }

  /** Saves the draft wording, starting a new draft (the next version) when there is none. */
  async saveDraft(tenantId: string, templateId: string, input: ContentInput & LayoutInput, actor: AuthenticatedTenantUser) {
    const template = await this.get(tenantId, templateId);
    if (template.isArchived) throw new ConflictException('Restore the template before editing it.');
    const content = this.content(template.kind as TemplateKind, input);
    await this.prisma.$transaction(async (tx) => {
      await this.lockTemplate(tx, tenantId, templateId);
      const draft = await tx.rndtechnosoft_document_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: templateId, version_status: 'DRAFT' } });
      if (draft) {
        const layout = await this.layoutColumns(tenantId, draft, input);
        await tx.rndtechnosoft_document_template_versions.update({ where: { id: draft.id }, data: { ...content, ...layout, updated_at: new Date() } });
        return;
      }
      // A new draft starts from the layout of the latest version.
      const base = await tx.rndtechnosoft_document_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: templateId }, orderBy: { version_number: 'desc' } });
      const layout = await this.layoutColumns(tenantId, base ?? DEFAULT_LAYOUT, input);
      const latest = await tx.rndtechnosoft_document_template_versions.aggregate({ where: { tenant_id: tenantId, template_id: templateId }, _max: { version_number: true } });
      await tx.rndtechnosoft_document_template_versions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          template_id: templateId,
          version_number: (latest._max.version_number ?? 0) + 1,
          ...content,
          ...layout,
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
    });
    return this.get(tenantId, templateId);
  }

  /** Approves the draft for use; the version approved before it is retired. Letters already made keep their own copy of the text. */
  async approveDraft(tenantId: string, templateId: string, actor: AuthenticatedTenantUser) {
    await this.get(tenantId, templateId);
    const approved = await this.prisma.$transaction(async (tx) => {
      await this.lockTemplate(tx, tenantId, templateId);
      const draft = await tx.rndtechnosoft_document_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: templateId, version_status: 'DRAFT' } });
      if (!draft) throw new ConflictException('There is no draft to approve. Edit the template to start one.');
      await tx.rndtechnosoft_document_template_versions.updateMany({
        where: { tenant_id: tenantId, template_id: templateId, version_status: 'APPROVED' },
        data: { version_status: 'RETIRED', updated_at: new Date() },
      });
      return tx.rndtechnosoft_document_template_versions.update({
        where: { id: draft.id },
        data: { version_status: 'APPROVED', approved_by_tenant_member_id: actor.tenantMemberId, approved_at: new Date(), updated_at: new Date() },
      });
    });
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_TEMPLATE_APPROVED',
      entityType: 'DOCUMENT_TEMPLATE',
      entityId: templateId,
      newValues: { version: approved.version_number },
    });
    return this.get(tenantId, templateId);
  }

  async setArchived(tenantId: string, templateId: string, archived: boolean) {
    await this.get(tenantId, templateId);
    await this.prisma.rndtechnosoft_document_templates.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: templateId } },
      data: { is_archived: archived, updated_at: new Date() },
    });
    return this.get(tenantId, templateId);
  }

  /** The letter filled with sample values (the document too, when formatted), to check it before approving it. */
  preview(kind: string, input: ContentInput) {
    if (!(TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Choose a template kind.');
    const content = this.content(kind as TemplateKind, input);
    const values = sampleValues(kind as TemplateKind);
    return {
      title: renderTemplate(content.title, values),
      body: renderTemplate(content.body, values),
      document: content.body_document === Prisma.DbNull ? undefined : fillDocument(content.body_document as unknown as DocNode, values),
    };
  }

  /**
   * The template as a PDF, filled with sample data and laid out as the editor
   * currently has it (saved or not). Marked as a sample; nothing is stored.
   */
  async previewPdf(tenantId: string, input: { kind: string } & ContentInput & LayoutInput) {
    const text = this.preview(input.kind, input);
    const layout = await this.layoutColumns(tenantId, DEFAULT_LAYOUT, input, { allowArchived: true });
    const company = (await this.prisma.rndtechnosoft_tenants.findUniqueOrThrow({ where: { id: tenantId }, select: { legal_name: true } })).legal_name;
    const images = await this.resolveDocumentImages(tenantId, text.document);
    return this.pdf.render(
      {
        companyName: company,
        reference: 'SAMPLE',
        dateText: sampleValues(input.kind as TemplateKind).today ?? '',
        title: text.title,
        body: text.body,
        document: text.document,
        table: sampleTable(input.kind as TemplateKind),
        footer: 'Sample preview with made-up data. This is not a real document.',
        watermark: 'SAMPLE',
        images,
      },
      await this.letterheads.layoutFor(tenantId, layout),
    );
  }

  /** Resolves binary image buffers for documentImage nodes from storage or data URIs */
  async resolveDocumentImages(tenantId: string, docNode?: DocNode): Promise<Record<string, Buffer>> {
    const images: Record<string, Buffer> = {};
    if (!docNode) return images;

    const assetIds: string[] = [];
    const walk = (node: DocNode) => {
      if (node.type === 'documentImage' && node.attrs) {
        const assetId = node.attrs.assetId as string | undefined;
        if (assetId) assetIds.push(assetId);
      }
      node.content?.forEach(walk);
    };
    walk(docNode);

    if (assetIds.length > 0) {
      const rows = await this.prisma.rndtechnosoft_document_assets.findMany({
        where: { tenant_id: tenantId, id: { in: assetIds } },
        select: { id: true, storage_key: true },
      });
      for (const row of rows) {
        if (this.storage) {
          try {
            images[row.id] = await this.storage.read(tenantId, row.storage_key);
          } catch {
            // Skip if missing
          }
        }
      }
    }
    return images;
  }

  /** A sample offer letter on a letterhead, to check the letterhead before saving it. */
  async letterheadSamplePdf(tenantId: string, letterhead: PdfLetterhead) {
    const values = sampleValues('OFFER_LETTER');
    return this.pdf.render(
      {
        companyName: letterhead.companyName,
        reference: 'SAMPLE',
        dateText: values.today,
        title: renderTemplate('Offer of employment: {{job_title}}', values),
        body: renderTemplate('Dear {{candidate_name}},\n\nThis sample letter shows how documents look on this letterhead. The text and amounts are made up.\n\nYours sincerely,\nHuman Resources\n{{company_name}}', { ...values, company_name: letterhead.companyName }),
        table: SAMPLE_OFFER_TABLE,
        footer: 'Sample preview with made-up data. This is not a real document.',
        watermark: 'SAMPLE',
      },
      { pageSize: 'A4', marginsMm: uniformMargins(20), showPageNumbers: true, letterhead },
    );
  }

  /** Layout columns: the given fields over the current ones, with a chosen letterhead checked to be this workspace's. */
  private async layoutColumns(
    tenantId: string,
    current: LayoutColumns,
    input: LayoutInput,
    options: { allowArchived?: boolean } = {},
  ) {
    const letterheadId = input.letterheadId === undefined ? current.letterhead_id : input.letterheadId;
    if (letterheadId && letterheadId !== current.letterhead_id && !options.allowArchived) await this.letterheads.assertChoosable(tenantId, letterheadId);
    return {
      letterhead_id: letterheadId ?? null,
      page_size: input.pageSize ?? current.page_size,
      margin_top_mm: input.marginsMm?.top ?? current.margin_top_mm,
      margin_right_mm: input.marginsMm?.right ?? current.margin_right_mm,
      margin_bottom_mm: input.marginsMm?.bottom ?? current.margin_bottom_mm,
      margin_left_mm: input.marginsMm?.left ?? current.margin_left_mm,
      show_page_numbers: input.showPageNumbers ?? current.show_page_numbers,
    };
  }

  /**
   * A version's wording as columns: a formatted document (checked and rebuilt),
   * with its plain text in title and body; or a plain-text heading and text.
   */
  private content(kind: TemplateKind, input: ContentInput): { title: string; body: string; body_document: Prisma.InputJsonValue | typeof Prisma.DbNull } {
    if (input.document !== undefined) {
      let document: DocNode;
      try {
        document = parseDocument(kind, input.document);
      } catch (error) {
        if (error instanceof DocumentProblem) throw new BadRequestException(error.message);
        throw error;
      }
      const text = documentText(document);
      return { title: text.title || 'Untitled letter', body: text.body, body_document: document as unknown as Prisma.InputJsonValue };
    }
    const title = input.title ?? '';
    const body = input.body ?? '';
    if (!title.trim()) throw new BadRequestException('Enter the letter heading.');
    if (!body.trim()) throw new BadRequestException('Enter the letter text.');
    const problem = templateProblem(kind, title, body);
    if (problem) throw new BadRequestException(problem);
    return { title: title.trim(), body, body_document: Prisma.DbNull };
  }

  private async lockTemplate(tx: Prisma.TransactionClient, tenantId: string, templateId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_document_templates WHERE tenant_id = ${tenantId}::uuid AND id = ${templateId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Template not found.');
  }
}
