-- Performance (KRA & KPI), phase 4: appraisal cycles, appraisals and reviews.
--
--   * A cycle names a period, who is eligible, and the templates and
--     workflows employees may get. Launching it creates one appraisal per
--     eligible employee, never two in one cycle.
--   * An appraisal keeps the exact template and workflow versions it started
--     with; those versions can no longer be deleted.
--   * Each stage of an appraisal has its reviewer assignments. A reviewer is
--     never counted twice in a stage, the appraised employee can never review
--     outside their own self-assessment, and nothing is deleted: declined,
--     replaced and sent-back assignments stay as history.
--   * A submitted review, its answers and its evidence never change.

-- ── Cycles ──────────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_code" VARCHAR(64) NOT NULL,
    "cycle_name" VARCHAR(160) NOT NULL,
    "cycle_description" VARCHAR(1000),
    "cycle_kind" VARCHAR(16) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "applies_to_all" BOOLEAN NOT NULL DEFAULT true,
    -- Only employees who joined on or before this date, when set.
    "joined_on_or_before" DATE,
    -- Whether an employee may be in this cycle while in another active cycle whose period overlaps.
    "allows_overlap" BOOLEAN NOT NULL DEFAULT false,
    "cycle_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "launched_at" TIMESTAMPTZ(6),
    "launched_by_tenant_member_id" UUID,
    "created_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_cycles_code" CHECK ("cycle_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "ck_performance_cycles_kind" CHECK ("cycle_kind" IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'PROBATION', 'PROJECT', 'CUSTOM')),
    CONSTRAINT "ck_performance_cycles_period" CHECK ("period_end" >= "period_start"),
    CONSTRAINT "ck_performance_cycles_status" CHECK ("cycle_status" IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    CONSTRAINT "ck_performance_cycles_archived" CHECK (("cycle_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_cycles_launched" CHECK (("cycle_status" = 'DRAFT') = ("launched_at" IS NULL) OR "cycle_status" = 'ARCHIVED')
);

CREATE UNIQUE INDEX "uq_performance_cycles_tenant_id" ON "rndtechnosoft_performance_cycles"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_cycles_code" ON "rndtechnosoft_performance_cycles"("tenant_id", "cycle_code");
CREATE INDEX "ix_performance_cycles_status" ON "rndtechnosoft_performance_cycles"("tenant_id", "cycle_status", "period_start");

ALTER TABLE "rndtechnosoft_performance_cycles" ADD CONSTRAINT "fk_performance_cycles_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycles" ADD CONSTRAINT "fk_performance_cycles_launched_by" FOREIGN KEY ("tenant_id", "launched_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycles" ADD CONSTRAINT "fk_performance_cycles_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_performance_cycle_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_cycle_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_cycle_scopes_one_target" CHECK (num_nonnulls("department_id", "designation_id") = 1)
);

CREATE UNIQUE INDEX "uq_performance_cycle_scopes_tenant_id" ON "rndtechnosoft_performance_cycle_scopes"("tenant_id", "id");
CREATE INDEX "ix_performance_cycle_scopes_cycle" ON "rndtechnosoft_performance_cycle_scopes"("tenant_id", "cycle_id");
CREATE UNIQUE INDEX "uq_performance_cycle_scopes_department" ON "rndtechnosoft_performance_cycle_scopes"("tenant_id", "cycle_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_cycle_scopes_designation" ON "rndtechnosoft_performance_cycle_scopes"("tenant_id", "cycle_id", "designation_id") WHERE "designation_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_performance_cycle_scopes" ADD CONSTRAINT "fk_performance_cycle_scopes_cycle" FOREIGN KEY ("tenant_id", "cycle_id") REFERENCES "rndtechnosoft_performance_cycles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycle_scopes" ADD CONSTRAINT "fk_performance_cycle_scopes_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycle_scopes" ADD CONSTRAINT "fk_performance_cycle_scopes_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- The templates and workflows employees in a cycle may get; each employee gets the one meant for them.
CREATE TABLE "rndtechnosoft_performance_cycle_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_cycle_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_performance_cycle_templates_tenant_id" ON "rndtechnosoft_performance_cycle_templates"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_cycle_templates_pair" ON "rndtechnosoft_performance_cycle_templates"("tenant_id", "cycle_id", "template_id");

ALTER TABLE "rndtechnosoft_performance_cycle_templates" ADD CONSTRAINT "fk_performance_cycle_templates_cycle" FOREIGN KEY ("tenant_id", "cycle_id") REFERENCES "rndtechnosoft_performance_cycles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycle_templates" ADD CONSTRAINT "fk_performance_cycle_templates_template" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "rndtechnosoft_performance_templates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_performance_cycle_workflows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_cycle_workflows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_performance_cycle_workflows_tenant_id" ON "rndtechnosoft_performance_cycle_workflows"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_cycle_workflows_pair" ON "rndtechnosoft_performance_cycle_workflows"("tenant_id", "cycle_id", "workflow_id");

ALTER TABLE "rndtechnosoft_performance_cycle_workflows" ADD CONSTRAINT "fk_performance_cycle_workflows_cycle" FOREIGN KEY ("tenant_id", "cycle_id") REFERENCES "rndtechnosoft_performance_cycles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_cycle_workflows" ADD CONSTRAINT "fk_performance_cycle_workflows_workflow" FOREIGN KEY ("tenant_id", "workflow_id") REFERENCES "rndtechnosoft_performance_workflows"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Appraisals ──────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_appraisals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    -- Where the employee sat when the appraisal started, for reports.
    "department_id" UUID,
    "designation_id" UUID,
    -- IN_PROGRESS: stages under way. REVIEWS_COMPLETE: every stage done, awaiting calibration and finalization.
    "appraisal_status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "current_step" INTEGER,
    "launched_by_tenant_member_id" UUID,
    "launched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "reviews_completed_at" TIMESTAMPTZ(6),
    "cancelled_by_tenant_member_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_appraisals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_appraisals_status" CHECK ("appraisal_status" IN ('IN_PROGRESS', 'REVIEWS_COMPLETE', 'CANCELLED')),
    CONSTRAINT "ck_performance_appraisals_cancelled" CHECK (("appraisal_status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_appraisals_step" CHECK (("appraisal_status" = 'IN_PROGRESS') = ("current_step" IS NOT NULL))
);

CREATE UNIQUE INDEX "uq_performance_appraisals_tenant_id" ON "rndtechnosoft_performance_appraisals"("tenant_id", "id");
-- One appraisal per employee per cycle (a cancelled one may be started again).
CREATE UNIQUE INDEX "uq_performance_appraisals_employee" ON "rndtechnosoft_performance_appraisals"("tenant_id", "cycle_id", "employee_id") WHERE "appraisal_status" <> 'CANCELLED';
CREATE INDEX "ix_performance_appraisals_cycle" ON "rndtechnosoft_performance_appraisals"("tenant_id", "cycle_id", "appraisal_status");
CREATE INDEX "ix_performance_appraisals_employee" ON "rndtechnosoft_performance_appraisals"("tenant_id", "employee_id");

ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_cycle" FOREIGN KEY ("tenant_id", "cycle_id") REFERENCES "rndtechnosoft_performance_cycles"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_template_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_performance_template_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_workflow_version" FOREIGN KEY ("tenant_id", "workflow_version_id") REFERENCES "rndtechnosoft_performance_workflow_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_launched_by" FOREIGN KEY ("tenant_id", "launched_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisals" ADD CONSTRAINT "fk_performance_appraisals_cancelled_by" FOREIGN KEY ("tenant_id", "cancelled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- An appraisal may only use published versions.
CREATE OR REPLACE FUNCTION rndtechnosoft_check_appraisal_versions()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "rndtechnosoft_performance_template_versions" v WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."template_version_id" AND v."version_status" = 'PUBLISHED')
  OR NOT EXISTS (SELECT 1 FROM "rndtechnosoft_performance_workflow_versions" v WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."workflow_version_id" AND v."version_status" = 'PUBLISHED') THEN
    RAISE EXCEPTION 'An appraisal must use a published template and a published workflow.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."template_version_id", NEW."workflow_version_id", NEW."employee_id", NEW."cycle_id") IS DISTINCT FROM (OLD."template_version_id", OLD."workflow_version_id", OLD."employee_id", OLD."cycle_id") THEN
    RAISE EXCEPTION 'An appraisal’s employee, cycle, template and workflow never change.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_appraisals_versions
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_appraisals"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_check_appraisal_versions();

-- Per-employee targets for KPIs the template leaves to each employee.
CREATE TABLE "rndtechnosoft_performance_appraisal_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appraisal_id" UUID NOT NULL,
    "template_kpi_id" UUID NOT NULL,
    "target_value" DECIMAL(18,4),
    "threshold_value" DECIMAL(18,4),
    "stretch_value" DECIMAL(18,4),
    "set_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_appraisal_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_performance_appraisal_targets_tenant_id" ON "rndtechnosoft_performance_appraisal_targets"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_appraisal_targets_line" ON "rndtechnosoft_performance_appraisal_targets"("tenant_id", "appraisal_id", "template_kpi_id");

ALTER TABLE "rndtechnosoft_performance_appraisal_targets" ADD CONSTRAINT "fk_performance_appraisal_targets_appraisal" FOREIGN KEY ("tenant_id", "appraisal_id") REFERENCES "rndtechnosoft_performance_appraisals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisal_targets" ADD CONSTRAINT "fk_performance_appraisal_targets_kpi" FOREIGN KEY ("tenant_id", "template_kpi_id") REFERENCES "rndtechnosoft_performance_template_kpis"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_appraisal_targets" ADD CONSTRAINT "fk_performance_appraisal_targets_set_by" FOREIGN KEY ("tenant_id", "set_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Each stage of an appraisal: WAITING for its step, OPEN, NEEDS_REVIEWERS, or COMPLETE.
CREATE TABLE "rndtechnosoft_performance_appraisal_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appraisal_id" UUID NOT NULL,
    "stage_key" VARCHAR(40) NOT NULL,
    "step_number" INTEGER NOT NULL,
    "stage_status" VARCHAR(20) NOT NULL DEFAULT 'WAITING',
    "opened_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    -- What finding reviewers said, such as why nobody was found.
    "resolution_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_appraisal_stages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_appraisal_stages_status" CHECK ("stage_status" IN ('WAITING', 'OPEN', 'NEEDS_REVIEWERS', 'COMPLETE')),
    CONSTRAINT "ck_performance_appraisal_stages_open" CHECK ("stage_status" = 'WAITING' OR "opened_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "uq_performance_appraisal_stages_tenant_id" ON "rndtechnosoft_performance_appraisal_stages"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_appraisal_stages_key" ON "rndtechnosoft_performance_appraisal_stages"("tenant_id", "appraisal_id", "stage_key");
CREATE INDEX "ix_performance_appraisal_stages_due" ON "rndtechnosoft_performance_appraisal_stages"("tenant_id", "stage_status", "due_date");

ALTER TABLE "rndtechnosoft_performance_appraisal_stages" ADD CONSTRAINT "fk_performance_appraisal_stages_appraisal" FOREIGN KEY ("tenant_id", "appraisal_id") REFERENCES "rndtechnosoft_performance_appraisals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ── Reviewers ───────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_reviewer_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appraisal_id" UUID NOT NULL,
    "appraisal_stage_id" UUID NOT NULL,
    "reviewer_tenant_member_id" UUID NOT NULL,
    "assignment_status" VARCHAR(12) NOT NULL DEFAULT 'ASSIGNED',
    -- How the reviewer was found, such as "Reporting manager" or "Assigned by Asha".
    "found_via" VARCHAR(160) NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_tenant_member_id" UUID,
    "replaces_assignment_id" UUID,
    "status_reason" VARCHAR(500),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "submitted_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_reviewer_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_reviewer_assignments_status" CHECK ("assignment_status" IN ('ASSIGNED', 'SUBMITTED', 'DECLINED', 'REPLACED', 'RETURNED', 'CANCELLED')),
    -- Only submitted work is ever sent back, so both keep when it was submitted.
    CONSTRAINT "ck_performance_reviewer_assignments_submitted" CHECK (("assignment_status" IN ('SUBMITTED', 'RETURNED')) = ("submitted_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "uq_performance_reviewer_assignments_tenant_id" ON "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "id");
-- A reviewer is counted once per stage.
CREATE UNIQUE INDEX "uq_performance_reviewer_assignments_live" ON "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "appraisal_stage_id", "reviewer_tenant_member_id") WHERE "assignment_status" IN ('ASSIGNED', 'SUBMITTED');
CREATE INDEX "ix_performance_reviewer_assignments_reviewer" ON "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "reviewer_tenant_member_id", "assignment_status");
CREATE INDEX "ix_performance_reviewer_assignments_appraisal" ON "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "appraisal_id");

ALTER TABLE "rndtechnosoft_performance_reviewer_assignments" ADD CONSTRAINT "fk_performance_reviewer_assignments_appraisal" FOREIGN KEY ("tenant_id", "appraisal_id") REFERENCES "rndtechnosoft_performance_appraisals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_reviewer_assignments" ADD CONSTRAINT "fk_performance_reviewer_assignments_stage" FOREIGN KEY ("tenant_id", "appraisal_stage_id") REFERENCES "rndtechnosoft_performance_appraisal_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_reviewer_assignments" ADD CONSTRAINT "fk_performance_reviewer_assignments_reviewer" FOREIGN KEY ("tenant_id", "reviewer_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_reviewer_assignments" ADD CONSTRAINT "fk_performance_reviewer_assignments_assigned_by" FOREIGN KEY ("tenant_id", "assigned_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_reviewer_assignments" ADD CONSTRAINT "fk_performance_reviewer_assignments_replaces" FOREIGN KEY ("tenant_id", "replaces_assignment_id") REFERENCES "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Nobody reviews their own appraisal outside a self-assessment; a
-- self-assessment is only ever the employee's own.
CREATE OR REPLACE FUNCTION rndtechnosoft_check_reviewer_not_self()
RETURNS trigger AS $$
DECLARE
  is_self_stage BOOLEAN;
  is_employee BOOLEAN;
BEGIN
  SELECT ws."reviewer_source" = 'SELF' INTO is_self_stage
  FROM "rndtechnosoft_performance_appraisal_stages" st
  JOIN "rndtechnosoft_performance_appraisals" a ON a."tenant_id" = st."tenant_id" AND a."id" = st."appraisal_id"
  JOIN "rndtechnosoft_performance_workflow_stages" ws ON ws."tenant_id" = a."tenant_id" AND ws."workflow_version_id" = a."workflow_version_id" AND ws."stage_key" = st."stage_key"
  WHERE st."tenant_id" = NEW."tenant_id" AND st."id" = NEW."appraisal_stage_id";
  SELECT EXISTS (
    SELECT 1 FROM "rndtechnosoft_performance_appraisals" a
    JOIN "rndtechnosoft_employees" e ON e."tenant_id" = a."tenant_id" AND e."id" = a."employee_id"
    JOIN "rndtechnosoft_tenant_members" m ON m."tenant_id" = e."tenant_id" AND m."user_id" = e."user_id"
    WHERE a."tenant_id" = NEW."tenant_id" AND a."id" = NEW."appraisal_id" AND m."id" = NEW."reviewer_tenant_member_id"
  ) INTO is_employee;
  IF is_self_stage IS DISTINCT FROM is_employee THEN
    RAISE EXCEPTION 'The employee reviews only their own self-assessment, and a self-assessment is only theirs.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_reviewer_assignments_self
  BEFORE INSERT ON "rndtechnosoft_performance_reviewer_assignments"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_check_reviewer_not_self();

-- An assignment's reviewer, stage and appraisal never change; a finished one is never reopened.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_reviewer_assignment()
RETURNS trigger AS $$
BEGIN
  IF (NEW."reviewer_tenant_member_id", NEW."appraisal_stage_id", NEW."appraisal_id", NEW."found_via", NEW."replaces_assignment_id")
     IS DISTINCT FROM (OLD."reviewer_tenant_member_id", OLD."appraisal_stage_id", OLD."appraisal_id", OLD."found_via", OLD."replaces_assignment_id")
  OR (OLD."assignment_status" IN ('DECLINED', 'REPLACED', 'RETURNED', 'CANCELLED') AND NEW."assignment_status" <> OLD."assignment_status")
  OR (OLD."assignment_status" = 'SUBMITTED' AND NEW."assignment_status" NOT IN ('SUBMITTED', 'RETURNED')) THEN
    RAISE EXCEPTION 'A reviewer assignment keeps its history; assign a reviewer anew instead.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_reviewer_assignments_history
  BEFORE UPDATE ON "rndtechnosoft_performance_reviewer_assignments"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_reviewer_assignment();

-- Reviewers nominated for a stage, approved where the workflow asks for it.
CREATE TABLE "rndtechnosoft_performance_nominations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appraisal_id" UUID NOT NULL,
    "appraisal_stage_id" UUID NOT NULL,
    "nominee_tenant_member_id" UUID NOT NULL,
    "nominated_by_tenant_member_id" UUID NOT NULL,
    "nomination_status" VARCHAR(12) NOT NULL DEFAULT 'PROPOSED',
    "decided_by_tenant_member_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_nominations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_nominations_status" CHECK ("nomination_status" IN ('PROPOSED', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT "ck_performance_nominations_decided" CHECK (("nomination_status" IN ('APPROVED', 'REJECTED')) = ("decided_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "uq_performance_nominations_tenant_id" ON "rndtechnosoft_performance_nominations"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_nominations_live" ON "rndtechnosoft_performance_nominations"("tenant_id", "appraisal_stage_id", "nominee_tenant_member_id") WHERE "nomination_status" IN ('PROPOSED', 'APPROVED');
CREATE INDEX "ix_performance_nominations_appraisal" ON "rndtechnosoft_performance_nominations"("tenant_id", "appraisal_id", "nomination_status");

ALTER TABLE "rndtechnosoft_performance_nominations" ADD CONSTRAINT "fk_performance_nominations_appraisal" FOREIGN KEY ("tenant_id", "appraisal_id") REFERENCES "rndtechnosoft_performance_appraisals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_nominations" ADD CONSTRAINT "fk_performance_nominations_stage" FOREIGN KEY ("tenant_id", "appraisal_stage_id") REFERENCES "rndtechnosoft_performance_appraisal_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_nominations" ADD CONSTRAINT "fk_performance_nominations_nominee" FOREIGN KEY ("tenant_id", "nominee_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_nominations" ADD CONSTRAINT "fk_performance_nominations_by" FOREIGN KEY ("tenant_id", "nominated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_nominations" ADD CONSTRAINT "fk_performance_nominations_decided_by" FOREIGN KEY ("tenant_id", "decided_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Reviews ─────────────────────────────────────────────────────────────────

-- One review per assignment: a draft until submitted, then fixed for good.
CREATE TABLE "rndtechnosoft_performance_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "review_status" VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    -- For review and approval stages: APPROVE, or RETURN to an earlier stage.
    "decision" VARCHAR(8),
    "return_to_stage_key" VARCHAR(40),
    "overall_comment" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_reviews_status" CHECK ("review_status" IN ('DRAFT', 'SUBMITTED')),
    CONSTRAINT "ck_performance_reviews_submitted" CHECK (("review_status" = 'SUBMITTED') = ("submitted_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_reviews_decision" CHECK (
        ("decision" IS NULL OR "decision" IN ('APPROVE', 'RETURN')) AND (("decision" = 'RETURN') = ("return_to_stage_key" IS NOT NULL))
    ),
    CONSTRAINT "ck_performance_reviews_comment" CHECK ("overall_comment" IS NULL OR char_length("overall_comment") <= 10000)
);

CREATE UNIQUE INDEX "uq_performance_reviews_tenant_id" ON "rndtechnosoft_performance_reviews"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_reviews_assignment" ON "rndtechnosoft_performance_reviews"("tenant_id", "assignment_id");

ALTER TABLE "rndtechnosoft_performance_reviews" ADD CONSTRAINT "fk_performance_reviews_assignment" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "rndtechnosoft_performance_reviewer_assignments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- One answer per line of the template: a KRA rated as a whole, a KPI, or a question.
CREATE TABLE "rndtechnosoft_performance_review_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "template_kra_id" UUID,
    "template_kpi_id" UUID,
    "template_field_id" UUID,
    "actual_value" DECIMAL(18,4),
    "rating_value" DECIMAL(12,4),
    "marks_value" DECIMAL(12,4),
    "score_percent" DECIMAL(7,4),
    "yes_no" BOOLEAN,
    "number_value" DECIMAL(18,4),
    "text_value" TEXT,
    "option_values" TEXT[],
    "date_value" DATE,
    "is_exempt" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "item_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_review_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_review_items_one_line" CHECK (num_nonnulls("template_kra_id", "template_kpi_id", "template_field_id") = 1),
    CONSTRAINT "ck_performance_review_items_percent" CHECK ("score_percent" IS NULL OR "score_percent" BETWEEN 0 AND 100),
    CONSTRAINT "ck_performance_review_items_text" CHECK (
        ("text_value" IS NULL OR char_length("text_value") <= 10000) AND ("justification" IS NULL OR char_length("justification") <= 2000)
        AND ("item_comment" IS NULL OR char_length("item_comment") <= 4000)
    )
);

CREATE UNIQUE INDEX "uq_performance_review_items_tenant_id" ON "rndtechnosoft_performance_review_items"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_review_items_kra" ON "rndtechnosoft_performance_review_items"("tenant_id", "review_id", "template_kra_id") WHERE "template_kra_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_review_items_kpi" ON "rndtechnosoft_performance_review_items"("tenant_id", "review_id", "template_kpi_id") WHERE "template_kpi_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_review_items_field" ON "rndtechnosoft_performance_review_items"("tenant_id", "review_id", "template_field_id") WHERE "template_field_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_performance_review_items" ADD CONSTRAINT "fk_performance_review_items_review" FOREIGN KEY ("tenant_id", "review_id") REFERENCES "rndtechnosoft_performance_reviews"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_items" ADD CONSTRAINT "fk_performance_review_items_kra" FOREIGN KEY ("tenant_id", "template_kra_id") REFERENCES "rndtechnosoft_performance_template_kras"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_items" ADD CONSTRAINT "fk_performance_review_items_kpi" FOREIGN KEY ("tenant_id", "template_kpi_id") REFERENCES "rndtechnosoft_performance_template_kpis"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_items" ADD CONSTRAINT "fk_performance_review_items_field" FOREIGN KEY ("tenant_id", "template_field_id") REFERENCES "rndtechnosoft_performance_template_fields"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Evidence attached to a review, for one line or the review as a whole.
CREATE TABLE "rndtechnosoft_performance_review_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "template_kra_id" UUID,
    "template_kpi_id" UUID,
    "template_field_id" UUID,
    "original_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "uploaded_by_tenant_member_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_review_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_review_files_line" CHECK (num_nonnulls("template_kra_id", "template_kpi_id", "template_field_id") <= 1),
    CONSTRAINT "ck_performance_review_files_size" CHECK ("file_size_bytes" > 0)
);

CREATE UNIQUE INDEX "uq_performance_review_files_tenant_id" ON "rndtechnosoft_performance_review_files"("tenant_id", "id");
CREATE INDEX "ix_performance_review_files_review" ON "rndtechnosoft_performance_review_files"("tenant_id", "review_id");

ALTER TABLE "rndtechnosoft_performance_review_files" ADD CONSTRAINT "fk_performance_review_files_review" FOREIGN KEY ("tenant_id", "review_id") REFERENCES "rndtechnosoft_performance_reviews"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_files" ADD CONSTRAINT "fk_performance_review_files_kra" FOREIGN KEY ("tenant_id", "template_kra_id") REFERENCES "rndtechnosoft_performance_template_kras"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_files" ADD CONSTRAINT "fk_performance_review_files_kpi" FOREIGN KEY ("tenant_id", "template_kpi_id") REFERENCES "rndtechnosoft_performance_template_kpis"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_files" ADD CONSTRAINT "fk_performance_review_files_field" FOREIGN KEY ("tenant_id", "template_field_id") REFERENCES "rndtechnosoft_performance_template_fields"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_review_files" ADD CONSTRAINT "fk_performance_review_files_uploaded_by" FOREIGN KEY ("tenant_id", "uploaded_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A submitted review is fixed: no change to it, its answers or its evidence.
-- (Deletes stay possible so a workspace can be removed; the application never deletes them.)
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_submitted_review()
RETURNS trigger AS $$
BEGIN
  IF OLD."review_status" = 'SUBMITTED' THEN
    RAISE EXCEPTION 'A submitted review cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_reviews_submitted
  BEFORE UPDATE ON "rndtechnosoft_performance_reviews"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_submitted_review();

CREATE OR REPLACE FUNCTION rndtechnosoft_guard_submitted_review_rows()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "rndtechnosoft_performance_reviews" r
    WHERE r."tenant_id" = NEW."tenant_id" AND r."id" = NEW."review_id" AND r."review_status" = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'The answers and evidence of a submitted review cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_review_items_submitted
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_review_items"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_submitted_review_rows();

CREATE TRIGGER trg_rndtechnosoft_performance_review_files_submitted
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_review_files"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_submitted_review_rows();

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'performance.my.view', 'HRMS', 'Use My appraisals and the review inbox (people only ever see their own appraisals and the reviews assigned to them)'),
  (gen_random_uuid(), 'performance.cycles.view', 'HRMS', 'View appraisal cycles, appraisals and their progress'),
  (gen_random_uuid(), 'performance.cycles.manage', 'HRMS', 'Create and launch appraisal cycles, set targets, and assign or replace reviewers'),
  (gen_random_uuid(), 'performance.reviews.view_all', 'HRMS', 'Read every review, including anonymous reviewers’ names and answers')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('performance.cycles.view', 'performance.cycles.manage', 'performance.reviews.view_all')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Everyone may see their own appraisals and review what is assigned to them.
INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'performance.my.view'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code = 'performance.my.view'
ON CONFLICT DO NOTHING;
