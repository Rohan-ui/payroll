-- AlterTable rndtechnosoft_employment_types
ALTER TABLE "rndtechnosoft_employment_types" ADD COLUMN IF NOT EXISTS "description" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_employment_types_tenant_name_lower" ON "rndtechnosoft_employment_types"("tenant_id", LOWER("employment_type_name"));
