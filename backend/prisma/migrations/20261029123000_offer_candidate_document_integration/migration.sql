-- AlterTable rndtechnosoft_offers
ALTER TABLE "rndtechnosoft_offers" ADD COLUMN IF NOT EXISTS "candidate_document_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_offers_candidate_document" ON "rndtechnosoft_offers"("tenant_id", "candidate_document_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_candidate_documents_type" ON "rndtechnosoft_candidate_documents"("tenant_id", "document_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_candidate_documents_status" ON "rndtechnosoft_candidate_documents"("tenant_id", "document_status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_offers_candidate_document'
    ) THEN
        ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_candidate_document"
        FOREIGN KEY ("tenant_id", "candidate_document_id")
        REFERENCES "rndtechnosoft_candidate_documents"("tenant_id", "id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
