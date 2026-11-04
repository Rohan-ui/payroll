-- AlterTable
ALTER TABLE "rndtechnosoft_candidate_documents" ADD COLUMN     "separation_id" UUID;

-- AlterTable
ALTER TABLE "rndtechnosoft_onboarding_workflow_stages" RENAME CONSTRAINT "pk_onboarding_workflow_stages" TO "rndtechnosoft_onboarding_workflow_stages_pkey";

-- AlterTable
ALTER TABLE "rndtechnosoft_onboarding_workflow_transitions" RENAME CONSTRAINT "pk_onboarding_workflow_transitions" TO "rndtechnosoft_onboarding_workflow_transitions_pkey";

-- AlterTable
ALTER TABLE "rndtechnosoft_onboarding_workflow_versions" RENAME CONSTRAINT "pk_onboarding_workflow_versions" TO "rndtechnosoft_onboarding_workflow_versions_pkey";

-- AlterTable
ALTER TABLE "rndtechnosoft_onboarding_workflows" RENAME CONSTRAINT "pk_onboarding_workflows" TO "rndtechnosoft_onboarding_workflows_pkey";

-- CreateIndex
CREATE INDEX "rndtechnosoft_candidate_documents_tenant_id_separation_id_idx" ON "rndtechnosoft_candidate_documents"("tenant_id", "separation_id");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "fk_candidate_documents_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
