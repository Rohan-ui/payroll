-- The onboarding document checklist: each document type says when it is
-- collected (with the application, or at joining once the offer is accepted)
-- and, optionally, which employment types it applies to. A type with no
-- employment types listed applies to everyone, so existing types keep
-- applying exactly as before.

ALTER TABLE "rndtechnosoft_document_types" ADD COLUMN "collect_at" VARCHAR(16) NOT NULL DEFAULT 'JOINING';
ALTER TABLE "rndtechnosoft_document_types" ADD CONSTRAINT "ck_document_types_collect_at" CHECK ("collect_at" IN ('APPLICATION', 'JOINING'));
-- A resume is asked for with the application.
UPDATE "rndtechnosoft_document_types" SET "collect_at" = 'APPLICATION' WHERE "code" = 'RESUME';

CREATE TABLE "rndtechnosoft_document_type_employment_types" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "document_type_id" UUID NOT NULL,
  "employment_type_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_document_type_employment_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_doc_type_emp_types_type" FOREIGN KEY ("tenant_id", "document_type_id") REFERENCES "rndtechnosoft_document_types"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_doc_type_emp_types_employment" FOREIGN KEY ("tenant_id", "employment_type_id") REFERENCES "rndtechnosoft_employment_types"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_doc_type_emp_types" ON "rndtechnosoft_document_type_employment_types"("tenant_id", "document_type_id", "employment_type_id");
