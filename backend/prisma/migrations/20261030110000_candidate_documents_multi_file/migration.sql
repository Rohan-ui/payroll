-- CreateTable: rndtechnosoft_document_types
CREATE TABLE "rndtechnosoft_document_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_files" INTEGER NOT NULL DEFAULT 1,
    "max_files" INTEGER NOT NULL DEFAULT 1,
    "allowed_formats" JSONB,
    "max_file_size_bytes" INTEGER NOT NULL DEFAULT 10485760,
    "allow_images" BOOLEAN NOT NULL DEFAULT true,
    "allow_pdf" BOOLEAN NOT NULL DEFAULT true,
    "requires_front_back" BOOLEAN NOT NULL DEFAULT false,
    "allow_multiple_pages" BOOLEAN NOT NULL DEFAULT false,
    "requires_verification" BOOLEAN NOT NULL DEFAULT true,
    "can_reupload_rejected" BOOLEAN NOT NULL DEFAULT true,
    "slots" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_document_types_pkey" PRIMARY KEY ("id")
);

-- Unique indexes on document types
CREATE UNIQUE INDEX "uq_document_types_tenant_id" ON "rndtechnosoft_document_types"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_document_types_tenant_code" ON "rndtechnosoft_document_types"("tenant_id", "code");
CREATE INDEX "ix_document_types_tenant_active" ON "rndtechnosoft_document_types"("tenant_id", "is_active");

-- Foreign keys on document types
ALTER TABLE "rndtechnosoft_document_types" ADD CONSTRAINT "fk_document_types_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_document_types" ADD CONSTRAINT "fk_document_types_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: rndtechnosoft_candidate_document_requests
ALTER TABLE "rndtechnosoft_candidate_document_requests"
    ALTER COLUMN "document_type" TYPE VARCHAR(50),
    ADD COLUMN "document_type_id" UUID,
    ADD COLUMN "min_files" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "max_files" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "slots" JSONB,
    ADD COLUMN "requires_front_back" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "allow_multiple_pages" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "requires_verification" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "can_reupload_rejected" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "allowed_formats" JSONB,
    ADD COLUMN "max_file_size_bytes" INTEGER NOT NULL DEFAULT 10485760;

CREATE INDEX "ix_document_requests_type_id" ON "rndtechnosoft_candidate_document_requests"("tenant_id", "document_type_id");

ALTER TABLE "rndtechnosoft_candidate_document_requests" ADD CONSTRAINT "fk_document_requests_type_id" FOREIGN KEY ("tenant_id", "document_type_id") REFERENCES "rndtechnosoft_document_types"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AlterTable: rndtechnosoft_candidate_document_files
ALTER TABLE "rndtechnosoft_candidate_document_files"
    ADD COLUMN "slot_name" VARCHAR(100),
    ADD COLUMN "replaced_file_id" UUID,
    ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

CREATE UNIQUE INDEX "uq_document_files_tenant_id" ON "rndtechnosoft_candidate_document_files"("tenant_id", "id");
CREATE INDEX "ix_document_files_slot" ON "rndtechnosoft_candidate_document_files"("tenant_id", "request_id", "slot_name");
CREATE INDEX "ix_document_files_replaced" ON "rndtechnosoft_candidate_document_files"("tenant_id", "replaced_file_id");

ALTER TABLE "rndtechnosoft_candidate_document_files" ADD CONSTRAINT "fk_document_files_replaced" FOREIGN KEY ("tenant_id", "replaced_file_id") REFERENCES "rndtechnosoft_candidate_document_files"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Drop obsolete single-live-file restriction index
DROP INDEX IF EXISTS "uq_document_files_one_live";

-- Add partial unique index for slots: at most one live (pending or verified) file per slot
CREATE UNIQUE INDEX "uq_document_files_one_live_slot" ON "rndtechnosoft_candidate_document_files" ("tenant_id", "request_id", "slot_name") WHERE "review_status" IN ('PENDING_REVIEW', 'VERIFIED') AND "slot_name" IS NOT NULL;

-- Drop check constraint that restricted document_type to hardcoded enum list
ALTER TABLE "rndtechnosoft_candidate_document_requests" DROP CONSTRAINT IF EXISTS "ck_document_requests_type";

-- Seed default document types for all existing tenants
INSERT INTO rndtechnosoft_document_types (
  id, tenant_id, code, name, description, is_required, min_files, max_files, allowed_formats, max_file_size_bytes,
  allow_images, allow_pdf, requires_front_back, allow_multiple_pages, requires_verification, can_reupload_rejected, slots, is_active
)
SELECT
  gen_random_uuid(),
  t.id,
  d.code,
  d.name,
  d.description,
  d.is_required,
  d.min_files,
  d.max_files,
  d.allowed_formats::jsonb,
  d.max_file_size_bytes,
  d.allow_images,
  d.allow_pdf,
  d.requires_front_back,
  d.allow_multiple_pages,
  d.requires_verification,
  d.can_reupload_rejected,
  d.slots::jsonb,
  true
FROM rndtechnosoft_tenants t
CROSS JOIN (
  VALUES
    ('PAN_CARD', 'PAN Card', 'Permanent Account Number card', true, 1, 1, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, false, true, true, NULL),
    ('AADHAAR_CARD', 'Aadhaar Card', 'Unique Identification Authority of India (UIDAI) Card with Front and Back sides', true, 2, 2, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, true, false, true, true, '["Front Side", "Back Side"]'),
    ('EDUCATION_CERTIFICATE', 'Education Certificate', 'Degree, Diploma or Marksheet records', true, 1, 5, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, NULL),
    ('EXPERIENCE_LETTER', 'Experience Letter', 'Service letters or relievers from prior employers', true, 1, 5, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, NULL),
    ('RELIEVING_LETTER', 'Relieving Letter', 'Official relieving confirmation from previous employer', true, 1, 3, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, NULL),
    ('PASSPORT', 'Passport', 'Passport identification and address pages', false, 1, 2, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, '["Personal Details Page", "Address / Emigration Page"]'),
    ('DRIVING_LICENCE', 'Driving Licence', 'Driving licence front and back', false, 2, 2, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, true, false, true, true, '["Front Side", "Back Side"]'),
    ('BANK_PROOF', 'Bank Proof', 'Cancelled cheque or bank account statement', false, 1, 1, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, false, true, true, NULL),
    ('PHOTO', 'Passport-size Photo', 'Recent passport size photograph of the candidate', false, 1, 1, '["image/jpeg","image/png"]', 10485760, true, false, false, false, true, true, NULL),
    ('RESUME', 'Resume', 'Curriculum Vitae / Resume PDF', false, 1, 1, '["application/pdf"]', 10485760, false, true, false, false, true, true, NULL),
    ('PAYSLIP', 'Last Payslips', 'Salary slips from previous employment', false, 1, 3, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, NULL),
    ('OTHER', 'Other Document', 'Additional onboarding supporting documents', false, 1, 5, '["application/pdf","image/jpeg","image/png"]', 10485760, true, true, false, true, true, true, NULL)
) AS d(code, name, description, is_required, min_files, max_files, allowed_formats, max_file_size_bytes, allow_images, allow_pdf, requires_front_back, allow_multiple_pages, requires_verification, can_reupload_rejected, slots)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Backfill existing candidate document requests to link with document types
UPDATE rndtechnosoft_candidate_document_requests r
SET
  min_files = dt.min_files,
  max_files = dt.max_files,
  slots = dt.slots,
  requires_front_back = dt.requires_front_back,
  allow_multiple_pages = dt.allow_multiple_pages,
  requires_verification = dt.requires_verification,
  can_reupload_rejected = dt.can_reupload_rejected,
  allowed_formats = dt.allowed_formats,
  max_file_size_bytes = dt.max_file_size_bytes,
  document_type_id = dt.id
FROM rndtechnosoft_document_types dt
WHERE dt.tenant_id = r.tenant_id AND dt.code = r.document_type;

-- Backfill slot_name on existing Aadhaar files to 'Front Side' if unslotted
UPDATE rndtechnosoft_candidate_document_files f
SET slot_name = 'Front Side'
FROM rndtechnosoft_candidate_document_requests r
WHERE r.tenant_id = f.tenant_id AND r.id = f.request_id AND r.document_type = 'AADHAAR_CARD' AND f.slot_name IS NULL;
