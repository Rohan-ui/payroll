-- Backfill migration.
-- The bookkeeping, platform (super admin) and CRM tables were previously
-- applied with 'prisma db push' and never recorded as a migration, so a
-- fresh database could not be built from the migration history.
-- Generated with 'prisma migrate diff' from the 0_init baseline.

-- AlterTable
ALTER TABLE "rndtechnosoft_payroll_periods" ADD COLUMN     "financial_year_id" UUID;

-- CreateTable
CREATE TABLE "rndtechnosoft_financial_years" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "financial_year_code" VARCHAR(32) NOT NULL,
    "financial_year_name" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "assessment_year" VARCHAR(32),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_tenant_member_id" UUID,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_financial_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_accounting_ledgers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ledger_code" VARCHAR(64) NOT NULL,
    "ledger_name" VARCHAR(160) NOT NULL,
    "account_category" VARCHAR(32) NOT NULL,
    "normal_balance" VARCHAR(16) NOT NULL DEFAULT 'DEBIT',
    "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_accounting_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_bookkeeping_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "payroll_run_id" UUID,
    "payroll_period_id" UUID,
    "voucher_number" VARCHAR(64) NOT NULL,
    "voucher_date" DATE NOT NULL,
    "voucher_type" VARCHAR(32) NOT NULL DEFAULT 'PAYROLL_ACCRUAL',
    "total_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "narration" VARCHAR(500) NOT NULL,
    "entry_status" VARCHAR(32) NOT NULL DEFAULT 'POSTED',
    "posted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_bookkeeping_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_bookkeeping_entry_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bookkeeping_entry_id" UUID NOT NULL,
    "ledger_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "entry_side" VARCHAR(16) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "narration" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_bookkeeping_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_financial_year_ledger_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "financial_year_id" UUID NOT NULL,
    "ledger_id" UUID NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_debits" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credits" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_financial_year_ledger_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_super_admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "role" VARCHAR(64) NOT NULL DEFAULT 'SUPER_ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_settings" (
    "id" UUID NOT NULL,
    "setting_category" VARCHAR(64) NOT NULL,
    "setting_key" VARCHAR(128) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "description" VARCHAR(500),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_number" VARCHAR(64) NOT NULL,
    "plan_id" UUID,
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
    "invoice_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "payment_gateway" VARCHAR(64),
    "external_payment_id" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_activity_logs" (
    "id" UUID NOT NULL,
    "super_admin_id" UUID,
    "category" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_tenant_id" UUID,
    "description" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_number" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "priority" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "category" VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
    "description" TEXT NOT NULL,
    "assigned_admin_id" UUID,
    "created_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_coupons" (
    "id" UUID NOT NULL,
    "coupon_code" VARCHAR(64) NOT NULL,
    "discount_type" VARCHAR(32) NOT NULL DEFAULT 'PERCENTAGE',
    "discount_value" DECIMAL(10,2) NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_tenant_quotas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_seats_limit" INTEGER NOT NULL DEFAULT 10,
    "branch_limit" INTEGER NOT NULL DEFAULT 2,
    "storage_limit_mb" INTEGER NOT NULL DEFAULT 5120,
    "monthly_ai_tokens" INTEGER NOT NULL DEFAULT 100000,
    "monthly_whatsapp_credits" INTEGER NOT NULL DEFAULT 500,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_tenant_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_pipelines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(32) NOT NULL DEFAULT '#6366f1',
    "stage_probability" INTEGER NOT NULL DEFAULT 50,
    "sla_duration_hours" INTEGER NOT NULL DEFAULT 72,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_lead_sources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(64) NOT NULL DEFAULT 'INBOUND_WEB',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_services_master" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "sac_code" VARCHAR(32) NOT NULL DEFAULT '998314',
    "default_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billing_unit" VARCHAR(32) NOT NULL DEFAULT 'MILESTONE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_services_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_lost_reasons_master" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reason_name" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_lost_reasons_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_sop_steps_master" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "day_number" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_objective" VARCHAR(500) NOT NULL,
    "script_template" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_sop_steps_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_sop_reply_branches_master" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "trigger_condition" VARCHAR(255) NOT NULL,
    "suggested_action" VARCHAR(255) NOT NULL,
    "recommended_response_script" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_sop_reply_branches_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_sop_industries_master" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "industry_key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "tagline" VARCHAR(255) NOT NULL,
    "portfolio_highlight" VARCHAR(500) NOT NULL,
    "value_tip" VARCHAR(500) NOT NULL,
    "audit_hook" VARCHAR(500) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_sop_industries_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_code" VARCHAR(64) NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "whatsapp_number" VARCHAR(32),
    "website_url" VARCHAR(255),
    "linkedin_url" VARCHAR(255),
    "designation" VARCHAR(100),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country_code" CHAR(2) DEFAULT 'IN',
    "address" TEXT,
    "postal_code" VARCHAR(20),
    "industry" VARCHAR(80),
    "sub_industry" VARCHAR(100),
    "alternate_email" VARCHAR(320),
    "alternate_phone" VARCHAR(32),
    "linkedin_company_url" VARCHAR(255),
    "website_status" VARCHAR(32),
    "primary_service_id" UUID,
    "primary_service" VARCHAR(200),
    "requirement_brief" TEXT,
    "internal_notes" TEXT,
    "budget_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "source_id" UUID,
    "assigned_tenant_member_id" UUID,
    "temperature" VARCHAR(32) NOT NULL DEFAULT 'WARM',
    "ai_score" INTEGER NOT NULL DEFAULT 50,
    "win_probability" DECIMAL(5,2) DEFAULT 20,
    "urgency" VARCHAR(32) DEFAULT 'MEDIUM',
    "cadence_step" INTEGER NOT NULL DEFAULT 1,
    "touchpoints_count" INTEGER NOT NULL DEFAULT 0,
    "next_followup_at" TIMESTAMPTZ(6),
    "last_contacted_at" TIMESTAMPTZ(6),
    "sla_status" VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    "gstin" VARCHAR(32),
    "pan" VARCHAR(32),
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "lost_reason_id" UUID,
    "converted_client_id" UUID,
    "converted_project_id" VARCHAR(64),
    "closed_at" TIMESTAMPTZ(6),
    "client_id" UUID,
    "is_existing_client" BOOLEAN DEFAULT false,
    "custom_attributes" JSONB,
    "stage_entered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_lead_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "activity_type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "duration_seconds" INTEGER,
    "call_disposition" VARCHAR(64),
    "performed_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_lead_followups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "followup_type" VARCHAR(32) NOT NULL DEFAULT 'CALL',
    "priority" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    "instructions" VARCHAR(500),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "assigned_to_tenant_member_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "outcome_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_lead_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_meetings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "meeting_type" VARCHAR(32) NOT NULL DEFAULT 'GOOGLE_MEET',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "meeting_link" VARCHAR(255),
    "minutes_of_meeting" TEXT,
    "ai_action_items" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_quotations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "quotation_number" VARCHAR(64) NOT NULL,
    "tax_mode" VARCHAR(32) NOT NULL DEFAULT 'INTRA_STATE',
    "client_state" VARCHAR(100),
    "branch_state" VARCHAR(100),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
    "quotation_status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "valid_until" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_quotation_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "service_id" UUID,
    "description" VARCHAR(500) NOT NULL,
    "sac_code" VARCHAR(32) NOT NULL DEFAULT '998314',
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_rate" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 18.0,
    "line_amount" DECIMAL(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_quotation_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(80),
    "description" TEXT,
    "items_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_quotation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_code" VARCHAR(64) NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "contact_person" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "gstin" VARCHAR(32),
    "pan" VARCHAR(32),
    "billing_address" VARCHAR(500),
    "client_status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_from_lead_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_crm_audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action_type" VARCHAR(32) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(120),
    "changes_diff" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_crm_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_financial_years_1" ON "rndtechnosoft_financial_years"("tenant_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_years_1" ON "rndtechnosoft_financial_years"("tenant_id", "financial_year_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_years_tenant_id" ON "rndtechnosoft_financial_years"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_accounting_ledgers_1" ON "rndtechnosoft_accounting_ledgers"("tenant_id", "account_category");

-- CreateIndex
CREATE UNIQUE INDEX "uq_accounting_ledgers_1" ON "rndtechnosoft_accounting_ledgers"("tenant_id", "ledger_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_accounting_ledgers_tenant_id" ON "rndtechnosoft_accounting_ledgers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_bookkeeping_entries_1" ON "rndtechnosoft_bookkeeping_entries"("tenant_id", "financial_year_id", "voucher_date");

-- CreateIndex
CREATE INDEX "ix_bookkeeping_entries_2" ON "rndtechnosoft_bookkeeping_entries"("tenant_id", "payroll_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bookkeeping_entries_1" ON "rndtechnosoft_bookkeeping_entries"("tenant_id", "voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bookkeeping_entries_tenant_id" ON "rndtechnosoft_bookkeeping_entries"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_bookkeeping_entry_lines_1" ON "rndtechnosoft_bookkeeping_entry_lines"("tenant_id", "bookkeeping_entry_id", "line_number");

-- CreateIndex
CREATE INDEX "ix_bookkeeping_entry_lines_2" ON "rndtechnosoft_bookkeeping_entry_lines"("tenant_id", "ledger_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_bookkeeping_entry_lines_tenant_id" ON "rndtechnosoft_bookkeeping_entry_lines"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_fy_ledger_balances_1" ON "rndtechnosoft_financial_year_ledger_balances"("tenant_id", "financial_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_fy_ledger_balances_1" ON "rndtechnosoft_financial_year_ledger_balances"("tenant_id", "financial_year_id", "ledger_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_fy_ledger_balances_tenant_id" ON "rndtechnosoft_financial_year_ledger_balances"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_super_admins_1" ON "rndtechnosoft_super_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_settings_1" ON "rndtechnosoft_platform_settings"("setting_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_invoices_1" ON "rndtechnosoft_platform_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "ix_platform_invoices_status" ON "rndtechnosoft_platform_invoices"("tenant_id", "invoice_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_support_tickets_1" ON "rndtechnosoft_platform_support_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "ix_platform_tickets_status" ON "rndtechnosoft_platform_support_tickets"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_coupons_1" ON "rndtechnosoft_platform_coupons"("coupon_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tenant_quotas_tenant_id" ON "rndtechnosoft_tenant_quotas"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_pipelines_code" ON "rndtechnosoft_crm_pipelines"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_pipelines_tenant_id" ON "rndtechnosoft_crm_pipelines"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_stages_pipeline" ON "rndtechnosoft_crm_stages"("tenant_id", "pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_stages_tenant_id" ON "rndtechnosoft_crm_stages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_lead_sources_tenant_id" ON "rndtechnosoft_crm_lead_sources"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_services_master_tenant_id" ON "rndtechnosoft_crm_services_master"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_lost_reasons_master_tenant_id" ON "rndtechnosoft_crm_lost_reasons_master"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_sop_steps_master_tenant_id" ON "rndtechnosoft_crm_sop_steps_master"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_sop_reply_branches_master_tenant_id" ON "rndtechnosoft_crm_sop_reply_branches_master"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_sop_industries_master_tenant_id" ON "rndtechnosoft_crm_sop_industries_master"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_leads_stage" ON "rndtechnosoft_crm_leads"("tenant_id", "pipeline_id", "stage_id");

-- CreateIndex
CREATE INDEX "ix_crm_leads_temperature" ON "rndtechnosoft_crm_leads"("tenant_id", "temperature");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_leads_code" ON "rndtechnosoft_crm_leads"("tenant_id", "lead_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_leads_tenant_id" ON "rndtechnosoft_crm_leads"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_activities_lead" ON "rndtechnosoft_crm_lead_activities"("tenant_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_activities_tenant_id" ON "rndtechnosoft_crm_lead_activities"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_followups_status" ON "rndtechnosoft_crm_lead_followups"("tenant_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_followups_tenant_id" ON "rndtechnosoft_crm_lead_followups"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_meetings_scheduled" ON "rndtechnosoft_crm_meetings"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_meetings_tenant_id" ON "rndtechnosoft_crm_meetings"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_quotations_number" ON "rndtechnosoft_crm_quotations"("tenant_id", "quotation_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_quotations_tenant_id" ON "rndtechnosoft_crm_quotations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_quotation_items_tenant_id" ON "rndtechnosoft_crm_quotation_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_quotation_templates_tenant_id" ON "rndtechnosoft_crm_quotation_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_clients_code" ON "rndtechnosoft_crm_clients"("tenant_id", "client_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_clients_tenant_id" ON "rndtechnosoft_crm_clients"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_crm_audit_logs_entity" ON "rndtechnosoft_crm_audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_crm_audit_logs_tenant_id" ON "rndtechnosoft_crm_audit_logs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_payroll_periods" ADD CONSTRAINT "fk_payroll_periods_fy" FOREIGN KEY ("tenant_id", "financial_year_id") REFERENCES "rndtechnosoft_financial_years"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_financial_years" ADD CONSTRAINT "fk_financial_years_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_accounting_ledgers" ADD CONSTRAINT "fk_accounting_ledgers_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entries" ADD CONSTRAINT "fk_bookkeeping_entries_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entries" ADD CONSTRAINT "fk_bookkeeping_entries_fy" FOREIGN KEY ("tenant_id", "financial_year_id") REFERENCES "rndtechnosoft_financial_years"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entries" ADD CONSTRAINT "fk_bookkeeping_entries_run" FOREIGN KEY ("tenant_id", "payroll_run_id") REFERENCES "rndtechnosoft_payroll_runs"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entries" ADD CONSTRAINT "fk_bookkeeping_entries_period" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "rndtechnosoft_payroll_periods"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entry_lines" ADD CONSTRAINT "fk_bookkeeping_entry_lines_entry" FOREIGN KEY ("tenant_id", "bookkeeping_entry_id") REFERENCES "rndtechnosoft_bookkeeping_entries"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_bookkeeping_entry_lines" ADD CONSTRAINT "fk_bookkeeping_entry_lines_ledger" FOREIGN KEY ("tenant_id", "ledger_id") REFERENCES "rndtechnosoft_accounting_ledgers"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_financial_year_ledger_balances" ADD CONSTRAINT "fk_fy_balances_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_financial_year_ledger_balances" ADD CONSTRAINT "fk_fy_balances_fy" FOREIGN KEY ("tenant_id", "financial_year_id") REFERENCES "rndtechnosoft_financial_years"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_financial_year_ledger_balances" ADD CONSTRAINT "fk_fy_balances_ledger" FOREIGN KEY ("tenant_id", "ledger_id") REFERENCES "rndtechnosoft_accounting_ledgers"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_platform_invoices" ADD CONSTRAINT "fk_platform_invoices_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_platform_activity_logs" ADD CONSTRAINT "fk_platform_activity_admin" FOREIGN KEY ("super_admin_id") REFERENCES "rndtechnosoft_super_admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_platform_support_tickets" ADD CONSTRAINT "fk_platform_tickets_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_tenant_quotas" ADD CONSTRAINT "fk_tenant_quotas_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_pipelines" ADD CONSTRAINT "fk_crm_pipelines_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_stages" ADD CONSTRAINT "fk_crm_stages_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_stages" ADD CONSTRAINT "fk_crm_stages_pipeline" FOREIGN KEY ("tenant_id", "pipeline_id") REFERENCES "rndtechnosoft_crm_pipelines"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lead_sources" ADD CONSTRAINT "fk_crm_lead_sources_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_services_master" ADD CONSTRAINT "fk_crm_services_master_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lost_reasons_master" ADD CONSTRAINT "fk_crm_lost_reasons_master_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_sop_steps_master" ADD CONSTRAINT "fk_crm_sop_steps_master_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_sop_reply_branches_master" ADD CONSTRAINT "fk_crm_sop_reply_branches_master_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_sop_industries_master" ADD CONSTRAINT "fk_crm_sop_industries_master_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_pipeline" FOREIGN KEY ("tenant_id", "pipeline_id") REFERENCES "rndtechnosoft_crm_pipelines"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_stage" FOREIGN KEY ("tenant_id", "stage_id") REFERENCES "rndtechnosoft_crm_stages"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_source" FOREIGN KEY ("tenant_id", "source_id") REFERENCES "rndtechnosoft_crm_lead_sources"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_service" FOREIGN KEY ("tenant_id", "primary_service_id") REFERENCES "rndtechnosoft_crm_services_master"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_lost_reason" FOREIGN KEY ("tenant_id", "lost_reason_id") REFERENCES "rndtechnosoft_crm_lost_reasons_master"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "fk_crm_leads_assigned_member" FOREIGN KEY ("tenant_id", "assigned_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lead_activities" ADD CONSTRAINT "fk_crm_activities_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lead_activities" ADD CONSTRAINT "fk_crm_activities_member" FOREIGN KEY ("tenant_id", "performed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lead_followups" ADD CONSTRAINT "fk_crm_followups_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_lead_followups" ADD CONSTRAINT "fk_crm_followups_member" FOREIGN KEY ("tenant_id", "assigned_to_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_meetings" ADD CONSTRAINT "fk_crm_meetings_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_quotations" ADD CONSTRAINT "fk_crm_quotations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_quotations" ADD CONSTRAINT "fk_crm_quotations_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_quotation_items" ADD CONSTRAINT "fk_crm_quotation_items_quote" FOREIGN KEY ("tenant_id", "quotation_id") REFERENCES "rndtechnosoft_crm_quotations"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_quotation_items" ADD CONSTRAINT "fk_crm_quotation_items_service" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "rndtechnosoft_crm_services_master"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_quotation_templates" ADD CONSTRAINT "fk_crm_quotation_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_clients" ADD CONSTRAINT "fk_crm_clients_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_crm_audit_logs" ADD CONSTRAINT "fk_crm_audit_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

