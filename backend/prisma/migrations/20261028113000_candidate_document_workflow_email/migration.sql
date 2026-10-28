-- AlterTable rndtechnosoft_document_templates
ALTER TABLE "rndtechnosoft_document_templates" ADD COLUMN IF NOT EXISTS "default_email_template_id" UUID;

-- AlterTable rndtechnosoft_email_templates
ALTER TABLE "rndtechnosoft_email_templates" ADD COLUMN IF NOT EXISTS "document_kind" VARCHAR(64);
ALTER TABLE "rndtechnosoft_email_templates" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable rndtechnosoft_candidate_documents
ALTER TABLE "rndtechnosoft_candidate_documents" ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMPTZ(6);
ALTER TABLE "rndtechnosoft_candidate_documents" ADD COLUMN IF NOT EXISTS "last_sent_by_tenant_member_id" UUID;
ALTER TABLE "rndtechnosoft_candidate_documents" ADD COLUMN IF NOT EXISTS "email_status" VARCHAR(24);

-- AlterTable rndtechnosoft_candidate_document_versions
ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD COLUMN IF NOT EXISTS "changelog_note" VARCHAR(500);
ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD COLUMN IF NOT EXISTS "content_hash" CHAR(64);
ALTER TABLE "rndtechnosoft_candidate_document_versions" ADD COLUMN IF NOT EXISTS "layout_data" JSONB;

-- CreateTable rndtechnosoft_candidate_document_status_history
CREATE TABLE IF NOT EXISTS "rndtechnosoft_candidate_document_status_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "from_status" VARCHAR(24) NOT NULL,
    "to_status" VARCHAR(24) NOT NULL,
    "reason" TEXT,
    "changed_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_document_status_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_cand_doc_status_hist_tenant_id" UNIQUE ("tenant_id", "id")
);

-- CreateTable rndtechnosoft_candidate_document_emails
CREATE TABLE IF NOT EXISTS "rndtechnosoft_candidate_document_emails" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_id" UUID,
    "version_number" INTEGER NOT NULL,
    "email_template_id" UUID,
    "sender_tenant_member_id" UUID,
    "sender_email" VARCHAR(320),
    "recipient_email" VARCHAR(320) NOT NULL,
    "cc_emails" VARCHAR(500),
    "bcc_emails" VARCHAR(500),
    "subject" VARCHAR(300) NOT NULL,
    "body_html" TEXT NOT NULL,
    "attachment_filename" VARCHAR(255) NOT NULL,
    "delivery_status" VARCHAR(24) NOT NULL DEFAULT 'SENT',
    "error_message" TEXT,
    "idempotency_key" VARCHAR(128),
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_document_emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_cand_doc_emails_tenant_id" UNIQUE ("tenant_id", "id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_cand_doc_status_hist_doc" ON "rndtechnosoft_candidate_document_status_history"("tenant_id", "document_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_cand_doc_emails_doc" ON "rndtechnosoft_candidate_document_emails"("tenant_id", "document_id", "sent_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_cand_doc_emails_candidate" ON "rndtechnosoft_candidate_document_emails"("tenant_id", "candidate_id");

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_templates_email_tpl') THEN
        ALTER TABLE "rndtechnosoft_document_templates" ADD CONSTRAINT "fk_document_templates_email_tpl" FOREIGN KEY ("tenant_id", "default_email_template_id") REFERENCES "rndtechnosoft_email_templates"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidate_documents_sent_by') THEN
        ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_sent_by" FOREIGN KEY ("tenant_id", "last_sent_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_status_hist_tenant') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_status_history" ADD CONSTRAINT "fk_cand_doc_status_hist_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_status_hist_doc') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_status_history" ADD CONSTRAINT "fk_cand_doc_status_hist_doc" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "rndtechnosoft_candidate_documents"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_status_hist_user') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_status_history" ADD CONSTRAINT "fk_cand_doc_status_hist_user" FOREIGN KEY ("tenant_id", "changed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_tenant') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_candidate') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_doc') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_doc" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "rndtechnosoft_candidate_documents"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_ver') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_ver" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "rndtechnosoft_candidate_document_versions"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_tpl') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_tpl" FOREIGN KEY ("tenant_id", "email_template_id") REFERENCES "rndtechnosoft_email_templates"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cand_doc_emails_sender') THEN
        ALTER TABLE "rndtechnosoft_candidate_document_emails" ADD CONSTRAINT "fk_cand_doc_emails_sender" FOREIGN KEY ("tenant_id", "sender_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
END $$;
