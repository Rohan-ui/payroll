-- Payroll, phase 4: overtime decisions, monthly entries (bonuses, incentives,
-- manual deductions) with their creator, and arrears from salary revisions
-- back-dated into finalized payroll.

ALTER TABLE "rndtechnosoft_payroll_inputs" ADD COLUMN     "created_by_tenant_member_id" UUID,
ADD COLUMN     "rejection_reason" VARCHAR(500);
CREATE TABLE "rndtechnosoft_overtime_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "recorded_minutes" INTEGER NOT NULL,
    "approved_minutes" INTEGER NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "note" VARCHAR(500),
    "decided_by_tenant_member_id" UUID,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT "rndtechnosoft_overtime_approvals_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rndtechnosoft_salary_arrears" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "salary_assignment_id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "paid_earnings" DECIMAL(18,2) NOT NULL,
    "revised_earnings" DECIMAL(18,2) NOT NULL,
    "arrears_amount" DECIMAL(18,2) NOT NULL,
    "calculation_detail" JSONB NOT NULL,
    "arrears_status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "included_in_run_employee_id" UUID,
    "included_at" TIMESTAMPTZ(6),
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT "rndtechnosoft_salary_arrears_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_overtime_approvals_tenant_id" ON "rndtechnosoft_overtime_approvals"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_overtime_approvals_day" ON "rndtechnosoft_overtime_approvals"("tenant_id", "employee_id", "work_date");
CREATE INDEX "ix_salary_arrears_pending" ON "rndtechnosoft_salary_arrears"("tenant_id", "employee_id", "arrears_status");
CREATE UNIQUE INDEX "uq_salary_arrears_tenant_id" ON "rndtechnosoft_salary_arrears"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_salary_arrears_period" ON "rndtechnosoft_salary_arrears"("tenant_id", "salary_assignment_id", "payroll_period_id");
ALTER TABLE "rndtechnosoft_payroll_inputs" ADD CONSTRAINT "fk_payroll_inputs_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_overtime_approvals" ADD CONSTRAINT "fk_overtime_approvals_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_overtime_approvals" ADD CONSTRAINT "fk_overtime_approvals_decided_by" FOREIGN KEY ("tenant_id", "decided_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_arrears" ADD CONSTRAINT "fk_salary_arrears_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_arrears" ADD CONSTRAINT "fk_salary_arrears_assignment" FOREIGN KEY ("tenant_id", "salary_assignment_id") REFERENCES "rndtechnosoft_employee_salary_assignments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_arrears" ADD CONSTRAINT "fk_salary_arrears_period" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "rndtechnosoft_payroll_periods"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_arrears" ADD CONSTRAINT "fk_salary_arrears_run_employee" FOREIGN KEY ("tenant_id", "included_in_run_employee_id") REFERENCES "rndtechnosoft_payroll_run_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_arrears" ADD CONSTRAINT "fk_salary_arrears_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "rndtechnosoft_overtime_approvals"
  ADD CONSTRAINT "ck_overtime_approvals_decision" CHECK ("decision" IN ('APPROVED', 'REJECTED')),
  ADD CONSTRAINT "ck_overtime_approvals_minutes" CHECK (
    "recorded_minutes" > 0 AND "approved_minutes" >= 0 AND "approved_minutes" <= "recorded_minutes"
    AND ("decision" = 'APPROVED' OR "approved_minutes" = 0)
  );

ALTER TABLE "rndtechnosoft_salary_arrears"
  ADD CONSTRAINT "ck_salary_arrears_status" CHECK ("arrears_status" IN ('PENDING', 'INCLUDED', 'CANCELLED')),
  ADD CONSTRAINT "ck_salary_arrears_amount" CHECK ("arrears_amount" > 0 AND "arrears_amount" = "revised_earnings" - "paid_earnings"),
  ADD CONSTRAINT "ck_salary_arrears_included" CHECK (("arrears_status" = 'INCLUDED') = ("included_in_run_employee_id" IS NOT NULL AND "included_at" IS NOT NULL));

-- Loans and advances, recovered through payroll. These tables predate this
-- change, so their rules are NOT VALID: enforced for every new or changed row
-- without refusing the deployment over any old one.
ALTER TABLE "rndtechnosoft_employee_loans"
  ADD CONSTRAINT "ck_employee_loans_type" CHECK ("loan_type" IN ('LOAN', 'ADVANCE')) NOT VALID,
  ADD CONSTRAINT "ck_employee_loans_status" CHECK ("loan_status" IN ('ACTIVE', 'CLOSED', 'CANCELLED')) NOT VALID,
  ADD CONSTRAINT "ck_employee_loans_amounts" CHECK ("principal_amount" > 0 AND "installment_amount" > 0 AND "total_repayable_amount" >= "principal_amount") NOT VALID;
ALTER TABLE "rndtechnosoft_loan_installments"
  ADD CONSTRAINT "ck_loan_installments_status" CHECK ("installment_status" IN ('SCHEDULED', 'RECOVERED', 'DEFERRED', 'CANCELLED')) NOT VALID,
  ADD CONSTRAINT "ck_loan_installments_amount" CHECK ("total_amount" > 0 AND "total_amount" = "principal_amount" + "interest_amount") NOT VALID;

-- A monthly entry is posted once: one live entry per employee, component and
-- month, and an entry from another record (a reimbursement, say) once per record.
CREATE UNIQUE INDEX "uq_payroll_inputs_manual" ON "rndtechnosoft_payroll_inputs"("tenant_id", "payroll_period_id", "employee_id", "salary_component_id")
  WHERE "reference_type" IS NULL AND "input_status" IN ('PENDING', 'APPROVED');
CREATE UNIQUE INDEX "uq_payroll_inputs_reference" ON "rndtechnosoft_payroll_inputs"("tenant_id", "reference_type", "reference_id")
  WHERE "reference_type" IS NOT NULL AND "input_status" IN ('PENDING', 'APPROVED');

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'payroll.inputs.manage', 'FINANCE', 'Enter monthly payroll amounts such as bonuses, incentives and deductions'),
  (gen_random_uuid(), 'payroll.inputs.approve', 'FINANCE', 'Approve or reject monthly payroll amounts'),
  (gen_random_uuid(), 'payroll.overtime.approve', 'FINANCE', 'Approve or reject overtime for payroll'),
  (gen_random_uuid(), 'payroll.loans.manage', 'FINANCE', 'Give employees loans and advances and manage their recovery')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('payroll.inputs.manage', 'payroll.inputs.approve', 'payroll.overtime.approve', 'payroll.loans.manage')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
