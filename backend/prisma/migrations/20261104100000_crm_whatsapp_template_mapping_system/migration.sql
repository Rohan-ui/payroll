-- CreateTable
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_message_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_code" VARCHAR(80) NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
    "channel" VARCHAR(32) NOT NULL DEFAULT 'WHATSAPP',
    "message_body" TEXT NOT NULL,
    "detected_variables" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_whatsapp_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "api_base_url" VARCHAR(255),
    "vendor_uid" VARCHAR(120) NOT NULL,
    "bearer_token_encrypted" VARCHAR(512) NOT NULL,
    "from_phone_number_id" VARCHAR(120),
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_whatsapp_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "crm_template_id" UUID NOT NULL,
    "whatsapp_template_name" VARCHAR(160) NOT NULL,
    "whatsapp_template_language" VARCHAR(32) NOT NULL DEFAULT 'en',
    "whatsapp_config_id" UUID,
    "body_mapping" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "header_mapping" JSONB,
    "media_type" VARCHAR(32) DEFAULT 'NONE',
    "media_mapping" JSONB,
    "button_mapping" JSONB,
    "sample_preview_values" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_whatsapp_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rndtechnosoft_crm_whatsapp_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "crm_template_id" UUID,
    "whatsapp_mapping_id" UUID,
    "lead_id" UUID,
    "client_id" UUID,
    "recipient_phone" VARCHAR(32) NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "template_language" VARCHAR(32) NOT NULL,
    "resolved_variables" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "payload_sent" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "provider_response" JSONB,
    "provider_message_id" VARCHAR(255),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "sent_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "rndtechnosoft_crm_message_templates" ADD CONSTRAINT "uq_crm_message_templates_tenant_id" UNIQUE ("tenant_id", "id");
ALTER TABLE "rndtechnosoft_crm_message_templates" ADD CONSTRAINT "uq_crm_message_templates_code" UNIQUE ("tenant_id", "template_code");

ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD CONSTRAINT "uq_crm_whatsapp_configs_tenant_id" UNIQUE ("tenant_id", "id");

ALTER TABLE "rndtechnosoft_crm_whatsapp_mappings" ADD CONSTRAINT "uq_crm_whatsapp_mappings_tenant_id" UNIQUE ("tenant_id", "id");
ALTER TABLE "rndtechnosoft_crm_whatsapp_mappings" ADD CONSTRAINT "uq_crm_whatsapp_mappings_template_id" UNIQUE ("tenant_id", "crm_template_id");

ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "uq_crm_whatsapp_logs_tenant_id" UNIQUE ("tenant_id", "id");

-- Indexes
CREATE INDEX IF NOT EXISTS "ix_crm_message_templates_status" ON "rndtechnosoft_crm_message_templates"("tenant_id", "is_active");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_configs_active" ON "rndtechnosoft_crm_whatsapp_configs"("tenant_id", "is_default", "is_active");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_mappings_wa_tpl" ON "rndtechnosoft_crm_whatsapp_mappings"("tenant_id", "whatsapp_template_name");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_logs_time" ON "rndtechnosoft_crm_whatsapp_logs"("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_logs_status" ON "rndtechnosoft_crm_whatsapp_logs"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_logs_wamid" ON "rndtechnosoft_crm_whatsapp_logs"("tenant_id", "provider_message_id");
CREATE INDEX IF NOT EXISTS "ix_crm_whatsapp_logs_lead" ON "rndtechnosoft_crm_whatsapp_logs"("tenant_id", "lead_id");

-- Foreign Keys
ALTER TABLE "rndtechnosoft_crm_message_templates" ADD CONSTRAINT "fk_crm_message_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "rndtechnosoft_crm_whatsapp_configs" ADD CONSTRAINT "fk_crm_whatsapp_configs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "rndtechnosoft_crm_whatsapp_mappings" ADD CONSTRAINT "fk_crm_whatsapp_mappings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_mappings" ADD CONSTRAINT "fk_crm_whatsapp_mappings_template" FOREIGN KEY ("tenant_id", "crm_template_id") REFERENCES "rndtechnosoft_crm_message_templates"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_mappings" ADD CONSTRAINT "fk_crm_whatsapp_mappings_config" FOREIGN KEY ("tenant_id", "whatsapp_config_id") REFERENCES "rndtechnosoft_crm_whatsapp_configs"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "fk_crm_whatsapp_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "fk_crm_whatsapp_logs_template" FOREIGN KEY ("tenant_id", "crm_template_id") REFERENCES "rndtechnosoft_crm_message_templates"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "fk_crm_whatsapp_logs_mapping" FOREIGN KEY ("tenant_id", "whatsapp_mapping_id") REFERENCES "rndtechnosoft_crm_whatsapp_mappings"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "fk_crm_whatsapp_logs_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_crm_whatsapp_logs" ADD CONSTRAINT "fk_crm_whatsapp_logs_client" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "rndtechnosoft_crm_clients"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

