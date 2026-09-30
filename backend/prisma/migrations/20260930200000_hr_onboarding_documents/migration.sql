-- HRMS onboarding, part 3: documents asked of a candidate, the files they or
-- HR upload for each (kept as numbered versions, stored privately), their
-- review, and the candidate's own upload link.
--
-- Tenant-owned throughout, with composite (tenant_id, ...) references; a file
-- always belongs to a request of the same candidate. The database enforces the
-- allowed values, one live (awaiting review or verified) file per request, and
-- that a reviewed file records who reviewed it and when.
--
-- Permissions (mirrors src/common/access/access-catalog.ts): every workspace
-- owner (ADMIN) role gets all three; roles and role templates that can add
-- employees get them too, as document collection is routine HR work.

-- AlterTable
ALTER TABLE "rndtechnosoft_candidates" ADD COLUMN     "document_link_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "document_link_number" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "document_link_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "document_token_hash" CHAR(64);

-- CreateTable
CREATE TABLE "rndtechnosoft_candidate_document_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "document_label" VARCHAR(120) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_candidate_document_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(64) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "uploaded_via" VARCHAR(16) NOT NULL,
    "uploaded_by_tenant_member_id" UUID,
    "uploader_ip" VARCHAR(64),
    "review_status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by_tenant_member_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_document_requests_candidate" ON "rndtechnosoft_candidate_document_requests"("tenant_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_requests_tenant_id" ON "rndtechnosoft_candidate_document_requests"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_requests_candidate_id" ON "rndtechnosoft_candidate_document_requests"("tenant_id", "candidate_id", "id");

-- CreateIndex
CREATE INDEX "ix_document_files_candidate" ON "rndtechnosoft_candidate_document_files"("tenant_id", "candidate_id");

-- CreateIndex
CREATE INDEX "ix_document_files_review" ON "rndtechnosoft_candidate_document_files"("tenant_id", "review_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_files_version" ON "rndtechnosoft_candidate_document_files"("tenant_id", "request_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_candidates_document_token" ON "rndtechnosoft_candidates"("document_token_hash");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_document_requests" ADD CONSTRAINT "fk_document_requests_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_document_requests" ADD CONSTRAINT "fk_document_requests_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_document_files" ADD CONSTRAINT "fk_document_files_request" FOREIGN KEY ("tenant_id", "candidate_id", "request_id") REFERENCES "rndtechnosoft_candidate_document_requests"("tenant_id", "candidate_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_document_files" ADD CONSTRAINT "fk_document_files_uploaded_by" FOREIGN KEY ("tenant_id", "uploaded_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_document_files" ADD CONSTRAINT "fk_document_files_reviewed_by" FOREIGN KEY ("tenant_id", "reviewed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_candidates"
  ADD CONSTRAINT "ck_candidates_document_link_number" CHECK ("document_link_number" >= 0);

ALTER TABLE "rndtechnosoft_candidate_document_requests"
  ADD CONSTRAINT "ck_document_requests_type" CHECK ("document_type" IN (
    'PHOTO', 'PAN_CARD', 'AADHAAR_CARD', 'PASSPORT', 'ADDRESS_PROOF', 'EDUCATION_CERTIFICATE',
    'EXPERIENCE_LETTER', 'RELIEVING_LETTER', 'PAYSLIP', 'BANK_PROOF', 'RESUME', 'OTHER')),
  ADD CONSTRAINT "ck_document_requests_label" CHECK (char_length(btrim("document_label")) > 0);

-- A document is asked for once per candidate.
CREATE UNIQUE INDEX "uq_document_requests_label" ON "rndtechnosoft_candidate_document_requests" ("tenant_id", "candidate_id", lower("document_label"));

ALTER TABLE "rndtechnosoft_candidate_document_files"
  ADD CONSTRAINT "ck_document_files_version" CHECK ("version_number" >= 1),
  ADD CONSTRAINT "ck_document_files_size" CHECK ("file_size_bytes" > 0),
  ADD CONSTRAINT "ck_document_files_content_type" CHECK ("content_type" IN ('application/pdf', 'image/jpeg', 'image/png')),
  ADD CONSTRAINT "ck_document_files_via" CHECK ("uploaded_via" IN ('STAFF', 'CANDIDATE')),
  -- HR uploads name the member; candidate uploads come through their link.
  ADD CONSTRAINT "ck_document_files_uploader" CHECK (("uploaded_via" = 'STAFF') = ("uploaded_by_tenant_member_id" IS NOT NULL)),
  ADD CONSTRAINT "ck_document_files_review_status" CHECK ("review_status" IN ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUPERSEDED')),
  ADD CONSTRAINT "ck_document_files_reviewed" CHECK ("review_status" NOT IN ('VERIFIED', 'REJECTED') OR ("reviewed_at" IS NOT NULL AND "reviewed_by_tenant_member_id" IS NOT NULL)),
  ADD CONSTRAINT "ck_document_files_rejection" CHECK ("review_status" <> 'REJECTED' OR char_length(btrim(coalesce("rejection_reason", ''))) > 0);

-- At most one live file per request: the one awaiting review, or the verified one.
CREATE UNIQUE INDEX "uq_document_files_one_live" ON "rndtechnosoft_candidate_document_files" ("tenant_id", "request_id") WHERE "review_status" IN ('PENDING_REVIEW', 'VERIFIED');

-- Permissions.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'onboarding.documents.view', 'HRMS', 'View and download candidates'' documents'),
  (gen_random_uuid(), 'onboarding.documents.manage', 'HRMS', 'Request documents, upload them for candidates and send upload links'),
  (gen_random_uuid(), 'onboarding.documents.verify', 'HRMS', 'Verify or reject candidates'' documents')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('onboarding.documents.view', 'onboarding.documents.manage', 'onboarding.documents.verify')
WHERE r.role_code = 'ADMIN'
   OR EXISTS (
     SELECT 1
     FROM rndtechnosoft_role_permissions rp
     JOIN rndtechnosoft_permissions hr ON hr.id = rp.permission_id
     WHERE rp.role_id = r.id AND rp.tenant_id = r.tenant_id AND hr.permission_code = 'people.create'
   )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), tp.role_template_id, p.id
FROM rndtechnosoft_role_template_permissions tp
JOIN rndtechnosoft_permissions hr ON hr.id = tp.permission_id AND hr.permission_code = 'people.create'
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('onboarding.documents.view', 'onboarding.documents.manage', 'onboarding.documents.verify')
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
