-- AlterTable rndtechnosoft_crm_whatsapp_configs
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "sender_phone_number" VARCHAR(32);
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "waba_id" VARCHAR(120);
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "provider" VARCHAR(64) NOT NULL DEFAULT 'OTOMAT';
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "webhook_verify_token_encrypted" VARCHAR(512);
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "app_secret_encrypted" VARCHAR(512);
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMPTZ(6);
ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD COLUMN IF NOT EXISTS "last_sync_error" TEXT;

CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_configs_phone_id" ON "rndtechnosoft_crm_whatsapp_configs"("from_phone_number_id");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_configs_vendor_uid" ON "rndtechnosoft_crm_whatsapp_configs"("vendor_uid");

-- CreateTable rndtechnosoft_crm_whatsapp_provider_templates
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_whatsapp_provider_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "template_language" VARCHAR(32) NOT NULL DEFAULT 'en',
    "category" VARCHAR(64) NOT NULL DEFAULT 'UTILITY',
    "status" VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
    "header_type" VARCHAR(32) NOT NULL DEFAULT 'NONE',
    "body_text" TEXT NOT NULL,
    "buttons_count" INTEGER NOT NULL DEFAULT 0,
    "raw_components" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_whatsapp_provider_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable rndtechnosoft_crm_whatsapp_webhook_events
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_whatsapp_webhook_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "provider" VARCHAR(64) NOT NULL DEFAULT 'OTOMAT',
    "event_type" VARCHAR(64) NOT NULL,
    "event_payload" JSONB NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- Unique constraints & indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_crm_wa_prov_tpl_tenant_id') THEN
        ALTER TABLE "rndtechnosoft_crm_whatsapp_provider_templates" ADD CONSTRAINT "uq_crm_wa_prov_tpl_tenant_id" UNIQUE ("tenant_id", "id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_crm_wa_prov_tpl_name_lang') THEN
        ALTER TABLE "rndtechnosoft_crm_whatsapp_provider_templates" ADD CONSTRAINT "uq_crm_wa_prov_tpl_name_lang" UNIQUE ("tenant_id", "template_name", "template_language");
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_crm_wa_prov_tpl_status" ON "rndtechnosoft_crm_whatsapp_provider_templates"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "ix_crm_wa_prov_tpl_name" ON "rndtechnosoft_crm_whatsapp_provider_templates"("tenant_id", "template_name");
CREATE INDEX IF NOT EXISTS "ix_crm_wa_wh_events_hash" ON "rndtechnosoft_crm_whatsapp_webhook_events"("payload_hash");
CREATE INDEX IF NOT EXISTS "ix_crm_wa_wh_events_tenant_time" ON "rndtechnosoft_crm_whatsapp_webhook_events"("tenant_id", "created_at" DESC);

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_crm_wa_prov_tpl_tenant') THEN
        ALTER TABLE "rndtechnosoft_crm_whatsapp_provider_templates" ADD CONSTRAINT "fk_crm_wa_prov_tpl_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_crm_wa_wh_events_tenant') THEN
        ALTER TABLE "rndtechnosoft_crm_whatsapp_webhook_events" ADD CONSTRAINT "fk_crm_wa_wh_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;
