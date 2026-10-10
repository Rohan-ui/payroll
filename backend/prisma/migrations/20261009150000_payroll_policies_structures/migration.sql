-- Payroll, phases 1–2: payroll policies, configurable salary components,
-- versioned salary structures and effective-dated salary assignments.
--
-- History is protected by the database, not only by the application:
--   * published policy and structure versions never change (triggers; like
--     CRM history, rows still go when their workspace is removed, and the
--     application never deletes them), and
--     published versions of one policy or structure never overlap (exclusion
--     constraints);
--   * a salary assignment is never edited: a revision closes the current row
--     and adds a new one, and two active assignments of one employee never
--     overlap (exclusion constraint);
--   * a component's calculation settings are fixed once a published
--     structure uses it.
-- Every effective_to is the last day a row applies (inclusive).

-- Effective-date exclusion constraints compare uuids with = inside a GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Payroll policies ────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_payroll_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "policy_code" VARCHAR(64) NOT NULL,
    "policy_name" VARCHAR(160) NOT NULL,
    "policy_description" VARCHAR(1000),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "policy_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_payroll_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_payroll_policies_status" CHECK ("policy_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_payroll_policies_archived" CHECK (("policy_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_payroll_policies_code" CHECK ("policy_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "ck_payroll_policies_default_active" CHECK (NOT "is_default" OR "policy_status" = 'ACTIVE')
);

CREATE UNIQUE INDEX "uq_payroll_policies_tenant_id" ON "rndtechnosoft_payroll_policies"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_payroll_policies_code" ON "rndtechnosoft_payroll_policies"("tenant_id", "policy_code");
-- One default policy per workspace.
CREATE UNIQUE INDEX "uq_payroll_policies_default" ON "rndtechnosoft_payroll_policies"("tenant_id") WHERE "is_default";

ALTER TABLE "rndtechnosoft_payroll_policies" ADD CONSTRAINT "fk_payroll_policies_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policies" ADD CONSTRAINT "fk_payroll_policies_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_payroll_policy_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payroll_policy_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "policy_config" JSONB NOT NULL,
    "change_note" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_payroll_policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_payroll_policy_versions_status" CHECK ("version_status" IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT "ck_payroll_policy_versions_published" CHECK (("version_status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "ck_payroll_policy_versions_number" CHECK ("version_number" >= 1),
    CONSTRAINT "ck_payroll_policy_versions_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "ck_payroll_policy_versions_config" CHECK (jsonb_typeof("policy_config") = 'object'),
    CONSTRAINT "ex_payroll_policy_versions_overlap" EXCLUDE USING gist (
        "tenant_id" WITH =, "payroll_policy_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&
    ) WHERE ("version_status" = 'PUBLISHED')
);

CREATE UNIQUE INDEX "uq_payroll_policy_versions_tenant_id" ON "rndtechnosoft_payroll_policy_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_payroll_policy_versions_number" ON "rndtechnosoft_payroll_policy_versions"("tenant_id", "payroll_policy_id", "version_number");
-- At most one draft being edited per policy.
CREATE UNIQUE INDEX "uq_payroll_policy_versions_draft" ON "rndtechnosoft_payroll_policy_versions"("tenant_id", "payroll_policy_id") WHERE "version_status" = 'DRAFT';

ALTER TABLE "rndtechnosoft_payroll_policy_versions" ADD CONSTRAINT "fk_payroll_policy_versions_policy" FOREIGN KEY ("tenant_id", "payroll_policy_id") REFERENCES "rndtechnosoft_payroll_policies"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policy_versions" ADD CONSTRAINT "fk_payroll_policy_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_payroll_policy_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payroll_policy_id" UUID NOT NULL,
    "department_id" UUID,
    "branch_id" UUID,
    "employment_type_id" UUID,
    "designation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_payroll_policy_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_payroll_policy_scopes_one_target" CHECK (num_nonnulls("department_id", "branch_id", "employment_type_id", "designation_id") = 1)
);

CREATE INDEX "ix_payroll_policy_scopes_policy" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "payroll_policy_id");
CREATE UNIQUE INDEX "uq_payroll_policy_scopes_tenant_id" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "id");
-- Each target at most once per policy.
CREATE UNIQUE INDEX "uq_payroll_policy_scopes_department" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "payroll_policy_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_payroll_policy_scopes_branch" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "payroll_policy_id", "branch_id") WHERE "branch_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_payroll_policy_scopes_employment_type" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "payroll_policy_id", "employment_type_id") WHERE "employment_type_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_payroll_policy_scopes_designation" ON "rndtechnosoft_payroll_policy_scopes"("tenant_id", "payroll_policy_id", "designation_id") WHERE "designation_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_payroll_policy_scopes" ADD CONSTRAINT "fk_payroll_policy_scopes_policy" FOREIGN KEY ("tenant_id", "payroll_policy_id") REFERENCES "rndtechnosoft_payroll_policies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policy_scopes" ADD CONSTRAINT "fk_payroll_policy_scopes_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policy_scopes" ADD CONSTRAINT "fk_payroll_policy_scopes_branch" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "rndtechnosoft_branches"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policy_scopes" ADD CONSTRAINT "fk_payroll_policy_scopes_employment_type" FOREIGN KEY ("tenant_id", "employment_type_id") REFERENCES "rndtechnosoft_employment_types"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_payroll_policy_scopes" ADD CONSTRAINT "fk_payroll_policy_scopes_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Salary components ───────────────────────────────────────────────────────

ALTER TABLE "rndtechnosoft_salary_components" ADD COLUMN "component_description" VARCHAR(500),
ADD COLUMN "include_in_ctc" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "include_in_gross" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "is_prorated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "is_statutory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "max_amount" DECIMAL(18,2),
ADD COLUMN "min_amount" DECIMAL(18,2),
ADD COLUMN "rounding_mode" VARCHAR(16) NOT NULL DEFAULT 'HALF_UP',
ADD COLUMN "system_rule" VARCHAR(32),
ALTER COLUMN "component_category" SET DATA TYPE VARCHAR(32);

-- The old STATUTORY category becomes a deduction marked statutory. The old
-- SYSTEM_CALCULATED type never said what calculated it, so those components
-- become MANUAL (amounts entered per period) until someone chooses a rule.
UPDATE "rndtechnosoft_salary_components" SET "component_category" = 'DEDUCTION', "is_statutory" = true WHERE "component_category" = 'STATUTORY';
UPDATE "rndtechnosoft_salary_components" SET "calculation_type" = 'MANUAL' WHERE "calculation_type" = 'SYSTEM_CALCULATED';
-- Only earnings are counted in gross; the old calculation prorated every
-- structure line, which stays true for earnings only.
UPDATE "rndtechnosoft_salary_components" SET "include_in_gross" = false, "is_prorated" = false WHERE "component_category" <> 'EARNING';

ALTER TABLE "rndtechnosoft_salary_components"
  ADD CONSTRAINT "ck_salary_components_category" CHECK ("component_category" IN ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION')),
  ADD CONSTRAINT "ck_salary_components_calculation" CHECK ("calculation_type" IN ('FIXED', 'PERCENTAGE', 'FORMULA', 'MANUAL', 'SYSTEM_CALCULATED')),
  ADD CONSTRAINT "ck_salary_components_system_rule" CHECK (
    ("calculation_type" = 'SYSTEM_CALCULATED') = ("system_rule" IS NOT NULL)
    AND ("system_rule" IS NULL OR "system_rule" IN ('OVERTIME', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'LOAN_RECOVERY', 'ARREARS'))
  ),
  ADD CONSTRAINT "ck_salary_components_gross" CHECK (NOT "include_in_gross" OR "component_category" = 'EARNING'),
  ADD CONSTRAINT "ck_salary_components_rounding" CHECK ("rounding_mode" IN ('HALF_UP', 'UP', 'DOWN') AND "rounding_scale" BETWEEN 0 AND 4),
  ADD CONSTRAINT "ck_salary_components_limits" CHECK (
    ("min_amount" IS NULL OR "min_amount" >= 0) AND ("max_amount" IS NULL OR "max_amount" >= 0)
    AND ("min_amount" IS NULL OR "max_amount" IS NULL OR "min_amount" <= "max_amount")
  ),
  ADD CONSTRAINT "ck_salary_components_status" CHECK ("component_status" IN ('ACTIVE', 'ARCHIVED'));

-- ── Salary structures, now versioned ────────────────────────────────────────

CREATE TABLE "rndtechnosoft_salary_structure_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salary_structure_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "change_note" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_salary_structure_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_salary_structure_versions_status" CHECK ("version_status" IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT "ck_salary_structure_versions_published" CHECK (("version_status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "ck_salary_structure_versions_number" CHECK ("version_number" >= 1),
    CONSTRAINT "ck_salary_structure_versions_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "ex_salary_structure_versions_overlap" EXCLUDE USING gist (
        "tenant_id" WITH =, "salary_structure_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&
    ) WHERE ("version_status" = 'PUBLISHED')
);

CREATE UNIQUE INDEX "uq_salary_structure_versions_tenant_id" ON "rndtechnosoft_salary_structure_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_salary_structure_versions_number" ON "rndtechnosoft_salary_structure_versions"("tenant_id", "salary_structure_id", "version_number");
CREATE UNIQUE INDEX "uq_salary_structure_versions_draft" ON "rndtechnosoft_salary_structure_versions"("tenant_id", "salary_structure_id") WHERE "version_status" = 'DRAFT';

ALTER TABLE "rndtechnosoft_salary_structure_versions" ADD CONSTRAINT "fk_salary_structure_versions_structure" FOREIGN KEY ("tenant_id", "salary_structure_id") REFERENCES "rndtechnosoft_salary_structures"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_structure_versions" ADD CONSTRAINT "fk_salary_structure_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Each existing structure becomes its own published version 1, with its dates.
INSERT INTO "rndtechnosoft_salary_structure_versions" ("id", "tenant_id", "salary_structure_id", "version_number", "version_status", "effective_from", "effective_to", "change_note", "published_at", "created_at", "updated_at")
SELECT gen_random_uuid(), s."tenant_id", s."id", 1, 'PUBLISHED', s."effective_from", s."effective_to", 'Created before structures had versions', s."created_at", s."created_at", s."created_at"
FROM "rndtechnosoft_salary_structures" s;

ALTER TABLE "rndtechnosoft_salary_structure_components" ADD COLUMN "formula_expression" VARCHAR(1000),
ADD COLUMN "percentage_base_variable" VARCHAR(32),
ADD COLUMN "salary_structure_version_id" UUID;

UPDATE "rndtechnosoft_salary_structure_components" sc
SET "salary_structure_version_id" = v."id"
FROM "rndtechnosoft_salary_structure_versions" v
WHERE v."tenant_id" = sc."tenant_id" AND v."salary_structure_id" = sc."salary_structure_id";

-- The old calculation took a percentage with no base of the monthly salary.
UPDATE "rndtechnosoft_salary_structure_components" sc
SET "percentage_base_variable" = 'MONTHLY_SALARY'
FROM "rndtechnosoft_salary_components" c
WHERE c."tenant_id" = sc."tenant_id" AND c."id" = sc."salary_component_id"
  AND c."calculation_type" = 'PERCENTAGE' AND sc."percentage_base_component_id" IS NULL;

ALTER TABLE "rndtechnosoft_salary_structure_components" ALTER COLUMN "salary_structure_version_id" SET NOT NULL;
-- Databases built from the schema hold these as plain indexes, others as
-- constraints: drop whichever is there.
ALTER TABLE "rndtechnosoft_salary_structure_components" DROP CONSTRAINT IF EXISTS "uq_salary_structure_components_1";
DROP INDEX IF EXISTS "uq_salary_structure_components_1";
ALTER TABLE "rndtechnosoft_salary_structure_components" DROP CONSTRAINT IF EXISTS "fk_salary_structure_components_1";
ALTER TABLE "rndtechnosoft_salary_structure_components" DROP COLUMN "salary_structure_id";
CREATE UNIQUE INDEX "uq_salary_structure_components_1" ON "rndtechnosoft_salary_structure_components"("tenant_id", "salary_structure_version_id", "salary_component_id");
ALTER TABLE "rndtechnosoft_salary_structure_components" ADD CONSTRAINT "fk_salary_structure_components_version" FOREIGN KEY ("tenant_id", "salary_structure_version_id") REFERENCES "rndtechnosoft_salary_structure_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_salary_structure_components"
  ADD CONSTRAINT "ck_salary_structure_components_base" CHECK (num_nonnulls("percentage_base_component_id", "percentage_base_variable") <= 1),
  ADD CONSTRAINT "ck_salary_structure_components_amounts" CHECK (
    ("default_amount" IS NULL OR "default_amount" >= 0) AND ("default_percentage" IS NULL OR "default_percentage" BETWEEN 0 AND 1000)
  );

ALTER TABLE "rndtechnosoft_salary_structures" DROP COLUMN "effective_from",
DROP COLUMN "effective_to";
ALTER TABLE "rndtechnosoft_salary_structures"
  ADD CONSTRAINT "ck_salary_structures_status" CHECK ("structure_status" IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT "ck_salary_structures_frequency" CHECK ("pay_frequency" = 'MONTHLY');

-- ── Employee salary assignments ─────────────────────────────────────────────

ALTER TABLE "rndtechnosoft_employee_salary_assignments" ADD COLUMN "base_rate" DECIMAL(18,4),
ADD COLUMN "cancellation_reason" VARCHAR(500),
ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN "cancelled_by_tenant_member_id" UUID,
ADD COLUMN "created_by_tenant_member_id" UUID,
ADD COLUMN "is_overtime_eligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pay_basis" VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "payment_method" VARCHAR(16) NOT NULL DEFAULT 'BANK_TRANSFER',
ADD COLUMN "payroll_policy_id" UUID;

-- The old assignment code closed the previous row on the new row's first day,
-- so the two overlapped by a day. Close each on the day before the next.
WITH ordered AS (
  SELECT "id", LEAD("effective_from") OVER (PARTITION BY "tenant_id", "employee_id" ORDER BY "effective_from", "created_at") AS next_from
  FROM "rndtechnosoft_employee_salary_assignments"
)
UPDATE "rndtechnosoft_employee_salary_assignments" a
SET "effective_to" = o.next_from - 1
FROM ordered o
WHERE a."id" = o."id" AND o.next_from IS NOT NULL AND (a."effective_to" IS NULL OR a."effective_to" >= o.next_from);

-- An assignment replaced on the day it started never applied: it is kept, cancelled.
UPDATE "rndtechnosoft_employee_salary_assignments"
SET "assignment_status" = 'CANCELLED', "effective_to" = "effective_from", "cancelled_at" = CURRENT_TIMESTAMP(6),
    "cancellation_reason" = 'Replaced on the day it started (corrected when assignments became effective-dated)'
WHERE "effective_to" < "effective_from";

ALTER TABLE "rndtechnosoft_employee_salary_assignments"
  ADD CONSTRAINT "ck_employee_salary_assignments_status" CHECK ("assignment_status" IN ('ACTIVE', 'CANCELLED')),
  ADD CONSTRAINT "ck_employee_salary_assignments_cancelled" CHECK (("assignment_status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
  ADD CONSTRAINT "ck_employee_salary_assignments_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  ADD CONSTRAINT "ck_employee_salary_assignments_basis" CHECK ("pay_basis" IN ('MONTHLY', 'DAILY', 'HOURLY')),
  -- People paid by the day or hour need their rate. (A monthly salary is
  -- required by the application: rows from before this change may lack it.)
  ADD CONSTRAINT "ck_employee_salary_assignments_rate" CHECK ("pay_basis" = 'MONTHLY' OR "base_rate" IS NOT NULL),
  ADD CONSTRAINT "ck_employee_salary_assignments_amounts" CHECK (
    ("annual_ctc" IS NULL OR "annual_ctc" >= 0) AND ("monthly_gross_target" IS NULL OR "monthly_gross_target" >= 0) AND ("base_rate" IS NULL OR "base_rate" > 0)
  ),
  ADD CONSTRAINT "ck_employee_salary_assignments_payment" CHECK ("payment_method" IN ('BANK_TRANSFER', 'CASH', 'CHEQUE')),
  ADD CONSTRAINT "ex_employee_salary_assignments_overlap" EXCLUDE USING gist (
    "tenant_id" WITH =, "employee_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&
  ) WHERE ("assignment_status" = 'ACTIVE');

ALTER TABLE "rndtechnosoft_employee_salary_assignments" ADD CONSTRAINT "fk_employee_salary_assignments_policy" FOREIGN KEY ("tenant_id", "payroll_policy_id") REFERENCES "rndtechnosoft_payroll_policies"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_salary_assignments" ADD CONSTRAINT "fk_employee_salary_assignments_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_salary_assignments" ADD CONSTRAINT "fk_employee_salary_assignments_cancelled_by" FOREIGN KEY ("tenant_id", "cancelled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

DROP INDEX IF EXISTS "ix_employee_salary_component_values_1";
CREATE UNIQUE INDEX "uq_employee_salary_component_values_1" ON "rndtechnosoft_employee_salary_component_values"("tenant_id", "employee_salary_assignment_id", "salary_component_id");
ALTER TABLE "rndtechnosoft_employee_salary_component_values"
  ADD CONSTRAINT "ck_employee_salary_component_values_amounts" CHECK (
    ("amount" IS NULL OR "amount" >= 0) AND ("percentage" IS NULL OR "percentage" BETWEEN 0 AND 1000)
  );

-- ── History guards ──────────────────────────────────────────────────────────

-- A published version is fixed. The one change allowed is closing it: setting
-- its last day once, when a later version is published.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_version()
RETURNS trigger AS $$
BEGIN
  IF OLD.version_status = 'PUBLISHED' AND (
       (OLD.effective_to IS NOT NULL AND NEW.effective_to IS DISTINCT FROM OLD.effective_to)
    OR (to_jsonb(NEW) - ARRAY['effective_to', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['effective_to', 'updated_at'])
  ) THEN
    RAISE EXCEPTION 'A published version cannot be changed (%).', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_payroll_policy_versions_published
  BEFORE UPDATE ON "rndtechnosoft_payroll_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_version();

CREATE TRIGGER trg_rndtechnosoft_salary_structure_versions_published
  BEFORE UPDATE ON "rndtechnosoft_salary_structure_versions"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_version();

-- A published structure version's components are fixed too: none added or changed.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_structure_lines()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM "rndtechnosoft_salary_structure_versions" v
    WHERE v."tenant_id" = OLD."tenant_id" AND v."id" = OLD."salary_structure_version_id" AND v."version_status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'The components of a published salary structure version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "rndtechnosoft_salary_structure_versions" v
    WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."salary_structure_version_id" AND v."version_status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'The components of a published salary structure version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_salary_structure_components_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_salary_structure_components"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_structure_lines();

-- Once a published structure uses a component, how it is calculated is fixed:
-- a different calculation is a new component. Its name, description, payslip
-- display and status can still change.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_used_salary_component()
RETURNS trigger AS $$
BEGIN
  IF (NEW.component_code, NEW.component_category, NEW.calculation_type, NEW.system_rule, NEW.is_statutory, NEW.is_taxable,
      NEW.is_prorated, NEW.include_in_gross, NEW.include_in_ctc, NEW.min_amount, NEW.max_amount, NEW.rounding_scale, NEW.rounding_mode)
     IS DISTINCT FROM
     (OLD.component_code, OLD.component_category, OLD.calculation_type, OLD.system_rule, OLD.is_statutory, OLD.is_taxable,
      OLD.is_prorated, OLD.include_in_gross, OLD.include_in_ctc, OLD.min_amount, OLD.max_amount, OLD.rounding_scale, OLD.rounding_mode)
  AND EXISTS (
    SELECT 1 FROM "rndtechnosoft_salary_structure_components" sc
    JOIN "rndtechnosoft_salary_structure_versions" v ON v."tenant_id" = sc."tenant_id" AND v."id" = sc."salary_structure_version_id"
    WHERE sc."tenant_id" = OLD."tenant_id" AND sc."salary_component_id" = OLD."id" AND v."version_status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'This salary component is used by a published salary structure, so how it is calculated cannot change.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_salary_components_used
  BEFORE UPDATE ON "rndtechnosoft_salary_components"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_used_salary_component();

-- A salary assignment is never edited: it can only be closed (its last day
-- set) or cancelled. A change of salary is a new assignment.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_salary_assignment()
RETURNS trigger AS $$
BEGIN
  IF OLD.assignment_status = 'CANCELLED'
  OR (to_jsonb(NEW) - ARRAY['effective_to', 'assignment_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['effective_to', 'assignment_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
  THEN
    RAISE EXCEPTION 'A salary assignment cannot be edited; record a salary revision instead.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_employee_salary_assignments_history
  BEFORE UPDATE ON "rndtechnosoft_employee_salary_assignments"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_salary_assignment();

CREATE OR REPLACE FUNCTION rndtechnosoft_reject_salary_value_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'An employee''s salary component values cannot be edited; record a salary revision instead.' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_employee_salary_component_values_history
  BEFORE UPDATE ON "rndtechnosoft_employee_salary_component_values"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_reject_salary_value_update();

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'payroll.policies.view', 'FINANCE', 'View payroll policies'),
  (gen_random_uuid(), 'payroll.policies.manage', 'FINANCE', 'Create payroll policies and publish new versions of their rules')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('payroll.policies.view', 'payroll.policies.manage')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
