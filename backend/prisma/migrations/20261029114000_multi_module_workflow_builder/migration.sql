-- AlterTable: Add module and trigger_type to rndtechnosoft_onboarding_workflows
ALTER TABLE "rndtechnosoft_onboarding_workflows" ADD COLUMN IF NOT EXISTS "module" VARCHAR(64) NOT NULL DEFAULT 'ONBOARDING';
ALTER TABLE "rndtechnosoft_onboarding_workflows" ADD COLUMN IF NOT EXISTS "trigger_type" VARCHAR(64) NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_onboarding_workflows_module" ON "rndtechnosoft_onboarding_workflows"("tenant_id", "module");
