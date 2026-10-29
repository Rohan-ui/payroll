-- CreateTable
CREATE TABLE IF NOT EXISTS "rndtechnosoft_employee_cosec_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "cosec_employee_id" VARCHAR(64),
    "mapping_status" VARCHAR(32) NOT NULL DEFAULT 'MAPPING_PENDING',
    "mapping_source" VARCHAR(32) NOT NULL DEFAULT 'AUTOMATIC',
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
    "last_synced_at" TIMESTAMPTZ(6),
    "last_sync_result" VARCHAR(500),
    "review_notes" VARCHAR(500),
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_employee_cosec_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_employee_cosec_mappings_employee" ON "rndtechnosoft_employee_cosec_mappings"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_employee_cosec_mappings_cosec_id" ON "rndtechnosoft_employee_cosec_mappings"("tenant_id", "cosec_employee_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_employee_cosec_mappings_status" ON "rndtechnosoft_employee_cosec_mappings"("tenant_id", "mapping_status");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" DROP CONSTRAINT IF EXISTS "fk_employee_cosec_mappings_tenant";
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" ADD CONSTRAINT "fk_employee_cosec_mappings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" DROP CONSTRAINT IF EXISTS "fk_employee_cosec_mappings_employee";
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" ADD CONSTRAINT "fk_employee_cosec_mappings_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" DROP CONSTRAINT IF EXISTS "fk_employee_cosec_mappings_created_by";
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" ADD CONSTRAINT "fk_employee_cosec_mappings_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" DROP CONSTRAINT IF EXISTS "fk_employee_cosec_mappings_updated_by";
ALTER TABLE "rndtechnosoft_employee_cosec_mappings" ADD CONSTRAINT "fk_employee_cosec_mappings_updated_by" FOREIGN KEY ("tenant_id", "updated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
