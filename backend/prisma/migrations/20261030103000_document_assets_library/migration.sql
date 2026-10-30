-- CreateTable
CREATE TABLE "rndtechnosoft_document_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(64) NOT NULL DEFAULT 'OTHER',
    "storage_key" VARCHAR(500) NOT NULL,
    "file_type" VARCHAR(64) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width_px" INTEGER NOT NULL,
    "height_px" INTEGER NOT NULL,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_document_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_assets_tenant_id" ON "rndtechnosoft_document_assets"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_document_assets_category" ON "rndtechnosoft_document_assets"("tenant_id", "category");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_assets" ADD CONSTRAINT "fk_document_assets_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_assets" ADD CONSTRAINT "fk_document_assets_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
