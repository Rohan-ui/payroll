import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { sniffFileKind } from '@/modules/onboarding/candidate-documents';
import { ImageBox, LetterheadPlacement, PdfElement, PdfLayout, PdfLetterhead, readableImage } from './document-pdf.service';
import { FontKey } from './rich-document';
import { LetterheadBoxDto, LetterheadElementDto, LetterheadInputDto } from './dto/documents.dto';

export const LETTERHEAD_IMAGE_SLOTS = ['logo', 'header', 'footer'] as const;
export type LetterheadImageSlot = (typeof LETTERHEAD_IMAGE_SLOTS)[number];
export const MAX_LETTERHEAD_IMAGE_BYTES = 2 * 1024 * 1024;
/** Images a letterhead keeps for its elements; duplicates of an element share its image. */
export const MAX_LETTERHEAD_ASSETS = 50;

const COLUMN: Record<LetterheadImageSlot, 'logo_storage_key' | 'header_image_storage_key' | 'footer_image_storage_key'> = {
  logo: 'logo_storage_key',
  header: 'header_image_storage_key',
  footer: 'footer_image_storage_key',
};
const SLOT_NAME: Record<LetterheadImageSlot, string> = { logo: 'logo', header: 'header artwork', footer: 'footer artwork' };
const SLOT_PREFIX = { logo: 'logo', header: 'header_art', footer: 'footer_art' } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The widest a header or footer area gets: a Letter page (215.9 mm), placed at the edges. */
const WIDEST_AREA_MM = 215.9;
/** Elements stay on the largest page: Letter's width, A4's height. */
const LARGEST_PAGE_MM = { width: 215.9, height: 297 };
const BOX_PREFIX = { logoBox: 'logo', headerArtBox: 'header_art', footerArtBox: 'footer_art' } as const;
type BoxField = keyof typeof BOX_PREFIX;
type Prefix = (typeof BOX_PREFIX)[BoxField];
type BoxColumns = { [K in `${Prefix}_${'x_mm' | 'y_mm' | 'width_mm' | 'height_mm'}`]?: number | Prisma.Decimal | null } & { [K in `${Prefix}_stretch`]?: boolean } & {
  [K in `${Prefix}_rotation_deg`]?: number | Prisma.Decimal;
};
type FlagColumns = { [K in `is_${Prefix}_${'hidden' | 'locked'}`]: boolean };

/** A saved box as the editor and PDF use it; none until all four measures are set. */
function boxOf(row: Record<string, unknown>, field: BoxField): ImageBox | null {
  const prefix = BOX_PREFIX[field];
  const measure = (name: string) => (row[`${prefix}_${name}_mm`] === null || row[`${prefix}_${name}_mm`] === undefined ? null : Number(row[`${prefix}_${name}_mm`]));
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(measure);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height, stretch: Boolean(row[`${prefix}_stretch`]), rotation: Number(row[`${prefix}_rotation_deg`] ?? 0) };
}

/** The images with a flag set (hidden, or locked). */
const flagged = (row: FlagColumns, flag: 'hidden' | 'locked') => LETTERHEAD_IMAGE_SLOTS.filter((slot) => row[`is_${SLOT_PREFIX[slot]}_${flag}`]);

/** Where the letterhead sits; none: at the page margins. */
function placementOf(row: Pick<Row, 'header_offset_mm' | 'footer_offset_mm' | 'side_offset_mm'>): LetterheadPlacement | null {
  if (row.header_offset_mm === null || row.footer_offset_mm === null || row.side_offset_mm === null) return null;
  return { headerOffsetMm: row.header_offset_mm, footerOffsetMm: row.footer_offset_mm, sideOffsetMm: row.side_offset_mm };
}

const WITH_ELEMENTS = { rndtechnosoft_letterhead_elements: { orderBy: { layer_order: 'asc' } } } satisfies Prisma.rndtechnosoft_letterheadsInclude;
type Row = Prisma.rndtechnosoft_letterheadsGetPayload<{ include: typeof WITH_ELEMENTS }>;
type ElementRow = Row['rndtechnosoft_letterhead_elements'][number];
/** An element's stored values, saved or about to be. */
type ElementData = Omit<ElementRow, 'id' | 'tenant_id' | 'letterhead_id' | 'created_at' | 'x_mm' | 'y_mm' | 'width_mm' | 'height_mm' | 'rotation_deg' | 'opacity' | 'font_size_pt'> & {
  [K in 'x_mm' | 'y_mm' | 'width_mm' | 'height_mm' | 'rotation_deg' | 'opacity']: number | Prisma.Decimal;
} & { font_size_pt: number | Prisma.Decimal | null };

/** The version fields that decide a document's layout. */
export interface VersionLayout {
  letterhead_id: string | null;
  page_size: string;
  margin_top_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  show_page_numbers: boolean;
}

/**
 * Company letterheads for generated documents. A letterhead holds the
 * company's details and, stored privately, a logo and optional header and
 * footer artwork (PNG or JPEG, checked by content), placed and turned in the
 * editor, and page elements such as text and image watermarks. Templates
 * choose a letterhead per version. Changing a letterhead changes documents
 * generated from then on; documents already sent keep their PDF.
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
      include: WITH_ELEMENTS,
    });
    return rows.map((row) => this.shape(row));
  }

  async get(tenantId: string, id: string) {
    return this.shape(await this.row(tenantId, id));
  }

  async create(tenantId: string, input: LetterheadInputDto, actor: AuthenticatedTenantUser) {
    const id = randomUUID();
    const columns = this.columns(input);
    const elements = input.elements === undefined ? undefined : await this.elementData(tenantId, null, input.elements);
    await this.write(tenantId, async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_letterheads.create({ data: { id, tenant_id: tenantId, created_by_tenant_member_id: actor.tenantMemberId, ...columns } });
      if (elements) await this.replaceElements(tx, tenantId, id, elements);
    });
    await this.log(tenantId, actor, 'LETTERHEAD_CREATED', id, { name: input.name.trim(), elements: elements?.length ?? 0 });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: LetterheadInputDto, actor: AuthenticatedTenantUser) {
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before editing it.');
    const columns = this.columns(input);
    const elements = input.elements === undefined ? undefined : await this.elementData(tenantId, id, input.elements);
    await this.write(tenantId, async (tx) => {
      if (input.isDefault && !current.is_default) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { ...columns, updated_at: new Date() } });
      if (elements) await this.replaceElements(tx, tenantId, id, elements);
    });
    await this.log(tenantId, actor, 'LETTERHEAD_UPDATED', id, { name: input.name.trim(), ...(elements ? { elements: elements.length } : {}) });
    return this.get(tenantId, id);
  }

  /** Hides a letterhead from new choices. Templates that use it keep using it. */
  async setArchived(tenantId: string, id: string, archived: boolean, actor: AuthenticatedTenantUser) {
    await this.row(tenantId, id);
    await this.write(tenantId, (tx) =>
      tx.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { is_archived: archived, ...(archived ? { is_default: false } : {}), updated_at: new Date() } }),
    );
    await this.log(tenantId, actor, archived ? 'LETTERHEAD_ARCHIVED' : 'LETTERHEAD_RESTORED', id);
    return this.get(tenantId, id);
  }

  /** Stores a logo or artwork after checking it is a PNG or JPEG that PDFs can use. */
  async setImage(tenantId: string, id: string, slot: string, file: { buffer: Buffer; size: number } | undefined, actor: AuthenticatedTenantUser) {
    const kind = this.slot(slot);
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before changing it.');
    const { buffer, extension } = this.checkImage(file);
    const stored = await this.storage.save(tenantId, 'letterheads', buffer, extension);
    await this.prisma.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { [COLUMN[kind]]: stored.key, updated_at: new Date() } });
    await this.log(tenantId, actor, 'LETTERHEAD_IMAGE_SET', id, { image: kind, sha256: stored.sha256 });
    return this.get(tenantId, id);
  }

  async removeImage(tenantId: string, id: string, slot: string, actor: AuthenticatedTenantUser) {
    const kind = this.slot(slot);
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before changing it.');
    await this.prisma.rndtechnosoft_letterheads.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { [COLUMN[kind]]: null, updated_at: new Date() } });
    await this.log(tenantId, actor, 'LETTERHEAD_IMAGE_REMOVED', id, { image: kind });
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

  /**
   * Stores an image for the letterhead's elements (an image watermark, say),
   * checked as logos are. It is placed once an element that uses it is saved.
   */
  async addAsset(tenantId: string, id: string, file: { buffer: Buffer; size: number } | undefined, actor: AuthenticatedTenantUser) {
    const current = await this.row(tenantId, id);
    if (current.is_archived) throw new ConflictException('Restore the letterhead before changing it.');
    const { buffer, extension, size } = this.checkImage(file);
    const assetId = randomUUID();
    const stored = await this.write(tenantId, async (tx) => {
      const count = await tx.rndtechnosoft_letterhead_assets.count({ where: { tenant_id: tenantId, letterhead_id: id } });
      if (count >= MAX_LETTERHEAD_ASSETS) throw new ConflictException(`This letterhead already has ${MAX_LETTERHEAD_ASSETS} uploaded images, the most it keeps. Reuse one by duplicating its element.`);
      const saved = await this.storage.save(tenantId, 'letterheads', buffer, extension);
      await tx.rndtechnosoft_letterhead_assets.create({ data: { id: assetId, tenant_id: tenantId, letterhead_id: id, storage_key: saved.key, width_px: size.width, height_px: size.height } });
      return saved;
    });
    await this.log(tenantId, actor, 'LETTERHEAD_ASSET_ADDED', id, { asset: assetId, sha256: stored.sha256 });
    return { id: assetId, widthPx: size.width, heightPx: size.height };
  }

  /** An image uploaded for this letterhead's elements. */
  async asset(tenantId: string, id: string, assetId: string) {
    if (!UUID.test(id) || !UUID.test(assetId)) throw new NotFoundException('Image not found.');
    const row = await this.prisma.rndtechnosoft_letterhead_assets.findFirst({ where: { tenant_id: tenantId, letterhead_id: id, id: assetId }, select: { storage_key: true } });
    if (!row) throw new NotFoundException('Image not found.');
    const bytes = await this.storage.read(tenantId, row.storage_key);
    return { bytes, contentType: sniffFileKind(bytes)?.contentType ?? 'application/octet-stream' };
  }

  /** The layout a template version prints with, its letterhead loaded with its images. */
  async layoutFor(tenantId: string, version: VersionLayout): Promise<PdfLayout> {
    let letterhead: PdfLetterhead | null = null;
    if (version.letterhead_id) {
      const row = await this.row(tenantId, version.letterhead_id);
      letterhead = await this.forPdf(tenantId, row, row.rndtechnosoft_letterhead_elements, row.id);
    }
    return {
      pageSize: version.page_size === 'LETTER' ? 'LETTER' : 'A4',
      marginsMm: { top: version.margin_top_mm, right: version.margin_right_mm, bottom: version.margin_bottom_mm, left: version.margin_left_mm },
      showPageNumbers: version.show_page_numbers,
      letterhead,
    };
  }

  /** A letterhead for a preview: unsaved details and elements, with the saved images of `letterheadId` when given. */
  async previewLetterhead(tenantId: string, input: LetterheadInputDto, letterheadId?: string): Promise<PdfLetterhead> {
    const saved = letterheadId ? await this.row(tenantId, letterheadId) : null;
    const columns = this.columns(input);
    const elements = input.elements === undefined ? (saved?.rndtechnosoft_letterhead_elements ?? []) : await this.elementData(tenantId, saved?.id ?? null, input.elements);
    return this.forPdf(
      tenantId,
      {
        header_offset_mm: null,
        footer_offset_mm: null,
        side_offset_mm: null,
        logo_rotation_deg: 0,
        header_art_rotation_deg: 0,
        footer_art_rotation_deg: 0,
        is_logo_hidden: false,
        is_header_art_hidden: false,
        is_footer_art_hidden: false,
        ...(saved ?? {}),
        ...columns,
        logo_storage_key: saved?.logo_storage_key ?? null,
        header_image_storage_key: saved?.header_image_storage_key ?? null,
        footer_image_storage_key: saved?.footer_image_storage_key ?? null,
      },
      elements,
      saved?.id ?? null,
    );
  }

  /** Checks that a letterhead chosen for a template exists in this workspace and is in use. */
  async assertChoosable(tenantId: string, id: string) {
    const row = await this.prisma.rndtechnosoft_letterheads.findFirst({ where: { tenant_id: tenantId, id, is_archived: false }, select: { id: true } });
    if (!row) throw new BadRequestException('Choose a letterhead of this workspace that is not archived.');
  }

  // ── Internals ────────────────────────────────────────────────

  private async forPdf(
    tenantId: string,
    row: Pick<
      Row,
      | 'company_name' | 'address_text' | 'phone' | 'email' | 'website' | 'registration_text' | 'footer_text' | 'logo_position'
      | 'logo_storage_key' | 'header_image_storage_key' | 'footer_image_storage_key' | 'header_height_mm' | 'footer_height_mm'
      | 'header_offset_mm' | 'footer_offset_mm' | 'side_offset_mm' | 'is_logo_hidden' | 'is_header_art_hidden' | 'is_footer_art_hidden'
    > & BoxColumns,
    elements: ElementData[],
    letterheadId: string | null,
  ): Promise<PdfLetterhead> {
    const read = (key: string | null, hidden: boolean) => (key && !hidden ? this.storage.read(tenantId, key).catch(() => null) : Promise.resolve(null));
    const [logo, headerImage, footerImage, pdfElements] = await Promise.all([
      read(row.logo_storage_key, row.is_logo_hidden),
      read(row.header_image_storage_key, row.is_header_art_hidden),
      read(row.footer_image_storage_key, row.is_footer_art_hidden),
      this.pdfElements(tenantId, letterheadId, elements),
    ]);
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
      placement: placementOf(row),
      logoBox: boxOf(row, 'logoBox'),
      headerArtBox: boxOf(row, 'headerArtBox'),
      footerArtBox: boxOf(row, 'footerArtBox'),
      elements: pdfElements,
    };
  }

  /** The visible elements, ready to draw: each uploaded image read once, however many elements show it. */
  private async pdfElements(tenantId: string, letterheadId: string | null, elements: ElementData[]): Promise<PdfElement[]> {
    const visible = elements.filter((e) => !e.is_hidden);
    const assetIds = [...new Set(visible.map((e) => e.asset_id).filter((a): a is string => Boolean(a)))];
    const assets = assetIds.length && letterheadId
      ? await this.prisma.rndtechnosoft_letterhead_assets.findMany({ where: { tenant_id: tenantId, letterhead_id: letterheadId, id: { in: assetIds } }, select: { id: true, storage_key: true } })
      : [];
    const bytes = new Map(await Promise.all(assets.map(async (a) => [a.id, await this.storage.read(tenantId, a.storage_key).catch(() => null)] as const)));
    return visible.flatMap((e): PdfElement[] => {
      const image = e.asset_id ? bytes.get(e.asset_id) ?? null : null;
      // An image element whose image is gone draws nothing rather than an empty box.
      if (e.element_kind === 'IMAGE' && !image) return [];
      return [{
        x: Number(e.x_mm),
        y: Number(e.y_mm),
        width: Number(e.width_mm),
        height: Number(e.height_mm),
        rotation: Number(e.rotation_deg),
        opacity: Number(e.opacity),
        aboveText: e.is_above_text,
        image,
        text: e.element_kind === 'TEXT' && e.text_content
          ? { content: e.text_content, fontFamily: (e.font_family ?? 'helvetica') as FontKey, fontSizePt: Number(e.font_size_pt ?? 12), bold: e.is_bold, italic: e.is_italic, color: e.text_color ?? '#000000', align: (e.text_align ?? 'center') as 'left' | 'center' | 'right' }
          : null,
      }];
    });
  }

  /**
   * Elements as stored, in paint order, after checking each lies on the page
   * and shows an image uploaded for this letterhead (a new letterhead has none yet).
   */
  private async elementData(tenantId: string, letterheadId: string | null, elements: LetterheadElementDto[]): Promise<ElementData[]> {
    const wanted = [...new Set(elements.filter((e) => e.kind === 'IMAGE').map((e) => e.imageId ?? ''))];
    const known = wanted.length && letterheadId
      ? new Set((await this.prisma.rndtechnosoft_letterhead_assets.findMany({ where: { tenant_id: tenantId, letterhead_id: letterheadId, id: { in: wanted.filter((w) => UUID.test(w)) } }, select: { id: true } })).map((a) => a.id))
      : new Set<string>();
    const round = (n: number) => Math.round(n * 10) / 10;
    return elements.map((e, index) => {
      const [x, y, width, height] = [e.x, e.y, e.width, e.height].map(round);
      const name = `Element ${index + 1}`;
      if (x + width > LARGEST_PAGE_MM.width + 0.05 || y + height > LARGEST_PAGE_MM.height + 0.05) throw new BadRequestException(`${name} runs off the page. Make it smaller or move it in.`);
      const base = {
        element_kind: e.kind,
        layer_order: index,
        is_above_text: e.aboveText,
        is_hidden: e.hidden,
        is_locked: e.locked,
        x_mm: x,
        y_mm: y,
        width_mm: width,
        height_mm: height,
        rotation_deg: round(e.rotation),
        opacity: Math.round(e.opacity * 100) / 100,
      };
      if (e.kind === 'IMAGE') {
        if (!e.imageId || !known.has(e.imageId)) {
          throw new BadRequestException(letterheadId ? `${name} shows an image that isn’t uploaded for this letterhead. Upload the image again.` : 'Create the letterhead first, then add image watermarks.');
        }
        return { ...base, asset_id: e.imageId, text_content: null, font_family: null, font_size_pt: null, is_bold: false, is_italic: false, text_color: null, text_align: null };
      }
      const text = (e.text ?? '').replace(/\r\n?/g, '\n');
      if (!text.trim()) throw new BadRequestException(`Enter the text of ${name.toLowerCase()}.`);
      return {
        ...base,
        asset_id: null,
        text_content: text,
        font_family: e.fontFamily ?? 'helvetica',
        font_size_pt: round(e.fontSizePt ?? 12),
        is_bold: Boolean(e.bold),
        is_italic: Boolean(e.italic),
        text_color: (e.color ?? '#000000').toLowerCase(),
        text_align: e.align ?? 'center',
      };
    });
  }

  private async replaceElements(tx: Prisma.TransactionClient, tenantId: string, letterheadId: string, elements: ElementData[]) {
    await tx.rndtechnosoft_letterhead_elements.deleteMany({ where: { tenant_id: tenantId, letterhead_id: letterheadId } });
    if (elements.length) await tx.rndtechnosoft_letterhead_elements.createMany({ data: elements.map((e) => ({ ...e, id: randomUUID(), tenant_id: tenantId, letterhead_id: letterheadId })) });
  }

  /** A PNG or JPEG that PDFs can use, checked by content, with its size in pixels. */
  private checkImage(file: { buffer: Buffer; size: number } | undefined) {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('Choose an image to upload.');
    if (file.size > MAX_LETTERHEAD_IMAGE_BYTES) throw new BadRequestException('The image is larger than 2 MB. Upload a smaller copy.');
    const sniffed = sniffFileKind(file.buffer);
    if (!sniffed || sniffed.contentType === 'application/pdf') throw new BadRequestException('Upload a PNG or JPEG image.');
    const size = readableImage(file.buffer);
    if (!size) throw new BadRequestException('This image can’t be used in documents. Save it again as a standard PNG or JPEG and upload that.');
    return { buffer: file.buffer, extension: sniffed.extension, size };
  }

  /**
   * A box's columns: its measures (rounded to 0.1 mm) and rotation, or none for
   * the automatic layout, after checking it fits its area's height and the
   * widest page. A box left out of the input is not touched.
   */
  private boxColumns(field: BoxField, box: LetterheadBoxDto | null | undefined, areaHeightMm: number, areaName: string): BoxColumns {
    if (box === undefined) return {};
    const prefix = BOX_PREFIX[field];
    if (box === null) {
      return { [`${prefix}_x_mm`]: null, [`${prefix}_y_mm`]: null, [`${prefix}_width_mm`]: null, [`${prefix}_height_mm`]: null, [`${prefix}_stretch`]: false, [`${prefix}_rotation_deg`]: 0 } as BoxColumns;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const [x, y, width, height] = [box.x, box.y, box.width, box.height].map(round);
    const label = { logoBox: 'The logo', headerArtBox: 'The header artwork', footerArtBox: 'The footer artwork' }[field];
    if (y + height > areaHeightMm + 0.05) {
      throw new BadRequestException(`${label} reaches below the ${areaName} (${areaHeightMm} mm tall). Make it smaller, move it up, or make the ${areaName} taller.`);
    }
    if (x + width > WIDEST_AREA_MM + 0.05) throw new BadRequestException(`${label} is wider than the page. Make it narrower or move it left.`);
    return {
      [`${prefix}_x_mm`]: x,
      [`${prefix}_y_mm`]: y,
      [`${prefix}_width_mm`]: width,
      [`${prefix}_height_mm`]: height,
      [`${prefix}_stretch`]: box.stretch,
      [`${prefix}_rotation_deg`]: round(box.rotation ?? 0),
    } as BoxColumns;
  }

  /** Hidden and locked images as columns; a list left out is not touched. */
  private flagColumns(input: LetterheadInputDto): Partial<FlagColumns> {
    const columns: Partial<FlagColumns> = {};
    for (const slot of LETTERHEAD_IMAGE_SLOTS) {
      if (input.hiddenImages) columns[`is_${SLOT_PREFIX[slot]}_hidden`] = input.hiddenImages.includes(slot);
      if (input.lockedImages) columns[`is_${SLOT_PREFIX[slot]}_locked`] = input.lockedImages.includes(slot);
    }
    return columns;
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
      // Left out: unchanged. Null: at the page margins.
      ...(input.placement === undefined
        ? {}
        : { header_offset_mm: input.placement?.headerOffsetMm ?? null, footer_offset_mm: input.placement?.footerOffsetMm ?? null, side_offset_mm: input.placement?.sideOffsetMm ?? null }),
      is_default: input.isDefault,
      ...this.boxColumns('logoBox', input.logoBox, input.headerHeightMm, 'header'),
      ...this.boxColumns('headerArtBox', input.headerArtBox, input.headerHeightMm, 'header'),
      ...this.boxColumns('footerArtBox', input.footerArtBox, input.footerHeightMm, 'footer'),
      ...this.flagColumns(input),
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
      placement: placementOf(row),
      logoBox: boxOf(row, 'logoBox'),
      headerArtBox: boxOf(row, 'headerArtBox'),
      footerArtBox: boxOf(row, 'footerArtBox'),
      hiddenImages: flagged(row, 'hidden'),
      lockedImages: flagged(row, 'locked'),
      elements: row.rndtechnosoft_letterhead_elements.map((e) => ({
        id: e.id,
        kind: e.element_kind,
        x: Number(e.x_mm),
        y: Number(e.y_mm),
        width: Number(e.width_mm),
        height: Number(e.height_mm),
        rotation: Number(e.rotation_deg),
        opacity: Number(e.opacity),
        aboveText: e.is_above_text,
        hidden: e.is_hidden,
        locked: e.is_locked,
        imageId: e.asset_id,
        text: e.text_content,
        fontFamily: e.font_family,
        fontSizePt: e.font_size_pt === null ? null : Number(e.font_size_pt),
        bold: e.is_bold,
        italic: e.is_italic,
        color: e.text_color,
        align: e.text_align,
      })),
      isDefault: row.is_default,
      isArchived: row.is_archived,
      images: { logo: Boolean(row.logo_storage_key), header: Boolean(row.header_image_storage_key), footer: Boolean(row.footer_image_storage_key) },
      updatedAt: row.updated_at,
    };
  }

  private async row(tenantId: string, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Letterhead not found.');
    const row = await this.prisma.rndtechnosoft_letterheads.findFirst({ where: { tenant_id: tenantId, id }, include: WITH_ELEMENTS });
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
        // One change at a time per workspace, so two "default" choices (or two saves of the same letterhead's elements) can't race.
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
