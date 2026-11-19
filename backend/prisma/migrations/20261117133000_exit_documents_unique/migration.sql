-- One document of each kind per exit; a new draft is a new version of it, never a second document.
CREATE UNIQUE INDEX "uq_candidate_documents_exit_kind" ON "rndtechnosoft_candidate_documents"("tenant_id", "separation_id", "document_type") WHERE "separation_id" IS NOT NULL;
