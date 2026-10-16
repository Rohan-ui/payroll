-- Performance (KRA & KPI), phase 3: who reviews whom.
--
--   * Reporting lines become proper history: a change of manager closes the
--     current line and adds a new one, a mistaken line is cancelled rather
--     than deleted, and an employee never has two primary managers at once
--     (exclusion constraint) or reports to themselves.
--   * Review workflows: versioned like templates. A version's stages say who
--     reviews (from reporting lines, department heads, chosen members, a
--     role, nominations or manual assignment), how many, in what order or
--     side by side, what they may do, how their ratings combine, deadlines
--     and who sees what. The database refuses changes to a published version.

-- ── Reporting lines ─────────────────────────────────────────────────────────

ALTER TABLE "rndtechnosoft_employee_reporting_lines"
  ADD COLUMN "line_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "change_reason" VARCHAR(500),
  ADD COLUMN "created_by_tenant_member_id" UUID,
  ADD COLUMN "cancelled_by_tenant_member_id" UUID,
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_reason" VARCHAR(500);

-- Existing lines must already follow the rules; this stops with a clear
-- message rather than altering anyone's history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rndtechnosoft_employee_reporting_lines" WHERE "manager_employee_id" = "employee_id") THEN
    RAISE EXCEPTION 'Some employees are recorded as reporting to themselves. Correct those reporting lines before running this migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "rndtechnosoft_employee_reporting_lines" WHERE "effective_to" < "effective_from") THEN
    RAISE EXCEPTION 'Some reporting lines end before they start. Correct them before running this migration.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "rndtechnosoft_employee_reporting_lines" a
    JOIN "rndtechnosoft_employee_reporting_lines" b
      ON a."tenant_id" = b."tenant_id" AND a."employee_id" = b."employee_id" AND a."id" < b."id"
     AND a."relationship_type" = 'PRIMARY' AND b."relationship_type" = 'PRIMARY'
     AND daterange(a."effective_from", a."effective_to", '[]') && daterange(b."effective_from", b."effective_to", '[]')
  ) THEN
    RAISE EXCEPTION 'Some employees have overlapping primary reporting managers. Close one line of each overlapping pair before running this migration.';
  END IF;
END $$;

ALTER TABLE "rndtechnosoft_employee_reporting_lines"
  ADD CONSTRAINT "ck_employee_reporting_lines_status" CHECK ("line_status" IN ('ACTIVE', 'CANCELLED')),
  ADD CONSTRAINT "ck_employee_reporting_lines_cancelled" CHECK (("line_status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
  ADD CONSTRAINT "ck_employee_reporting_lines_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  ADD CONSTRAINT "ck_employee_reporting_lines_not_self" CHECK ("manager_employee_id" <> "employee_id"),
  ADD CONSTRAINT "ex_employee_reporting_lines_primary_overlap" EXCLUDE USING gist (
    "tenant_id" WITH =, "employee_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&
  ) WHERE ("relationship_type" = 'PRIMARY' AND "line_status" = 'ACTIVE');

ALTER TABLE "rndtechnosoft_employee_reporting_lines" ADD CONSTRAINT "fk_employee_reporting_lines_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_reporting_lines" ADD CONSTRAINT "fk_employee_reporting_lines_cancelled_by" FOREIGN KEY ("tenant_id", "cancelled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A line's employee, manager, kind and start never change: only its last
-- day (when it ends or the next manager starts) and a cancellation.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_reporting_line()
RETURNS trigger AS $$
BEGIN
  IF OLD.line_status = 'CANCELLED'
  OR (to_jsonb(NEW) - ARRAY['effective_to', 'line_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['effective_to', 'line_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
  THEN
    RAISE EXCEPTION 'A reporting line cannot be edited; set a new manager from a date instead.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_employee_reporting_lines_history
  BEFORE UPDATE ON "rndtechnosoft_employee_reporting_lines"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_reporting_line();

-- ── Workflows ───────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_workflows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_code" VARCHAR(64) NOT NULL,
    "workflow_name" VARCHAR(160) NOT NULL,
    "workflow_description" VARCHAR(1000),
    "applies_to_all" BOOLEAN NOT NULL DEFAULT true,
    "workflow_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_workflows_status" CHECK ("workflow_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_performance_workflows_archived" CHECK (("workflow_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_workflows_code" CHECK ("workflow_code" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE UNIQUE INDEX "uq_performance_workflows_tenant_id" ON "rndtechnosoft_performance_workflows"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_workflows_code" ON "rndtechnosoft_performance_workflows"("tenant_id", "workflow_code");
CREATE INDEX "ix_performance_workflows_status" ON "rndtechnosoft_performance_workflows"("tenant_id", "workflow_status", "workflow_name");

ALTER TABLE "rndtechnosoft_performance_workflows" ADD CONSTRAINT "fk_performance_workflows_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflows" ADD CONSTRAINT "fk_performance_workflows_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_performance_workflow_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflow_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_workflow_scopes_one_target" CHECK (num_nonnulls("department_id", "designation_id") = 1)
);

CREATE UNIQUE INDEX "uq_performance_workflow_scopes_tenant_id" ON "rndtechnosoft_performance_workflow_scopes"("tenant_id", "id");
CREATE INDEX "ix_performance_workflow_scopes_workflow" ON "rndtechnosoft_performance_workflow_scopes"("tenant_id", "workflow_id");
CREATE UNIQUE INDEX "uq_performance_workflow_scopes_department" ON "rndtechnosoft_performance_workflow_scopes"("tenant_id", "workflow_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_workflow_scopes_designation" ON "rndtechnosoft_performance_workflow_scopes"("tenant_id", "workflow_id", "designation_id") WHERE "designation_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_performance_workflow_scopes" ADD CONSTRAINT "fk_performance_workflow_scopes_workflow" FOREIGN KEY ("tenant_id", "workflow_id") REFERENCES "rndtechnosoft_performance_workflows"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_scopes" ADD CONSTRAINT "fk_performance_workflow_scopes_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_scopes" ADD CONSTRAINT "fk_performance_workflow_scopes_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_performance_workflow_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    -- AT_LAUNCH: every stage's reviewers are fixed when the appraisal starts.
    -- AT_STAGE_START: each stage's reviewers are found when that stage opens.
    "reviewer_resolution" VARCHAR(16) NOT NULL DEFAULT 'AT_LAUNCH',
    -- Whether someone reviewing in an earlier stage may review again in a later one.
    "allows_repeat_reviewers" BOOLEAN NOT NULL DEFAULT false,
    "change_note" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflow_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_workflow_versions_status" CHECK ("version_status" IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT "ck_performance_workflow_versions_published" CHECK (("version_status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_workflow_versions_number" CHECK ("version_number" >= 1),
    CONSTRAINT "ck_performance_workflow_versions_resolution" CHECK ("reviewer_resolution" IN ('AT_LAUNCH', 'AT_STAGE_START'))
);

CREATE UNIQUE INDEX "uq_performance_workflow_versions_tenant_id" ON "rndtechnosoft_performance_workflow_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_workflow_versions_number" ON "rndtechnosoft_performance_workflow_versions"("tenant_id", "workflow_id", "version_number");
CREATE UNIQUE INDEX "uq_performance_workflow_versions_draft" ON "rndtechnosoft_performance_workflow_versions"("tenant_id", "workflow_id") WHERE "version_status" = 'DRAFT';

ALTER TABLE "rndtechnosoft_performance_workflow_versions" ADD CONSTRAINT "fk_performance_workflow_versions_workflow" FOREIGN KEY ("tenant_id", "workflow_id") REFERENCES "rndtechnosoft_performance_workflows"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_versions" ADD CONSTRAINT "fk_performance_workflow_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- One stage of a version. Stages with the same step run side by side; steps
-- run in order. Checked in full by performance/workflow/workflow-definition.ts.
CREATE TABLE "rndtechnosoft_performance_workflow_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "stage_key" VARCHAR(40) NOT NULL,
    "stage_name" VARCHAR(120) NOT NULL,
    "step_number" INTEGER NOT NULL,
    "reviewer_source" VARCHAR(24) NOT NULL,
    -- EACH: everyone found reviews. POOL: anyone found may take it, until enough have.
    "assignment_mode" VARCHAR(8) NOT NULL DEFAULT 'EACH',
    -- RATE: rates and comments. REVIEW: comments and may return, scores unchanged. APPROVE: final approval.
    "stage_action" VARCHAR(8) NOT NULL DEFAULT 'RATE',
    "min_reviewers" INTEGER NOT NULL DEFAULT 1,
    "max_reviewers" INTEGER NOT NULL DEFAULT 1,
    "completion_rule" VARCHAR(12) NOT NULL DEFAULT 'ALL',
    "min_completed" INTEGER,
    "aggregation" VARCHAR(16) NOT NULL DEFAULT 'AVERAGE',
    "score_weight_percent" DECIMAL(7,4),
    "rated_scope" VARCHAR(16) NOT NULL DEFAULT 'ALL',
    "reviewer_role_id" UUID,
    "nominated_by" VARCHAR(12),
    "nomination_needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "allows_decline" BOOLEAN NOT NULL DEFAULT false,
    "allows_replacement" BOOLEAN NOT NULL DEFAULT true,
    "return_rule" VARCHAR(16) NOT NULL DEFAULT 'NONE',
    "due_days" INTEGER NOT NULL DEFAULT 14,
    "reminder_days" INTEGER[] NOT NULL DEFAULT '{}',
    "escalate_after_days" INTEGER,
    "escalate_to" VARCHAR(16) NOT NULL DEFAULT 'NONE',
    "escalation_role_id" UUID,
    "employee_sees" VARCHAR(32) NOT NULL DEFAULT 'INDIVIDUAL_AFTER_FINALIZATION',
    "reviewer_identity" VARCHAR(24) NOT NULL DEFAULT 'VISIBLE',
    "later_stages_see" VARCHAR(12) NOT NULL DEFAULT 'INDIVIDUAL',
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflow_stages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_workflow_stages_key" CHECK ("stage_key" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "ck_performance_workflow_stages_step" CHECK ("step_number" BETWEEN 1 AND 20),
    CONSTRAINT "ck_performance_workflow_stages_source" CHECK ("reviewer_source" IN (
        'SELF', 'REPORTING_MANAGER', 'SKIP_LEVEL_MANAGER', 'DEPARTMENT_HEAD', 'DIRECT_REPORTS', 'SPECIFIC_MEMBERS', 'ROLE_MEMBERS', 'NOMINATED', 'MANUAL'
    )),
    CONSTRAINT "ck_performance_workflow_stages_mode" CHECK ("assignment_mode" IN ('EACH', 'POOL')),
    CONSTRAINT "ck_performance_workflow_stages_action" CHECK ("stage_action" IN ('RATE', 'REVIEW', 'APPROVE')),
    CONSTRAINT "ck_performance_workflow_stages_counts" CHECK ("min_reviewers" >= 1 AND "max_reviewers" >= "min_reviewers" AND "max_reviewers" <= 50),
    CONSTRAINT "ck_performance_workflow_stages_completion" CHECK (
        ("completion_rule" = 'ALL' AND "min_completed" IS NULL)
        OR ("completion_rule" = 'AT_LEAST' AND "min_completed" BETWEEN 1 AND "max_reviewers")
    ),
    CONSTRAINT "ck_performance_workflow_stages_aggregation" CHECK ("aggregation" IN ('AVERAGE', 'MEDIAN', 'LEAD_REVIEWER')),
    CONSTRAINT "ck_performance_workflow_stages_weight" CHECK (
        "score_weight_percent" IS NULL OR ("stage_action" = 'RATE' AND "score_weight_percent" > 0 AND "score_weight_percent" <= 100)
    ),
    CONSTRAINT "ck_performance_workflow_stages_scope" CHECK ("rated_scope" IN ('ALL', 'SELECTED_KRAS', 'QUESTIONS_ONLY')),
    CONSTRAINT "ck_performance_workflow_stages_role" CHECK (("reviewer_source" = 'ROLE_MEMBERS') = ("reviewer_role_id" IS NOT NULL)),
    CONSTRAINT "ck_performance_workflow_stages_nomination" CHECK (
        ("reviewer_source" = 'NOMINATED') = ("nominated_by" IS NOT NULL) AND ("nominated_by" IS NULL OR "nominated_by" IN ('EMPLOYEE', 'MANAGER', 'ADMIN'))
    ),
    CONSTRAINT "ck_performance_workflow_stages_return" CHECK ("return_rule" IN ('NONE', 'PREVIOUS_STEP', 'SELF_ASSESSMENT', 'ANY_EARLIER')),
    CONSTRAINT "ck_performance_workflow_stages_due" CHECK ("due_days" BETWEEN 1 AND 365),
    CONSTRAINT "ck_performance_workflow_stages_escalation" CHECK (
        "escalate_to" IN ('NONE', 'DEPARTMENT_HEAD', 'ROLE')
        AND (("escalate_to" = 'NONE') = ("escalate_after_days" IS NULL))
        AND ("escalate_after_days" IS NULL OR "escalate_after_days" BETWEEN 1 AND 90)
        AND (("escalate_to" = 'ROLE') = ("escalation_role_id" IS NOT NULL))
    ),
    CONSTRAINT "ck_performance_workflow_stages_employee_sees" CHECK ("employee_sees" IN (
        'NOTHING', 'AGGREGATE_AFTER_FINALIZATION', 'INDIVIDUAL_AFTER_FINALIZATION', 'INDIVIDUAL_AFTER_STAGE'
    )),
    CONSTRAINT "ck_performance_workflow_stages_identity" CHECK ("reviewer_identity" IN ('VISIBLE', 'HIDDEN_FROM_EMPLOYEE')),
    CONSTRAINT "ck_performance_workflow_stages_later" CHECK ("later_stages_see" IN ('INDIVIDUAL', 'AGGREGATE', 'NOTHING'))
);

CREATE UNIQUE INDEX "uq_performance_workflow_stages_tenant_id" ON "rndtechnosoft_performance_workflow_stages"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_workflow_stages_key" ON "rndtechnosoft_performance_workflow_stages"("tenant_id", "workflow_version_id", "stage_key");

ALTER TABLE "rndtechnosoft_performance_workflow_stages" ADD CONSTRAINT "fk_performance_workflow_stages_version" FOREIGN KEY ("tenant_id", "workflow_version_id") REFERENCES "rndtechnosoft_performance_workflow_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_stages" ADD CONSTRAINT "fk_performance_workflow_stages_role" FOREIGN KEY ("tenant_id", "reviewer_role_id") REFERENCES "rndtechnosoft_roles"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_stages" ADD CONSTRAINT "fk_performance_workflow_stages_escalation_role" FOREIGN KEY ("tenant_id", "escalation_role_id") REFERENCES "rndtechnosoft_roles"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- The workspace members a SPECIFIC_MEMBERS stage names.
CREATE TABLE "rndtechnosoft_performance_workflow_stage_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_stage_id" UUID NOT NULL,
    "tenant_member_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflow_stage_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_performance_workflow_stage_members_tenant_id" ON "rndtechnosoft_performance_workflow_stage_members"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_workflow_stage_members_pair" ON "rndtechnosoft_performance_workflow_stage_members"("tenant_id", "workflow_stage_id", "tenant_member_id");

ALTER TABLE "rndtechnosoft_performance_workflow_stage_members" ADD CONSTRAINT "fk_performance_workflow_stage_members_stage" FOREIGN KEY ("tenant_id", "workflow_stage_id") REFERENCES "rndtechnosoft_performance_workflow_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_stage_members" ADD CONSTRAINT "fk_performance_workflow_stage_members_member" FOREIGN KEY ("tenant_id", "tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- The KRAs a SELECTED_KRAS stage rates (others it does not see to rate).
CREATE TABLE "rndtechnosoft_performance_workflow_stage_kras" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_stage_id" UUID NOT NULL,
    "kra_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_workflow_stage_kras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_performance_workflow_stage_kras_tenant_id" ON "rndtechnosoft_performance_workflow_stage_kras"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_workflow_stage_kras_pair" ON "rndtechnosoft_performance_workflow_stage_kras"("tenant_id", "workflow_stage_id", "kra_id");

ALTER TABLE "rndtechnosoft_performance_workflow_stage_kras" ADD CONSTRAINT "fk_performance_workflow_stage_kras_stage" FOREIGN KEY ("tenant_id", "workflow_stage_id") REFERENCES "rndtechnosoft_performance_workflow_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_workflow_stage_kras" ADD CONSTRAINT "fk_performance_workflow_stage_kras_kra" FOREIGN KEY ("tenant_id", "kra_id") REFERENCES "rndtechnosoft_performance_kras"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── History guards ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_workflow_version()
RETURNS trigger AS $$
BEGIN
  IF OLD.version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'A published review workflow version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_workflow_versions_published
  BEFORE UPDATE ON "rndtechnosoft_performance_workflow_versions"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_workflow_version();

CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_workflow_stages()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_workflow_versions" v
        WHERE v."tenant_id" = OLD."tenant_id" AND v."id" = OLD."workflow_version_id" AND v."version_status" = 'PUBLISHED'))
  OR EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_workflow_versions" v
        WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."workflow_version_id" AND v."version_status" = 'PUBLISHED')
  THEN
    RAISE EXCEPTION 'The stages of a published review workflow version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_workflow_stages_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_workflow_stages"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_workflow_stages();

-- A stage's members and KRAs belong to its version through the stage.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_workflow_stage_rows()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_workflow_stages" s
        JOIN "rndtechnosoft_performance_workflow_versions" v ON v."tenant_id" = s."tenant_id" AND v."id" = s."workflow_version_id"
        WHERE s."tenant_id" = OLD."tenant_id" AND s."id" = OLD."workflow_stage_id" AND v."version_status" = 'PUBLISHED'))
  OR EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_workflow_stages" s
        JOIN "rndtechnosoft_performance_workflow_versions" v ON v."tenant_id" = s."tenant_id" AND v."id" = s."workflow_version_id"
        WHERE s."tenant_id" = NEW."tenant_id" AND s."id" = NEW."workflow_stage_id" AND v."version_status" = 'PUBLISHED')
  THEN
    RAISE EXCEPTION 'The stages of a published review workflow version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_workflow_stage_members_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_workflow_stage_members"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_workflow_stage_rows();

CREATE TRIGGER trg_rndtechnosoft_performance_workflow_stage_kras_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_workflow_stage_kras"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_workflow_stage_rows();

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'performance.library.view', 'HRMS', 'View KRAs, KPIs, rating scales, appraisal templates, review workflows and department heads'),
  (gen_random_uuid(), 'performance.workflows.manage', 'HRMS', 'Create review workflows: who reviews whom, how many, in what order, and publish them'),
  (gen_random_uuid(), 'people.login.manage', 'HRMS', 'Link employees to their sign-in accounts')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('performance.workflows.manage', 'people.login.manage')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
