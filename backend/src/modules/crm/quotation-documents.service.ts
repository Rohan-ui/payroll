import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { TemplatesService } from '@/modules/documents/templates.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { DocumentPdfService } from '@/modules/documents/document-pdf.service';
import { formatAmount, formatLetterDate, QUOTATION_COLUMNS, renderTemplate } from '@/modules/documents/document-templates';
import { defaultDocument, DocNode, documentText, fillDocument } from '@/modules/documents/rich-document';
import { CrmService } from './crm.service';
import { LeadVisibility } from './lead-visibility';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quotations as PDFs, printed with an approved quotation template from
 * Documents & letterheads (the standard wording until one is approved). Amounts come from the stored quotation (already
 * priced in decimal); nothing is recalculated here. Nothing is stored: the
 * PDF reflects the quotation as it is now.
 */
@Injectable()
export class QuotationDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly templates: TemplatesService,
    private readonly letterheads: LetterheadsService,
    private readonly renderer: DocumentPdfService,
  ) {}

  /** Approved quotation templates to choose from; the first is used when none is chosen. */
  templatesToChoose(tenantId: string) {
    return this.templates.approvedOfKind(tenantId, 'QUOTATION');
  }

  /** The standard quotation wording and page, used until the workspace approves a quotation template of its own. */
  private async standardVersion(tenantId: string) {
    const letterhead = await this.prisma.rndtechnosoft_letterheads.findFirst({ where: { tenant_id: tenantId, is_default: true, is_archived: false }, select: { id: true } });
    const document = defaultDocument('QUOTATION') as DocNode;
    return {
      title: 'Quotation', body: documentText(document).body, body_document: document as unknown,
      letterhead_id: letterhead?.id ?? null, page_size: 'A4', margin_top_mm: 20, margin_right_mm: 20, margin_bottom_mm: 20, margin_left_mm: 20, show_page_numbers: true,
    };
  }

  async pdf(tenantId: string, visibility: LeadVisibility, quotationId: string, templateId: string | undefined) {
    // The same visibility as opening the quotation: a lead the member may not see is "not found".
    const quotation = await this.crm.getQuotationById(tenantId, visibility, quotationId);
    const choices = await this.templates.approvedOfKind(tenantId, 'QUOTATION');
    if (templateId !== undefined && !UUID.test(templateId)) throw new BadRequestException('Choose a quotation template.');
    const chosen = templateId ? choices.find((c) => c.id === templateId) : choices[0];
    if (templateId && !chosen) throw new BadRequestException('That quotation template isn’t approved for use.');

    const [version, tenant, settings] = await Promise.all([
      // Without an approved template, the standard quotation wording on the default letterhead.
      chosen ? this.prisma.rndtechnosoft_document_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: chosen.versionId } }) : this.standardVersion(tenantId),
      this.prisma.rndtechnosoft_tenants.findUniqueOrThrow({ where: { id: tenantId }, select: { legal_name: true } }),
      this.prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId }, select: { settings: true } }),
    ]);
    const profile = ((settings?.settings as Record<string, unknown> | null)?.profile ?? {}) as Record<string, unknown>;
    const lead = quotation.lead;
    const currency = quotation.currency_code;
    const money = (value: Prisma.Decimal) => formatAmount(value, currency);
    const intra = quotation.tax_mode !== 'INTER_STATE';
    const values: Record<string, string> = {
      quotation_number: quotation.quotation_number,
      quotation_date: formatLetterDate(new Date(quotation.created_at.toISOString().slice(0, 10))),
      valid_until: formatLetterDate(quotation.valid_until),
      client_company: lead.company_name,
      contact_person: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company_name,
      client_email: lead.email,
      client_phone: lead.phone ?? '',
      client_address: [lead.address, lead.city, lead.state, lead.postal_code].filter(Boolean).join(', '),
      client_gstin: lead.gstin ?? '',
      place_of_supply: quotation.client_state ?? lead.state ?? '',
      subtotal: money(quotation.subtotal),
      cgst: money(quotation.cgst_amount),
      sgst: money(quotation.sgst_amount),
      igst: money(quotation.igst_amount),
      total_tax: money(quotation.total_tax),
      total_amount: money(quotation.total_amount),
      notes: quotation.notes ?? '',
      company_name: tenant.legal_name,
      company_gstin: typeof profile.tax_gstin === 'string' ? profile.tax_gstin : '',
      today: formatLetterDate(new Date(new Date().toISOString().slice(0, 10))),
    };
    const items = [...quotation.items].sort((a, b) => a.sort_order - b.sort_order);
    const bytes = await this.renderer.render({
      companyName: tenant.legal_name,
      reference: quotation.quotation_number,
      dateText: values.quotation_date,
      title: renderTemplate(version.title, values),
      body: renderTemplate(version.body, values),
      document: version.body_document ? fillDocument(version.body_document as unknown as DocNode, values) : undefined,
      table: {
        heading: 'Quotation details',
        columns: QUOTATION_COLUMNS,
        rows: items.map((i) => [i.description, i.sac_code, i.quantity.toString(), money(i.unit_rate), money(i.line_amount)]),
        totals: [
          ['Subtotal', money(quotation.subtotal)],
          ...(intra
            ? [['CGST', money(quotation.cgst_amount)], ['SGST', money(quotation.sgst_amount)]] as [string, string][]
            : [['IGST', money(quotation.igst_amount)]] as [string, string][]),
        ],
        total: ['Total', money(quotation.total_amount)],
      },
      footer: `Quotation ${quotation.quotation_number}. Valid until ${values.valid_until}.`,
    }, await this.letterheads.layoutFor(tenantId, version));
    return { bytes, filename: `${quotation.quotation_number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf` };
  }
}
