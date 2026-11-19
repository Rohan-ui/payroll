-- Full and final settlement for an exit: earnings (leave encashment, gratuity,
-- notice pay, other payments) less recoveries (notice shortfall, loans, other
-- deductions), prepared by HR, reviewed by Finance, approved by someone else
-- and recorded as paid. Every amount is NUMERIC; the rules and inputs used are
-- kept with the settlement so it can always be explained. A changed approved
-- settlement is never edited: it is marked REVISED and a new version starts.

CREATE TABLE "rndtechnosoft_final_settlements" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "separation_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "settlement_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
  "total_earnings" NUMERIC(14, 2) NOT NULL DEFAULT 0,
  "total_recoveries" NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Earnings less recoveries; negative when the employee owes the company.
  "net_amount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
  "policy_snapshot" JSONB NOT NULL,
  "inputs_snapshot" JSONB NOT NULL,
  "calculated_at" TIMESTAMPTZ(6) NOT NULL,
  "prepared_by_tenant_member_id" UUID NOT NULL,
  "submitted_by_tenant_member_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "reviewed_by_tenant_member_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_notes" VARCHAR(1000),
  "approved_by_tenant_member_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "rejected_by_tenant_member_id" UUID,
  "rejected_at" TIMESTAMPTZ(6),
  "rejection_reason" VARCHAR(1000),
  "paid_by_tenant_member_id" UUID,
  "paid_at" TIMESTAMPTZ(6),
  "payment_date" DATE,
  "payment_mode" VARCHAR(16),
  "payment_reference" VARCHAR(120),
  "payment_remarks" VARCHAR(1000),
  "closed_by_tenant_member_id" UUID,
  "closed_at" TIMESTAMPTZ(6),
  "close_reason" VARCHAR(1000),
  "revised_from_settlement_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_final_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_final_settlements_status" CHECK ("settlement_status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED', 'REVISED')),
  CONSTRAINT "ck_final_settlements_totals" CHECK ("total_earnings" >= 0 AND "total_recoveries" >= 0 AND "net_amount" = "total_earnings" - "total_recoveries"),
  CONSTRAINT "ck_final_settlements_version" CHECK ("version_number" >= 1),
  CONSTRAINT "ck_final_settlements_submitted" CHECK ("settlement_status" IN ('DRAFT', 'CANCELLED') OR "submitted_at" IS NOT NULL),
  CONSTRAINT "ck_final_settlements_approved" CHECK ("settlement_status" NOT IN ('APPROVED', 'PAID', 'REVISED') OR ("approved_at" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
  CONSTRAINT "ck_final_settlements_rejected" CHECK (("settlement_status" = 'REJECTED') = ("rejected_at" IS NOT NULL) AND ("rejected_at" IS NULL OR "rejection_reason" IS NOT NULL)),
  CONSTRAINT "ck_final_settlements_paid" CHECK (("settlement_status" = 'PAID') = ("paid_at" IS NOT NULL) AND ("paid_at" IS NULL OR ("payment_date" IS NOT NULL AND "payment_mode" IS NOT NULL))),
  CONSTRAINT "ck_final_settlements_payment_mode" CHECK ("payment_mode" IS NULL OR "payment_mode" IN ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'RECOVERED')),
  CONSTRAINT "ck_final_settlements_closed" CHECK (("settlement_status" IN ('CANCELLED', 'REVISED')) = ("closed_at" IS NOT NULL) AND ("closed_at" IS NULL OR "close_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "uq_final_settlements_tenant_id" ON "rndtechnosoft_final_settlements"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_final_settlements_version" ON "rndtechnosoft_final_settlements"("tenant_id", "separation_id", "version_number");
-- One live settlement per exit, so nothing is settled twice.
CREATE UNIQUE INDEX "uq_final_settlements_live" ON "rndtechnosoft_final_settlements"("tenant_id", "separation_id") WHERE "settlement_status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID');
CREATE INDEX "ix_final_settlements_status" ON "rndtechnosoft_final_settlements"("tenant_id", "settlement_status");
ALTER TABLE "rndtechnosoft_final_settlements"
  ADD CONSTRAINT "fk_final_settlements_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_revised_from" FOREIGN KEY ("tenant_id", "revised_from_settlement_id") REFERENCES "rndtechnosoft_final_settlements"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_prepared_by" FOREIGN KEY ("tenant_id", "prepared_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_submitted_by" FOREIGN KEY ("tenant_id", "submitted_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_reviewed_by" FOREIGN KEY ("tenant_id", "reviewed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_approved_by" FOREIGN KEY ("tenant_id", "approved_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_rejected_by" FOREIGN KEY ("tenant_id", "rejected_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_paid_by" FOREIGN KEY ("tenant_id", "paid_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_final_settlements_closed_by" FOREIGN KEY ("tenant_id", "closed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_final_settlement_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "line_kind" VARCHAR(16) NOT NULL,
  "component_code" VARCHAR(32) NOT NULL,
  "line_label" VARCHAR(200) NOT NULL,
  -- What the rules worked out; NULL for a line HR added by hand.
  "calculated_amount" NUMERIC(14, 2),
  "amount" NUMERIC(14, 2) NOT NULL,
  -- FALSE for information only, such as the final month's salary already paid through payroll.
  "counts_in_total" BOOLEAN NOT NULL DEFAULT TRUE,
  "is_manual" BOOLEAN NOT NULL DEFAULT FALSE,
  "adjustment_reason" VARCHAR(500),
  -- How the amount was worked out: the numbers and rule used.
  "basis" JSONB NOT NULL DEFAULT '{}',
  "display_order" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_final_settlement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_final_settlement_lines_kind" CHECK ("line_kind" IN ('EARNING', 'RECOVERY')),
  CONSTRAINT "ck_final_settlement_lines_amount" CHECK ("amount" >= 0 AND ("calculated_amount" IS NULL OR "calculated_amount" >= 0)),
  CONSTRAINT "ck_final_settlement_lines_source" CHECK ("is_manual" = ("calculated_amount" IS NULL)),
  -- A hand-made line, or a calculated amount changed by hand, says why.
  CONSTRAINT "ck_final_settlement_lines_reason" CHECK (("is_manual" OR "amount" = "calculated_amount") OR "adjustment_reason" IS NOT NULL),
  CONSTRAINT "ck_final_settlement_lines_manual_reason" CHECK (NOT "is_manual" OR "adjustment_reason" IS NOT NULL),
  CONSTRAINT "fk_final_settlement_lines_settlement" FOREIGN KEY ("tenant_id", "settlement_id") REFERENCES "rndtechnosoft_final_settlements"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_final_settlement_lines_tenant_id" ON "rndtechnosoft_final_settlement_lines"("tenant_id", "id");
CREATE INDEX "ix_final_settlement_lines_settlement" ON "rndtechnosoft_final_settlement_lines"("tenant_id", "settlement_id", "display_order");

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'offboarding.settlement.view', 'HRMS', 'View full and final settlements and their calculation'),
  (gen_random_uuid(), 'offboarding.settlement.manage', 'HRMS', 'Prepare full and final settlements, adjust them with a reason, submit and revise them, and set the settlement rules'),
  (gen_random_uuid(), 'offboarding.settlement.review', 'HRMS', 'Review full and final settlements for Finance'),
  (gen_random_uuid(), 'offboarding.settlement.approve', 'HRMS', 'Approve or reject full and final settlements prepared by someone else'),
  (gen_random_uuid(), 'offboarding.settlement.pay', 'HRMS', 'Record the payment of approved full and final settlements')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code LIKE 'offboarding.settlement.%'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code LIKE 'offboarding.settlement.%'
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
