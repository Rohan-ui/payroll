-- AlterTable rndtechnosoft_candidate_document_status_history
ALTER TABLE "rndtechnosoft_candidate_document_status_history" ADD COLUMN IF NOT EXISTS "is_override" BOOLEAN NOT NULL DEFAULT false;
