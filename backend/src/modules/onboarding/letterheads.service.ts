import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { sniffFileKind } from './candidate-documents';
import { PdfLayout, PdfLetterhead, readableImage } from './onboarding-pdf.service';
import { LetterheadInputDto } from './dto/onboarding.dto';

export const LETTERHEAD_IMAGE_SLOTS = ['logo', 'header', 'footer'] as const;
export type LetterheadImageSlot = (typeof LETTERHEAD_IMAGE_SLOTS)[number];
export const MAX_LETTERHEAD_IMAGE_BYTES = 2 * 1024 * 1024;

const COLUMN: Record<LetterheadImageSlot, 'logo_storage_key' | 'header_image_storage_key' | 'footer_image_storage_key'> = {
  logo: 'logo_storage_key',
  header: 'header_image_storage_key',
  footer: 'footer_image_storage_key',
};
const SLOT_NAME: Record<LetterheadImageSlot, string> = { logo: 'logo', header: 'header artwork', footer: 'footer artwork' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Prisma.rndtechnosoft_letterheadsGetPayload<object>;

/** The version fields that decide a document's layout. */
export interface VersionLayout {
  letterhead_id: string | null;
  page_size: string;
  margin_mm: number;
  show_page_numbers: boolean;
}

/**
 * Company letterheads for generated documents. A letterhead holds the
 * company's details and, stored privately, a logo and optional header and
 * footer artwork (PNG or JPEG, checked by content). Templates choose a
 * letterhead per version. Changing a letterhead changes documents generated
 * from then on; documents already sent keep their PDF.
 */
@Injectable()
export class LetterheadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: PrivateStorageService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.rndtechnosoft_letterheads.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ is_archived: 'asc' }, { is_default: 'desc' }, { letterhead_name: 'asc' }],
      take: 100,
    });
    return rows.map((row) => this.shape(row));
  }

  async get(tenantId: string, id: string) {
    return this.shape(await this.row(tenantId, id));
  }

  async create(tenantId: string, input: LetterheadInputDto, actor: AuthenticatedTenantUser) {
    const id = randomUUID();
    await this.write(tenantId, async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_letterheads.create({ data: { id, tenant_id: tenantId, created_by_tenant_member_id: actor.tenantMemberId, ...this.columns(input) } });
    });
    await this.log(tenantId, actor, 'ONBOARDING_LETTERHEAD_CREATED', id, { name: input.name.trim() });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: LetterheadInputDto, actor: AuthenticatedTenantUser) {
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before editing it.');
    await this.write(tenantId, async (tx) => {
      if (input.isDefault && !current.is_default) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { ...this.columns(input), updated_at: new Date() } });
    });
    await this.log(tenantId, actor, 'ONBOARDING_LETTERHEAD_UPDATED', id, { name: input.name.trim() });
    return this.get(tenantId, id);
  }

  /** Hides a letterhead from new choices. Templates that use it keep using it. */
  async setArchived(tenantId: string, id: string, archived: boolean, actor: AuthenticatedTenantUser) {
    await this.row(tenantId, id);
    await this.write(tenantId, (tx) =>
      tx.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { is_archived: archived, ...(archived ? { is_default: false } : {}), updated_at: new Date() } }),
    );
    await this.log(tenantId, actor, archived ? 'ONBOARDING_LETTERHEAD_ARCHIVED' : 'ONBOARDING_LETTERHEAD_RESTORED', id);
    return this.get(tenantId, id);
  }

  /** Stores a logo or artwork after checking it is a PNG or JPEG that PDFs can use. */
  async setImage(tenantId: string, id: string, slot: string, file: { buffer: Buffer; size: number } | undefined, actor: AuthenticatedTenantUser) {
    const kind = this.slot(slot);
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before changing it.');
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('Choose an image to upload.');
    if (file.size > MAX_LETTERHEAD_IMAGE_BYTES) throw new BadRequestException('The image is larger than 2 MB. Upload a smaller copy.');
    const sniffed = sniffFileKind(file.buffer);
    if (!sniffed || sniffed.contentType === 'application/pdf') throw new BadRequestException('Upload a PNG or JPEG image.');
    if (!readableImage(file.buffer)) throw new BadRequestException('This image can’t be used in documents. Save it again as a standard PNG or JPEG and upload that.');
    const stored = await this.storage.save(tenantId, 'letterheads', file.buffer, sniffed.extension);
    await this.prisma.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { [COLUMN[kind]]: stored.key, updated_at: new Date() } });
    await this.log(tenantId, actor, 'ONBOARDING_LETTERHEAD_IMAGE_SET', id, { image: kind, sha256: stored.sha256 });
    return this.get(tenantId, id);
  }

  async removeImage(tenantId: string, id: string, slot: string, actor: AuthenticatedTenantUser) {
    const kind = this.slot(slot);
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before changing it.');
    await this.prisma.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { [COLUMN[kind]]: null, updated_at: new Date() } });
    await this.log(tenantId, actor, 'ONBOARDING_LETTERHEAD_IMAGE_REMOVED', id, { image: kind });
    return this.get(tenantId, id);
  }

  /** An image of this workspace's letterhead, to show in the letterhead form. */
  async image(tenantId: string, id: string, slot: string) {
    const kind = this.slot(slot);
    const key = (await this.row(tenantId, id))[COLUMN[kind]];
    if (!key) throw new NotFoundException(`This letterhead has no ${SLOT_NAME[kind]}.`);
    const bytes = await this.storage.read(tenantId, key);
    return { bytes, contentType: sniffFileKind(bytes)?.contentType ?? 'application/octet-stream' };
  }

  /** The layout a template version prints with, its letterhead loaded with its images. */
  async layoutFor(tenantId: string, version: VersionLayout): Promise<PdfLayout> {
    return {
      pageSize: version.page_size === 'LETTER' ? 'LETTER' : 'A4',
      marginMm: version.margin_mm,
      showPageNumbers: version.show_page_numbers,
      letterhead: version.letterhead_id ? await this.forPdf(tenantId, await this.row(tenantId, version.letterhead_id)) : null,
    };
  }

  /** A letterhead for a preview: unsaved details, with the saved images of `letterheadId` when given. */
  async previewLetterhead(tenantId: string, input: LetterheadInputDto, letterheadId?: string): Promise<PdfLetterhead> {
    const saved = letterheadId ? await this.row(tenantId, letterheadId) : null;
    const columns = this.columns(input);
    return this.forPdf(tenantId, {
      ...columns,
      logo_storage_key: saved?.logo_storage_key ?? null,
      header_image_storage_key: saved?.header_image_storage_key ?? null,
      footer_image_storage_key: saved?.footer_image_storage_key ?? null,
    });
  }

  /** Checks that a letterhead chosen for a template exists in this workspace and is in use. */
  async assertChoosable(tenantId: string, id: string) {
    const row = await this.prisma.rndtechnosoft_letterheads.findFirst({ where: { tenant_id: tenantId, id, is_archived: false }, select: { id: true } });
    if (!row) throw new BadRequestException('Choose a letterhead of this workspace that is not archived.');
  }

  // ── Internals ────────────────────────────────────────────────

  private async forPdf(
    tenantId: string,
    row: Pick<Row, 'company_name' | 'address_text' | 'phone' | 'email' | 'website' | 'registration_text' | 'footer_text' | 'logo_position' | 'logo_storage_key' | 'header_image_storage_key' | 'footer_image_storage_key' | 'header_height_mm' | 'footer_height_mm'>,
  ): Promise<PdfLetterhead> {
    const read = (key: string | null) => (key ? this.storage.read(tenantId, key) : Promise.resolve(null));
    const [logo, headerImage, footerImage] = await Promise.all([read(row.logo_storage_key), read(row.header_image_storage_key), read(row.footer_image_storage_key)]);
    return {
      companyName: row.company_name,
      addressText: row.address_text,
      phone: row.phone,
      email: row.email,
      website: row.website,
      registrationText: row.registration_text,
      footerText: row.footer_text,
      logoPosition: (['LEFT', 'CENTER', 'RIGHT'].includes(row.logo_position) ? row.logo_position : 'LEFT') as PdfLetterhead['logoPosition'],
      logo,
      headerImage,
      footerImage,
      headerHeightMm: row.header_height_mm,
      footerHeightMm: row.footer_height_mm,
    };
  }

  private columns(input: LetterheadInputDto) {
    const text = (value?: string | null) => (value && value.trim() ? value.trim() : null);
    const name = input.name.trim();
    const company = input.companyName.trim();
    if (!name) throw new BadRequestException('Enter a name for the letterhead.');
    if (!company) throw new BadRequestException('Enter the company name.');
    return {
      letterhead_name: name,
      company_name: company,
      address_text: text(input.addressText),
      phone: text(input.phone),
      email: text(input.email)?.toLowerCase() ?? null,
      website: text(input.website),
      registration_text: text(input.registrationText),
      footer_text: text(input.footerText),
      logo_position: input.logoPosition,
      header_height_mm: input.headerHeightMm,
      footer_height_mm: input.footerHeightMm,
      is_default: input.isDefault,
    };
  }

  private shape(row: Row) {
    return {
      id: row.id,
      name: row.letterhead_name,
      companyName: row.company_name,
      addressText: row.address_text,
      phone: row.phone,
      email: row.email,
      website: row.website,
      registrationText: row.registration_text,
      footerText: row.footer_text,
      logoPosition: row.logo_position,
      headerHeightMm: row.header_height_mm,
      footerHeightMm: row.footer_height_mm,
      isDefault: row.is_default,
      isArchived: row.is_archived,
      images: { logo: Boolean(row.logo_storage_key), header: Boolean(row.header_image_storage_key), footer: Boolean(row.footer_image_storage_key) },
      updatedAt: row.updated_at,
    };
  }

  private async row(tenantId: string, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Letterhead not found.');
    const row = await this.prisma.rndtechnosoft_letterheads.findFirst({ where: { tenant_id: tenantId, id } });
    if (!row) throw new NotFoundException('Letterhead not found.');
    return row;
  }

  private slot(slot: string): LetterheadImageSlot {
    if (!(LETTERHEAD_IMAGE_SLOTS as readonly string[]).includes(slot)) throw new NotFoundException('Image not found.');
    return slot as LetterheadImageSlot;
  }

  private clearDefault(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.rndtechnosoft_letterheads.updateMany({ where: { tenant_id: tenantId, is_default: true }, data: { is_default: false, updated_at: new Date() } });
  }

  private async write<T>(tenantId: string, run: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // One change at a time per workspace, so two "default" choices can't race.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`letterheads:${tenantId}`}, 0))`;
        return run(tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Another letterhead already has that name.');
      throw error;
    }
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata?: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'LETTERHEAD', entityId: id, metadata });
  }
}
