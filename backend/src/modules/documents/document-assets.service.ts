import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { sniffFileKind } from '@/modules/onboarding/candidate-documents';
import { readableImage } from './document-pdf.service';
import { CreateDocumentAssetDto, DocumentAssetCategory, UpdateDocumentAssetDto } from './dto/documents.dto';

export const MAX_DOCUMENT_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DocumentAssetItem {
  id: string;
  name: string;
  category: DocumentAssetCategory;
  fileType: string;
  fileSize: number;
  widthPx: number;
  heightPx: number;
  url: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DocumentAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: PrivateStorageService,
  ) {}

  /** Sniffs PNG, JPEG or WebP from bytes */
  private detectFileType(bytes: Buffer): { contentType: string; extension: string } | null {
    const sniffed = sniffFileKind(bytes);
    if (sniffed && sniffed.contentType !== 'application/pdf') {
      return sniffed;
    }
    // Check WebP: 'RIFF'....'WEBP'
    if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
      return { contentType: 'image/webp', extension: 'webp' };
    }
    return null;
  }

  private detectDimensions(bytes: Buffer): { width: number; height: number } {
    const fromPdfkit = readableImage(bytes);
    if (fromPdfkit) return fromPdfkit;

    // Direct PNG header inspection (offset 16: width, offset 20: height)
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }

    // Direct WebP header inspection
    if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
      // VP8 lossy
      if (bytes.toString('ascii', 12, 16) === 'VP8 ') {
        const width = bytes.readUInt16LE(26) & 0x3fff;
        const height = bytes.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
      // VP8L lossless
      if (bytes.toString('ascii', 12, 16) === 'VP8L') {
        const b1 = bytes[21];
        const b2 = bytes[22];
        const b3 = bytes[23];
        const b4 = bytes[24];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        if (width > 0 && height > 0) return { width, height };
      }
    }

    // Default fallback dimensions if not parseable
    return { width: 400, height: 200 };
  }

  async list(tenantId: string, category?: string): Promise<DocumentAssetItem[]> {
    const rows = await this.prisma.rndtechnosoft_document_assets.findMany({
      where: {
        tenant_id: tenantId,
        ...(category && category !== 'ALL' ? { category } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 200,
      include: {
        created_by: {
          select: {
            rndtechnosoft_users: {
              select: { display_name: true, email: true },
            },
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.asset_name,
      category: r.category as DocumentAssetCategory,
      fileType: r.file_type,
      fileSize: r.file_size,
      widthPx: r.width_px,
      heightPx: r.height_px,
      url: `/api/v1/documents/assets/${r.id}/file`,
      createdBy: r.created_by?.rndtechnosoft_users?.display_name || r.created_by?.rndtechnosoft_users?.email || null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  async get(tenantId: string, id: string): Promise<DocumentAssetItem> {
    if (!UUID.test(id)) throw new NotFoundException('Document asset not found.');
    const r = await this.prisma.rndtechnosoft_document_assets.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        created_by: {
          select: {
            rndtechnosoft_users: {
              select: { display_name: true, email: true },
            },
          },
        },
      },
    });
    if (!r) throw new NotFoundException('Document asset not found.');

    return {
      id: r.id,
      name: r.asset_name,
      category: r.category as DocumentAssetCategory,
      fileType: r.file_type,
      fileSize: r.file_size,
      widthPx: r.width_px,
      heightPx: r.height_px,
      url: `/api/v1/documents/assets/${r.id}/file`,
      createdBy: r.created_by?.rndtechnosoft_users?.display_name || r.created_by?.rndtechnosoft_users?.email || null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async getFile(tenantId: string, id: string): Promise<{ bytes: Buffer; contentType: string }> {
    if (!UUID.test(id)) throw new NotFoundException('Document asset not found.');
    const r = await this.prisma.rndtechnosoft_document_assets.findFirst({
      where: { tenant_id: tenantId, id },
      select: { storage_key: true, file_type: true },
    });
    if (!r) throw new NotFoundException('Document asset not found.');
    const bytes = await this.storage.read(tenantId, r.storage_key);
    return { bytes, contentType: r.file_type };
  }

  async upload(
    tenantId: string,
    file: { buffer: Buffer; size: number } | undefined,
    dto: CreateDocumentAssetDto,
    actor: AuthenticatedTenantUser,
  ): Promise<DocumentAssetItem> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Choose an image to upload.');
    }
    if (file.size > MAX_DOCUMENT_ASSET_BYTES) {
      throw new BadRequestException('The image is larger than 5 MB. Upload a smaller copy.');
    }

    const detected = this.detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Upload a PNG, JPEG or WebP image.');
    }

    const dimensions = this.detectDimensions(file.buffer);
    const assetId = randomUUID();
    const stored = await this.storage.save(tenantId, 'document-assets', file.buffer, detected.extension);

    const assetName = (dto.name || 'Untitled Image').trim();
    const category = dto.category || 'OTHER';

    const row = await this.prisma.rndtechnosoft_document_assets.create({
      data: {
        id: assetId,
        tenant_id: tenantId,
        asset_name: assetName,
        category,
        storage_key: stored.key,
        file_type: detected.contentType,
        file_size: file.size,
        width_px: dimensions.width,
        height_px: dimensions.height,
        created_by_tenant_member_id: actor.tenantMemberId,
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_ASSET_UPLOADED',
      entityType: 'document_asset',
      entityId: assetId,
      newValues: {
        name: assetName,
        category,
        file_type: detected.contentType,
        file_size: file.size,
        sha256: stored.sha256,
      },
    });

    return {
      id: row.id,
      name: row.asset_name,
      category: row.category as DocumentAssetCategory,
      fileType: row.file_type,
      fileSize: row.file_size,
      widthPx: row.width_px,
      heightPx: row.height_px,
      url: `/api/v1/documents/assets/${row.id}/file`,
      createdBy: null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async rename(
    tenantId: string,
    id: string,
    dto: UpdateDocumentAssetDto,
    actor: AuthenticatedTenantUser,
  ): Promise<DocumentAssetItem> {
    if (!UUID.test(id)) throw new NotFoundException('Document asset not found.');
    const existing = await this.prisma.rndtechnosoft_document_assets.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Document asset not found.');

    const name = dto.name !== undefined ? dto.name.trim() : existing.asset_name;
    const category = dto.category !== undefined ? dto.category : existing.category;

    const updated = await this.prisma.rndtechnosoft_document_assets.update({
      where: { id },
      data: {
        asset_name: name,
        category,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_ASSET_UPDATED',
      entityType: 'document_asset',
      entityId: id,
      oldValues: { name: existing.asset_name, category: existing.category },
      newValues: { name: updated.asset_name, category: updated.category },
    });

    return this.get(tenantId, id);
  }

  async delete(tenantId: string, id: string, actor: AuthenticatedTenantUser): Promise<{ id: string }> {
    if (!UUID.test(id)) throw new NotFoundException('Document asset not found.');
    const existing = await this.prisma.rndtechnosoft_document_assets.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Document asset not found.');

    await this.prisma.rndtechnosoft_document_assets.delete({
      where: { id },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_ASSET_DELETED',
      entityType: 'document_asset',
      entityId: id,
      oldValues: { name: existing.asset_name, category: existing.category, storage_key: existing.storage_key },
    });

    return { id };
  }
}
