-- Employee documents: categorised, reviewed, replaceable and removable without
-- losing what was there. The table has never held rows, so the new NOT NULL
-- columns and CHECKs apply to no existing data.

ALTER TABLE "rndtechnosoft_employee_documents"
  ADD COLUMN "description" VARCHAR(1000),
  ADD COLUMN "document_status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_VERIFICATION',
  ADD COLUMN "rejection_reason" VARCHAR(500),
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_tenant_member_id" UUID,
  ADD COLUMN "original_filename" VARCHAR(255) NOT NULL,
  ADD COLUMN "content_type" VARCHAR(64) NOT NULL,
  ADD COLUMN "file_size_bytes" INTEGER NOT NULL,
  ADD COLUMN "file_sha256" CHAR(64) NOT NULL,
  ADD COLUMN "uploaded_by_tenant_member_id" UUID,
  ADD COLUMN "replaced_by_document_id" UUID,
  ADD COLUMN "removed_at" TIMESTAMPTZ(6),
  ADD COLUMN "removed_by_tenant_member_id" UUID,
  ADD COLUMN "removal_reason" VARCHAR(500);

-- document_type is the category.
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_type" CHECK ("document_type" IN (
  'IDENTITY', 'ADDRESS_PROOF', 'EDUCATION', 'EXPERIENCE', 'PREVIOUS_EMPLOYMENT', 'OFFER_LETTER', 'APPOINTMENT_LETTER',
  'EMPLOYMENT_AGREEMENT', 'JOINING', 'BANK', 'TAX', 'OTHER'));
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_status"
  CHECK ("document_status" IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'));
-- A decision says who made it and when; a rejection also says why.
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_review" CHECK (
  ("document_status" = 'PENDING_VERIFICATION' AND "reviewed_at" IS NULL)
  OR ("document_status" = 'VERIFIED' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NULL)
  OR ("document_status" = 'REJECTED' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL));
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_removed"
  CHECK (("removed_at" IS NULL) = ("removal_reason" IS NULL));
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_file"
  CHECK ("file_size_bytes" > 0 AND "content_type" IN ('application/pdf', 'image/jpeg', 'image/png'));
ALTER TABLE "rndtechnosoft_employee_documents" ADD CONSTRAINT "ck_employee_documents_dates"
  CHECK ("issued_on" IS NULL OR "expires_on" IS NULL OR "expires_on" >= "issued_on");

ALTER TABLE "rndtechnosoft_employee_documents"
  ADD CONSTRAINT "fk_employee_documents_reviewed_by" FOREIGN KEY ("tenant_id", "reviewed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_employee_documents_uploaded_by" FOREIGN KEY ("tenant_id", "uploaded_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_employee_documents_removed_by" FOREIGN KEY ("tenant_id", "removed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_employee_documents_replaced_by" FOREIGN KEY ("tenant_id", "replaced_by_document_id") REFERENCES "rndtechnosoft_employee_documents"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- The documents on file today: neither replaced nor removed.
CREATE INDEX "ix_employee_documents_current" ON "rndtechnosoft_employee_documents"("tenant_id", "employee_id", "document_type")
  WHERE "replaced_by_document_id" IS NULL AND "removed_at" IS NULL;

-- Managing and reviewing employee documents get their own permissions.
-- Mirrors src/common/access/access-catalog.ts. Every workspace owner (ADMIN)
-- role holds every permission, so it gets both.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'people.documents.manage', 'HRMS', 'Upload, replace and remove employee documents'),
  (gen_random_uuid(), 'people.documents.verify', 'HRMS', 'Verify or reject employee documents')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('people.documents.manage', 'people.documents.verify')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
