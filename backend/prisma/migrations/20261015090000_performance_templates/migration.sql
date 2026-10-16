-- Performance (KRA & KPI), phase 2: appraisal templates, their weights and
-- scoring rules, and the appraisal form's questions.
--
-- A template is edited as one draft version at a time; publishing fixes it.
-- Each version holds its own copy of every KRA and KPI definition it uses
-- (names, instructions, targets, weights, how each is scored) and the exact
-- rating scale version each line is rated on, so later edits to the library
-- or to a scale never change a published template or the appraisals that
-- use it. The database refuses any change to a published version or its lines.

-- ── Templates ───────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_code" VARCHAR(64) NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "template_description" VARCHAR(1000),
    "applies_to_all" BOOLEAN NOT NULL DEFAULT true,
    "template_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_templates_status" CHECK ("template_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_performance_templates_archived" CHECK (("template_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_templates_code" CHECK ("template_code" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE UNIQUE INDEX "uq_performance_templates_tenant_id" ON "rndtechnosoft_performance_templates"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_templates_code" ON "rndtechnosoft_performance_templates"("tenant_id", "template_code");
CREATE INDEX "ix_performance_templates_status" ON "rndtechnosoft_performance_templates"("tenant_id", "template_status", "template_name");

ALTER TABLE "rndtechnosoft_performance_templates" ADD CONSTRAINT "fk_performance_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_templates" ADD CONSTRAINT "fk_performance_templates_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Which departments or designations a template is meant for, when not everyone.
CREATE TABLE "rndtechnosoft_performance_template_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_template_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_template_scopes_one_target" CHECK (num_nonnulls("department_id", "designation_id") = 1)
);

CREATE UNIQUE INDEX "uq_performance_template_scopes_tenant_id" ON "rndtechnosoft_performance_template_scopes"("tenant_id", "id");
CREATE INDEX "ix_performance_template_scopes_template" ON "rndtechnosoft_performance_template_scopes"("tenant_id", "template_id");
CREATE UNIQUE INDEX "uq_performance_template_scopes_department" ON "rndtechnosoft_performance_template_scopes"("tenant_id", "template_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_template_scopes_designation" ON "rndtechnosoft_performance_template_scopes"("tenant_id", "template_id", "designation_id") WHERE "designation_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_performance_template_scopes" ADD CONSTRAINT "fk_performance_template_scopes_template" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "rndtechnosoft_performance_templates"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_scopes" ADD CONSTRAINT "fk_performance_template_scopes_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_scopes" ADD CONSTRAINT "fk_performance_template_scopes_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Versions and their scoring policy ───────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_template_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    -- WEIGHTED: lines carry weight percentages. MARKS: maximum marks are the weights.
    "scoring_model" VARCHAR(16) NOT NULL DEFAULT 'WEIGHTED',
    -- MUST_TOTAL: weights must add up exactly. NORMALIZE: each counts as its share of the total.
    "weight_rule" VARCHAR(16) NOT NULL DEFAULT 'MUST_TOTAL',
    "total_marks" DECIMAL(12,4),
    -- What an unrated line does: hold the score back, be left out, or count as 0%.
    "missing_rating_rule" VARCHAR(16) NOT NULL DEFAULT 'BLOCK',
    "score_decimals" INTEGER NOT NULL DEFAULT 2,
    "final_scale_version_id" UUID,
    "change_note" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_template_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_template_versions_status" CHECK ("version_status" IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT "ck_performance_template_versions_published" CHECK (("version_status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_template_versions_number" CHECK ("version_number" >= 1),
    CONSTRAINT "ck_performance_template_versions_model" CHECK ("scoring_model" IN ('WEIGHTED', 'MARKS')),
    CONSTRAINT "ck_performance_template_versions_weight_rule" CHECK ("weight_rule" IN ('MUST_TOTAL', 'NORMALIZE')),
    CONSTRAINT "ck_performance_template_versions_missing" CHECK ("missing_rating_rule" IN ('BLOCK', 'EXCLUDE', 'ZERO')),
    CONSTRAINT "ck_performance_template_versions_decimals" CHECK ("score_decimals" BETWEEN 0 AND 4),
    CONSTRAINT "ck_performance_template_versions_total_marks" CHECK (
        ("total_marks" IS NULL OR "total_marks" > 0) AND ("scoring_model" = 'MARKS' OR "total_marks" IS NULL)
    )
);

CREATE UNIQUE INDEX "uq_performance_template_versions_tenant_id" ON "rndtechnosoft_performance_template_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_template_versions_number" ON "rndtechnosoft_performance_template_versions"("tenant_id", "template_id", "version_number");
-- At most one draft being edited per template.
CREATE UNIQUE INDEX "uq_performance_template_versions_draft" ON "rndtechnosoft_performance_template_versions"("tenant_id", "template_id") WHERE "version_status" = 'DRAFT';

ALTER TABLE "rndtechnosoft_performance_template_versions" ADD CONSTRAINT "fk_performance_template_versions_template" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "rndtechnosoft_performance_templates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_versions" ADD CONSTRAINT "fk_performance_template_versions_final_scale" FOREIGN KEY ("tenant_id", "final_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_versions" ADD CONSTRAINT "fk_performance_template_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── KRA lines ───────────────────────────────────────────────────────────────

-- A KRA as this version uses it: a copy of its library definition, its weight
-- or marks here, and, when it has no KPIs, how it is rated as a whole.
CREATE TABLE "rndtechnosoft_performance_template_kras" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "kra_id" UUID NOT NULL,
    "kra_code" VARCHAR(64) NOT NULL,
    "kra_name" VARCHAR(160) NOT NULL,
    "kra_description" VARCHAR(2000),
    "measurement_method" VARCHAR(2000),
    "evaluation_instructions" VARCHAR(4000),
    "evidence_requirement" VARCHAR(16) NOT NULL,
    "weight_percent" DECIMAL(7,4),
    "max_marks" DECIMAL(12,4),
    "min_marks" DECIMAL(12,4),
    "scoring_method" VARCHAR(24),
    "rating_scale_version_id" UUID,
    "allows_exemption" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_template_kras_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_template_kras_evidence" CHECK ("evidence_requirement" IN ('NONE', 'OPTIONAL', 'REQUIRED')),
    CONSTRAINT "ck_performance_template_kras_weight" CHECK ("weight_percent" IS NULL OR ("weight_percent" > 0 AND "weight_percent" <= 100)),
    CONSTRAINT "ck_performance_template_kras_marks" CHECK (("max_marks" IS NULL OR "max_marks" > 0) AND ("min_marks" IS NULL OR "min_marks" >= 0)),
    CONSTRAINT "ck_performance_template_kras_method" CHECK ("scoring_method" IS NULL OR "scoring_method" IN ('RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'))
);

CREATE UNIQUE INDEX "uq_performance_template_kras_tenant_id" ON "rndtechnosoft_performance_template_kras"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_template_kras_kra" ON "rndtechnosoft_performance_template_kras"("tenant_id", "template_version_id", "kra_id");

ALTER TABLE "rndtechnosoft_performance_template_kras" ADD CONSTRAINT "fk_performance_template_kras_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_performance_template_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_kras" ADD CONSTRAINT "fk_performance_template_kras_kra" FOREIGN KEY ("tenant_id", "kra_id") REFERENCES "rndtechnosoft_performance_kras"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_kras" ADD CONSTRAINT "fk_performance_template_kras_scale" FOREIGN KEY ("tenant_id", "rating_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── KPI lines ───────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_template_kpis" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "template_kra_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "kpi_code" VARCHAR(64) NOT NULL,
    "kpi_name" VARCHAR(160) NOT NULL,
    "kpi_description" VARCHAR(2000),
    "measurement_type" VARCHAR(24) NOT NULL,
    "unit_label" VARCHAR(32),
    "currency_code" CHAR(3),
    "direction" VARCHAR(24) NOT NULL,
    "evidence_requirement" VARCHAR(16) NOT NULL,
    "evaluation_instructions" VARCHAR(4000),
    "weight_percent" DECIMAL(7,4),
    "max_marks" DECIMAL(12,4),
    "scoring_method" VARCHAR(24) NOT NULL,
    -- Checked by performance/scoring/scoring-methods.ts; settings only, never code.
    "scoring_config" JSONB NOT NULL,
    -- TEMPLATE: targets below apply to everyone. PER_EMPLOYEE: set when each appraisal is prepared.
    "target_source" VARCHAR(16) NOT NULL DEFAULT 'TEMPLATE',
    "target_value" DECIMAL(18,4),
    "threshold_value" DECIMAL(18,4),
    "stretch_value" DECIMAL(18,4),
    "rating_scale_version_id" UUID,
    "allows_exemption" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_template_kpis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_template_kpis_type" CHECK ("measurement_type" IN (
        'NUMERIC', 'PERCENTAGE', 'CURRENCY', 'COUNT', 'DURATION', 'QUALITY_SCORE', 'MILESTONE', 'YES_NO', 'RATING', 'QUALITATIVE'
    )),
    CONSTRAINT "ck_performance_template_kpis_direction" CHECK ("direction" IN ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NOT_APPLICABLE')),
    CONSTRAINT "ck_performance_template_kpis_evidence" CHECK ("evidence_requirement" IN ('NONE', 'OPTIONAL', 'REQUIRED')),
    CONSTRAINT "ck_performance_template_kpis_weight" CHECK ("weight_percent" IS NULL OR ("weight_percent" > 0 AND "weight_percent" <= 100)),
    CONSTRAINT "ck_performance_template_kpis_marks" CHECK ("max_marks" IS NULL OR "max_marks" > 0),
    CONSTRAINT "ck_performance_template_kpis_method" CHECK ("scoring_method" IN (
        'PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS', 'COMPLETION_PERCENT', 'YES_NO', 'RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'
    )),
    CONSTRAINT "ck_performance_template_kpis_config" CHECK (jsonb_typeof("scoring_config") = 'object'),
    CONSTRAINT "ck_performance_template_kpis_target_source" CHECK ("target_source" IN ('TEMPLATE', 'PER_EMPLOYEE'))
);

CREATE UNIQUE INDEX "uq_performance_template_kpis_tenant_id" ON "rndtechnosoft_performance_template_kpis"("tenant_id", "id");
-- A measure counted twice would count its result twice.
CREATE UNIQUE INDEX "uq_performance_template_kpis_kpi" ON "rndtechnosoft_performance_template_kpis"("tenant_id", "template_version_id", "kpi_id");
CREATE INDEX "ix_performance_template_kpis_kra" ON "rndtechnosoft_performance_template_kpis"("tenant_id", "template_kra_id");

ALTER TABLE "rndtechnosoft_performance_template_kpis" ADD CONSTRAINT "fk_performance_template_kpis_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_performance_template_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_kpis" ADD CONSTRAINT "fk_performance_template_kpis_kra_line" FOREIGN KEY ("tenant_id", "template_kra_id") REFERENCES "rndtechnosoft_performance_template_kras"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_kpis" ADD CONSTRAINT "fk_performance_template_kpis_kpi" FOREIGN KEY ("tenant_id", "kpi_id") REFERENCES "rndtechnosoft_performance_kpis"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_kpis" ADD CONSTRAINT "fk_performance_template_kpis_scale" FOREIGN KEY ("tenant_id", "rating_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Form questions ──────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_template_fields" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "field_key" VARCHAR(40) NOT NULL,
    "field_type" VARCHAR(24) NOT NULL,
    "field_label" VARCHAR(200) NOT NULL,
    "field_description" VARCHAR(1000),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    -- Who answers: SELF (the employee), REVIEWERS, or BOTH.
    "filled_by" VARCHAR(16) NOT NULL,
    -- When the employee sees reviewers' answers: ALWAYS, AFTER_FINALIZATION or NEVER.
    "employee_visibility" VARCHAR(24) NOT NULL,
    -- Checked by performance/scoring/form-fields.ts; settings only, never code.
    "field_config" JSONB NOT NULL,
    "rating_scale_version_id" UUID,
    "is_scored" BOOLEAN NOT NULL DEFAULT false,
    "weight_percent" DECIMAL(7,4),
    "max_marks" DECIMAL(12,4),
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_template_fields_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_template_fields_key" CHECK ("field_key" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "ck_performance_template_fields_type" CHECK ("field_type" IN (
        'RATING', 'NUMBER', 'SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'ATTACHMENT', 'ACHIEVEMENTS', 'DEVELOPMENT_GOAL'
    )),
    CONSTRAINT "ck_performance_template_fields_filled_by" CHECK ("filled_by" IN ('SELF', 'REVIEWERS', 'BOTH')),
    CONSTRAINT "ck_performance_template_fields_visibility" CHECK ("employee_visibility" IN ('ALWAYS', 'AFTER_FINALIZATION', 'NEVER')),
    CONSTRAINT "ck_performance_template_fields_config" CHECK (jsonb_typeof("field_config") = 'object'),
    CONSTRAINT "ck_performance_template_fields_scored" CHECK (
        ("is_scored" AND "field_type" IN ('RATING', 'NUMBER')) OR (NOT "is_scored" AND "weight_percent" IS NULL AND "max_marks" IS NULL)
    ),
    CONSTRAINT "ck_performance_template_fields_weight" CHECK (
        ("weight_percent" IS NULL OR ("weight_percent" > 0 AND "weight_percent" <= 100)) AND ("max_marks" IS NULL OR "max_marks" > 0)
    )
);

CREATE UNIQUE INDEX "uq_performance_template_fields_tenant_id" ON "rndtechnosoft_performance_template_fields"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_template_fields_key" ON "rndtechnosoft_performance_template_fields"("tenant_id", "template_version_id", "field_key");

ALTER TABLE "rndtechnosoft_performance_template_fields" ADD CONSTRAINT "fk_performance_template_fields_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_performance_template_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_template_fields" ADD CONSTRAINT "fk_performance_template_fields_scale" FOREIGN KEY ("tenant_id", "rating_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── History guards ──────────────────────────────────────────────────────────

-- A published template version is fixed for good.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_template_version()
RETURNS trigger AS $$
BEGIN
  IF OLD.version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'A published appraisal template version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_template_versions_published
  BEFORE UPDATE ON "rndtechnosoft_performance_template_versions"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_template_version();

-- So are its KRAs, KPIs and questions: none added or changed.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_template_rows()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_template_versions" v
        WHERE v."tenant_id" = OLD."tenant_id" AND v."id" = OLD."template_version_id" AND v."version_status" = 'PUBLISHED'))
  OR EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_template_versions" v
        WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."template_version_id" AND v."version_status" = 'PUBLISHED')
  THEN
    RAISE EXCEPTION 'The lines of a published appraisal template version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_template_kras_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_template_kras"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_template_rows();

CREATE TRIGGER trg_rndtechnosoft_performance_template_kpis_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_template_kpis"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_template_rows();

CREATE TRIGGER trg_rndtechnosoft_performance_template_fields_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_template_fields"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_template_rows();

-- ── Permissions ─────────────────────────────────────────────────────────────

-- Viewing the performance setup now includes templates.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'performance.library.view', 'HRMS', 'View KRAs, KPIs, rating scales, appraisal templates and department heads'),
  (gen_random_uuid(), 'performance.templates.manage', 'HRMS', 'Create appraisal templates, set their weights, scoring and questions, and publish them')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'performance.templates.manage'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
