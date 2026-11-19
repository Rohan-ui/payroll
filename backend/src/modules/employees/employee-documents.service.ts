import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { MAX_FILE_BYTES, safeFilename, sniffFileKind } from '@/modules/onboarding/candidate-documents';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { UploadEmployeeDocumentDto } from './dto/employee-documents.dto';

type Actor = AuthenticatedTenantUser;
type Tx = Prisma.TransactionClient;

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const PEOPLE = {
  uploaded_by: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } },
  reviewed_by: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } },
} satisfies Prisma.rndtechnosoft_employee_documentsInclude;

type DocumentRow = Prisma.rndtechnosoft_employee_documentsGetPayload<{ include: typeof PEOPLE }>;

const STORAGE_CATEGORY = 'employee-documents';
/** Documents on file at once per employee; replaced and removed ones do not count. */
const MAX_DOCUMENTS = 100;

const who = (member: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) =>
  member ? member.rndtechnosoft_users.display_name || member.rndtechnosoft_users.email : null;

/**
 * An employee's documents. Files sit in private storage under the workspace's
 * own folder and are only ever read back through this service. A replaced or
 * removed document keeps its row and file, so the record of what was held,
 * who reviewed it and who took it away is never lost.
 */
@Injectable()
export class EmployeeDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: PrivateStorageService,
  ) {}

  /** The documents on file today, newest first. */
  async list(tenantId: string, employeeId: string) {
    await this.employeeOr404(this.prisma, tenantId, employeeId);
    const rows = await this.prisma.rndtechnosoft_employee_documents.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, replaced_by_document_id: null, removed_at: null },
      include: PEOPLE,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const today = isoDate(dateOnly(new Date().toISOString().slice(0, 10)));
    return rows.map((row) => this.view(row, today));
  }

  async upload(tenantId: string, employeeId: string, file: UploadedFile | undefined, input: UploadEmployeeDocumentDto, actor: Actor) {
    if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
      throw new BadRequestException('The expiry date is before the issue date.');
    }
    const stored = await this.store(tenantId, file);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const count = await tx.rndtechnosoft_employee_documents.count({ where: { tenant_id: tenantId, employee_id: employeeId, replaced_by_document_id: null, removed_at: null } });
      if (count >= MAX_DOCUMENTS) throw new BadRequestException(`An employee can have at most ${MAX_DOCUMENTS} documents on file. Remove ones no longer needed first.`);
      await tx.rndtechnosoft_employee_documents.create({
        data: {
          id,
          tenant_id: tenantId,
          employee_id: employeeId,
          document_type: input.category,
          document_name: input.title.trim(),
          description: input.description?.trim() || null,
          issued_on: input.issuedOn ? dateOnly(input.issuedOn) : null,
          expires_on: input.expiresOn ? dateOnly(input.expiresOn) : null,
          uploaded_by_tenant_member_id: actor.tenantMemberId,
          ...stored,
        },
      });
    });
    await this.log(tenantId, actor, 'EMPLOYEE_DOCUMENT_UPLOADED', employeeId, { document_id: id, title: input.title.trim(), category: input.category });
    return this.list(tenantId, employeeId);
  }

  /** A new file in the same document's place, reviewed again; the old row points to it. */
  async replace(tenantId: string, employeeId: string, documentId: string, file: UploadedFile | undefined, actor: Actor) {
    const stored = await this.store(tenantId, file);
    const id = randomUUID();
    const title = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const current = await this.currentOr404(tx, tenantId, employeeId, documentId);
      await tx.rndtechnosoft_employee_documents.create({
        data: {
          id,
          tenant_id: tenantId,
          employee_id: employeeId,
          document_type: current.document_type,
          document_name: current.document_name,
          description: current.description,
          issued_on: current.issued_on,
          expires_on: current.expires_on,
          uploaded_by_tenant_member_id: actor.tenantMemberId,
          ...stored,
        },
      });
      await tx.rndtechnosoft_employee_documents.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: documentId } },
        data: { replaced_by_document_id: id, updated_at: new Date() },
      });
      return current.document_name;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_DOCUMENT_REPLACED', employeeId, { document_id: id, replaced_document_id: documentId, title });
    return this.list(tenantId, employeeId);
  }

  async remove(tenantId: string, employeeId: string, documentId: string, reason: string, actor: Actor) {
    const title = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const current = await this.currentOr404(tx, tenantId, employeeId, documentId);
      await tx.rndtechnosoft_employee_documents.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: documentId } },
        data: { removed_at: new Date(), removed_by_tenant_member_id: actor.tenantMemberId, removal_reason: reason.trim(), updated_at: new Date() },
      });
      return current.document_name;
    });
    await this.log(tenantId, actor, 'EMPLOYEE_DOCUMENT_REMOVED', employeeId, { document_id: documentId, title, reason: reason.trim() });
    return this.list(tenantId, employeeId);
  }

  async verify(tenantId: string, employeeId: string, documentId: string, actor: Actor) {
    return this.review(tenantId, employeeId, documentId, actor, 'VERIFIED', null);
  }

  async reject(tenantId: string, employeeId: string, documentId: string, reason: string, actor: Actor) {
    return this.review(tenantId, employeeId, documentId, actor, 'REJECTED', reason.trim());
  }

  /** The file's bytes, only for a document of this employee in this workspace. */
  async file(tenantId: string, employeeId: string, documentId: string) {
    const row = await this.prisma.rndtechnosoft_employee_documents.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, id: documentId, removed_at: null },
      select: { storage_key: true, content_type: true, original_filename: true },
    });
    if (!row) throw new NotFoundException('Document not found.');
    return { bytes: await this.storage.read(tenantId, row.storage_key), contentType: row.content_type, filename: row.original_filename };
  }

  private async review(tenantId: string, employeeId: string, documentId: string, actor: Actor, status: 'VERIFIED' | 'REJECTED', reason: string | null) {
    const title = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, tenantId, employeeId);
      const current = await this.currentOr404(tx, tenantId, employeeId, documentId);
      if (current.document_status !== 'PENDING_VERIFICATION') {
        throw new ConflictException(`This document was already ${current.document_status === 'VERIFIED' ? 'verified' : 'rejected'}. Replace it to review a new file.`);
      }
      const now = new Date();
      await tx.rndtechnosoft_employee_documents.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: documentId } },
        data: {
          document_status: status,
          rejection_reason: reason,
          reviewed_at: now,
          reviewed_by_tenant_member_id: actor.tenantMemberId,
          // The existing verified_* columns mean "verified", so they are set only then.
          verified_at: status === 'VERIFIED' ? now : null,
          verified_by_tenant_member_id: status === 'VERIFIED' ? actor.tenantMemberId : null,
          updated_at: now,
        },
      });
      return current.document_name;
    });
    await this.log(tenantId, actor, status === 'VERIFIED' ? 'EMPLOYEE_DOCUMENT_VERIFIED' : 'EMPLOYEE_DOCUMENT_REJECTED', employeeId, {
      document_id: documentId, title, ...(reason ? { reason } : {}),
    });
    return this.list(tenantId, employeeId);
  }

  /** Checks the file by its bytes (PDF, JPG or PNG, at most 10 MB) and stores it privately. */
  private async store(tenantId: string, file: UploadedFile | undefined) {
    if (!file || !file.buffer?.length) throw new BadRequestException('Choose a file to upload.');
    if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) throw new PayloadTooLargeException('The file is larger than 10 MB. Upload a smaller copy.');
    const kind = sniffFileKind(file.buffer);
    if (!kind) throw new BadRequestException('Upload a PDF, JPG or PNG file.');
    const saved = await this.storage.save(tenantId, STORAGE_CATEGORY, file.buffer, kind.extension);
    return {
      storage_key: saved.key,
      file_sha256: saved.sha256,
      file_size_bytes: saved.size,
      content_type: kind.contentType,
      original_filename: safeFilename(file.originalname, kind.extension, 'document'),
    };
  }

  private view(row: DocumentRow, today: string) {
    return {
      id: row.id,
      category: row.document_type,
      title: row.document_name,
      description: row.description,
      issuedOn: row.issued_on ? isoDate(row.issued_on) : null,
      expiresOn: row.expires_on ? isoDate(row.expires_on) : null,
      status: row.document_status,
      isExpired: Boolean(row.expires_on && isoDate(row.expires_on) < today),
      rejectionReason: row.rejection_reason,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      reviewedBy: who(row.reviewed_by),
      uploadedAt: row.created_at.toISOString(),
      uploadedBy: who(row.uploaded_by),
      filename: row.original_filename,
      contentType: row.content_type,
      sizeBytes: row.file_size_bytes,
    };
  }

  private async currentOr404(tx: Tx, tenantId: string, employeeId: string, documentId: string) {
    const row = await tx.rndtechnosoft_employee_documents.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, id: documentId, replaced_by_document_id: null, removed_at: null },
    });
    if (!row) throw new NotFoundException('Document not found. It may have been replaced or removed.');
    return row;
  }

  private async employeeOr404(db: Tx | PrismaService, tenantId: string, employeeId: string) {
    const employee = await db.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Employee not found.');
  }

  private async lockEmployee(tx: Tx, tenantId: string, employeeId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_employees WHERE tenant_id = ${tenantId}::uuid AND id = ${employeeId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Employee not found.');
  }

  private log(tenantId: string, actor: Actor, actionCode: string, employeeId: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE', entityId: employeeId, metadata });
  }
}
