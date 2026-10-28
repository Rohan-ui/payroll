-- Drop the restrictive check constraint on document template kind
ALTER TABLE "rndtechnosoft_document_templates" DROP CONSTRAINT IF EXISTS "ck_document_templates_kind";
ALTER TABLE "rndtechnosoft_document_templates" ADD CONSTRAINT "ck_document_templates_kind" CHECK (char_length(btrim(template_kind)) > 0);

-- Create table for generated & saved candidate / employee documents
CREATE TABLE IF NOT EXISTS "rndtechnosoft_candidate_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "employee_id" UUID,
    "template_id" UUID,
    "template_version_id" UUID,
    "document_title" VARCHAR(200) NOT NULL,
    "document_type" VARCHAR(64) NOT NULL,
    "document_status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "rendered_title" VARCHAR(200),
    "rendered_body" TEXT,
    "rendered_document" JSONB,
    "letterhead_id" UUID,
    "page_size" VARCHAR(8) NOT NULL DEFAULT 'A4',
    "margin_top_mm" INTEGER NOT NULL DEFAULT 20,
    "margin_right_mm" INTEGER NOT NULL DEFAULT 20,
    "margin_bottom_mm" INTEGER NOT NULL DEFAULT 20,
    "margin_left_mm" INTEGER NOT NULL DEFAULT 20,
    "show_page_numbers" BOOLEAN NOT NULL DEFAULT false,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_documents_pkey" PRIMARY KEY ("id")
);

-- Create table for version history snapshots
CREATE TABLE IF NOT EXISTS "rndtechnosoft_candidate_document_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "document_data" JSONB,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_document_versions_pkey" PRIMARY KEY ("id")
);

-- Unique constraints & indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_candidate_documents_tenant_id') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "uq_candidate_documents_tenant_id" UNIQUE ("tenant_id", "id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_candidate_doc_versions_tenant_id') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD CONSTRAINT "uq_candidate_doc_versions_tenant_id" UNIQUE ("tenant_id", "id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_candidate_doc_versions_number') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD CONSTRAINT "uq_candidate_doc_versions_number" UNIQUE ("tenant_id", "document_id", "version_number");
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_candidate_documents_candidate" ON "rndtechnosoft_candidate_documents"("tenant_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "ix_candidate_documents_employee" ON "rndtechnosoft_candidate_documents"("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "ix_candidate_doc_versions_document" ON "rndtechnosoft_candidate_document_versions"("tenant_id", "document_id");

-- Foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_tenant') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_candidate') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_employee') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_template') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_template" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "rndtechnosoft_document_templates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_template_version') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_template_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_document_template_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_letterhead') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_letterhead" FOREIGN KEY ("tenant_id", "letterhead_id") REFERENCES "rndtechnosoft_letterheads"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_created_by') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_updated_by') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_updated_by" FOREIGN KEY ("tenant_id", "updated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_doc_versions_doc') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD CONSTRAINT "fk_candidate_doc_versions_doc" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "rndtechnosoft_candidate_documents"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_doc_versions_created_by') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD CONSTRAINT "fk_candidate_doc_versions_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
END $$;
