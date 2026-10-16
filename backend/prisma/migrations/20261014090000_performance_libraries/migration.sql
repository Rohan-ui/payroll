-- Performance (KRA & KPI), phase 1: department heads, the KRA and KPI
-- libraries, and versioned rating scales.
--
-- History is protected by the database, not only by the application:
--   * a department head appointment is never rewritten: a change of head
--     closes the current row and adds a new one, and two active appointments
--     of one department never overlap (exclusion constraint);
--   * a published rating scale version, its levels and its final rating
--     bands never change (triggers), and a version's bands never overlap
--     (exclusion constraint).
-- KRAs and KPIs stay editable library entries. Appraisal templates copy the
-- definitions they use when they are published (phase 2), so editing a
-- library entry never changes an appraisal already in progress or finalized.
-- Every effective_to is the last day a row applies (inclusive).

-- Exclusion constraints compare uuids with = inside a GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Department heads ────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_department_heads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "head_employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "appointment_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "change_reason" VARCHAR(500),
    "created_by_tenant_member_id" UUID,
    "cancelled_by_tenant_member_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_department_heads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_department_heads_status" CHECK ("appointment_status" IN ('ACTIVE', 'CANCELLED')),
    CONSTRAINT "ck_department_heads_cancelled" CHECK (("appointment_status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
    CONSTRAINT "ck_department_heads_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "ex_department_heads_overlap" EXCLUDE USING gist (
        "tenant_id" WITH =, "department_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&
    ) WHERE ("appointment_status" = 'ACTIVE')
);

CREATE UNIQUE INDEX "uq_department_heads_tenant_id" ON "rndtechnosoft_department_heads"("tenant_id", "id");
CREATE INDEX "ix_department_heads_department" ON "rndtechnosoft_department_heads"("tenant_id", "department_id", "effective_from");
CREATE INDEX "ix_department_heads_employee" ON "rndtechnosoft_department_heads"("tenant_id", "head_employee_id");

ALTER TABLE "rndtechnosoft_department_heads" ADD CONSTRAINT "fk_department_heads_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_department_heads" ADD CONSTRAINT "fk_department_heads_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_department_heads" ADD CONSTRAINT "fk_department_heads_employee" FOREIGN KEY ("tenant_id", "head_employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_department_heads" ADD CONSTRAINT "fk_department_heads_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_department_heads" ADD CONSTRAINT "fk_department_heads_cancelled_by" FOREIGN KEY ("tenant_id", "cancelled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- An appointment's department, head and start never change: only its last
-- day (when it ends or the next head starts) and a cancellation.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_department_head()
RETURNS trigger AS $$
BEGIN
  IF OLD.appointment_status = 'CANCELLED'
  OR (to_jsonb(NEW) - ARRAY['effective_to', 'appointment_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['effective_to', 'appointment_status', 'cancelled_at', 'cancelled_by_tenant_member_id', 'cancellation_reason', 'updated_at'])
  THEN
    RAISE EXCEPTION 'A department head appointment cannot be edited; appoint a new head instead.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_department_heads_history
  BEFORE UPDATE ON "rndtechnosoft_department_heads"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_department_head();

-- ── Rating scales ───────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_rating_scales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scale_code" VARCHAR(64) NOT NULL,
    "scale_name" VARCHAR(160) NOT NULL,
    "scale_description" VARCHAR(1000),
    "scale_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_rating_scales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_rating_scales_status" CHECK ("scale_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_performance_rating_scales_archived" CHECK (("scale_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_rating_scales_code" CHECK ("scale_code" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE UNIQUE INDEX "uq_performance_rating_scales_tenant_id" ON "rndtechnosoft_performance_rating_scales"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_rating_scales_code" ON "rndtechnosoft_performance_rating_scales"("tenant_id", "scale_code");

ALTER TABLE "rndtechnosoft_performance_rating_scales" ADD CONSTRAINT "fk_performance_rating_scales_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_rating_scales" ADD CONSTRAINT "fk_performance_rating_scales_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- How a rating is entered and turned into a score:
--   LEVELS  one of the version's levels (min and max are its lowest and highest);
--   RANGE   any value from min to max in steps of step_value; levels are labelled anchors;
--   MARKS   0 to the rated item's own maximum marks in steps of step_value.
-- Score % is value / max (PROPORTION_OF_MAX), (value - min) / (max - min)
-- (MIN_TO_MAX), or the chosen level's score_percent (LEVEL_PERCENT).
CREATE TABLE "rndtechnosoft_performance_rating_scale_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rating_scale_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "input_kind" VARCHAR(16) NOT NULL,
    "conversion_method" VARCHAR(24) NOT NULL,
    "min_value" DECIMAL(12,4),
    "max_value" DECIMAL(12,4),
    "step_value" DECIMAL(12,4),
    "unit_label" VARCHAR(32),
    "change_note" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_rating_scale_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_rating_scale_versions_status" CHECK ("version_status" IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT "ck_performance_rating_scale_versions_published" CHECK (("version_status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_rating_scale_versions_number" CHECK ("version_number" >= 1),
    CONSTRAINT "ck_performance_rating_scale_versions_kind" CHECK ("input_kind" IN ('LEVELS', 'RANGE', 'MARKS')),
    CONSTRAINT "ck_performance_rating_scale_versions_conversion" CHECK (
        "conversion_method" IN ('PROPORTION_OF_MAX', 'MIN_TO_MAX', 'LEVEL_PERCENT')
        AND ("conversion_method" <> 'LEVEL_PERCENT' OR "input_kind" = 'LEVELS')
        AND ("input_kind" <> 'MARKS' OR "conversion_method" = 'PROPORTION_OF_MAX')
    ),
    CONSTRAINT "ck_performance_rating_scale_versions_bounds" CHECK (
        CASE WHEN "input_kind" = 'MARKS' THEN "min_value" IS NULL AND "max_value" IS NULL
             ELSE "min_value" IS NOT NULL AND "max_value" IS NOT NULL AND "min_value" >= 0 AND "max_value" > "min_value" END
    ),
    CONSTRAINT "ck_performance_rating_scale_versions_step" CHECK (
        CASE WHEN "input_kind" = 'LEVELS' THEN "step_value" IS NULL ELSE "step_value" IS NOT NULL AND "step_value" > 0 END
    )
);

CREATE UNIQUE INDEX "uq_performance_rating_scale_versions_tenant_id" ON "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_rating_scale_versions_number" ON "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "rating_scale_id", "version_number");
-- At most one draft being edited per scale.
CREATE UNIQUE INDEX "uq_performance_rating_scale_versions_draft" ON "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "rating_scale_id") WHERE "version_status" = 'DRAFT';

ALTER TABLE "rndtechnosoft_performance_rating_scale_versions" ADD CONSTRAINT "fk_performance_rating_scale_versions_scale" FOREIGN KEY ("tenant_id", "rating_scale_id") REFERENCES "rndtechnosoft_performance_rating_scales"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_rating_scale_versions" ADD CONSTRAINT "fk_performance_rating_scale_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_performance_rating_scale_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rating_scale_version_id" UUID NOT NULL,
    "level_value" DECIMAL(12,4) NOT NULL,
    "level_label" VARCHAR(120) NOT NULL,
    "level_description" VARCHAR(500),
    "score_percent" DECIMAL(7,4),
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_rating_scale_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_rating_scale_levels_value" CHECK ("level_value" >= 0),
    CONSTRAINT "ck_performance_rating_scale_levels_percent" CHECK ("score_percent" IS NULL OR "score_percent" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "uq_performance_rating_scale_levels_tenant_id" ON "rndtechnosoft_performance_rating_scale_levels"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_rating_scale_levels_value" ON "rndtechnosoft_performance_rating_scale_levels"("tenant_id", "rating_scale_version_id", "level_value");

ALTER TABLE "rndtechnosoft_performance_rating_scale_levels" ADD CONSTRAINT "fk_performance_rating_scale_levels_version" FOREIGN KEY ("tenant_id", "rating_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Final rating bands: a score from min_percent up to (not including)
-- max_percent gets the band's label; the band ending at 100 includes 100.
CREATE TABLE "rndtechnosoft_performance_rating_scale_bands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rating_scale_version_id" UUID NOT NULL,
    "band_label" VARCHAR(120) NOT NULL,
    "band_description" VARCHAR(500),
    "min_percent" DECIMAL(7,4) NOT NULL,
    "max_percent" DECIMAL(7,4) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_rating_scale_bands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_rating_scale_bands_range" CHECK ("min_percent" >= 0 AND "max_percent" <= 100 AND "max_percent" > "min_percent"),
    CONSTRAINT "ex_performance_rating_scale_bands_overlap" EXCLUDE USING gist (
        "tenant_id" WITH =, "rating_scale_version_id" WITH =, numrange("min_percent", "max_percent", '[)') WITH &&
    )
);

CREATE UNIQUE INDEX "uq_performance_rating_scale_bands_tenant_id" ON "rndtechnosoft_performance_rating_scale_bands"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_rating_scale_bands_label" ON "rndtechnosoft_performance_rating_scale_bands"("tenant_id", "rating_scale_version_id", "band_label");

ALTER TABLE "rndtechnosoft_performance_rating_scale_bands" ADD CONSTRAINT "fk_performance_rating_scale_bands_version" FOREIGN KEY ("tenant_id", "rating_scale_version_id") REFERENCES "rndtechnosoft_performance_rating_scale_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- A published scale version is fixed for good.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_rating_scale_version()
RETURNS trigger AS $$
BEGIN
  IF OLD.version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'A published rating scale version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_rating_scale_versions_published
  BEFORE UPDATE ON "rndtechnosoft_performance_rating_scale_versions"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_rating_scale_version();

-- So are its levels and bands: none added or changed.
CREATE OR REPLACE FUNCTION rndtechnosoft_guard_published_rating_scale_rows()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_rating_scale_versions" v
        WHERE v."tenant_id" = OLD."tenant_id" AND v."id" = OLD."rating_scale_version_id" AND v."version_status" = 'PUBLISHED'))
  OR EXISTS (
        SELECT 1 FROM "rndtechnosoft_performance_rating_scale_versions" v
        WHERE v."tenant_id" = NEW."tenant_id" AND v."id" = NEW."rating_scale_version_id" AND v."version_status" = 'PUBLISHED')
  THEN
    RAISE EXCEPTION 'The levels and bands of a published rating scale version cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_performance_rating_scale_levels_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_rating_scale_levels"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_rating_scale_rows();

CREATE TRIGGER trg_rndtechnosoft_performance_rating_scale_bands_published
  BEFORE INSERT OR UPDATE ON "rndtechnosoft_performance_rating_scale_bands"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_guard_published_rating_scale_rows();

-- ── KRA library ─────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_kras" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kra_code" VARCHAR(64) NOT NULL,
    "kra_name" VARCHAR(160) NOT NULL,
    "kra_description" VARCHAR(2000),
    "measurement_method" VARCHAR(2000),
    "evaluation_instructions" VARCHAR(4000),
    "evidence_requirement" VARCHAR(16) NOT NULL DEFAULT 'NONE',
    "default_weight_percent" DECIMAL(7,4),
    "default_max_marks" DECIMAL(12,4),
    "default_min_marks" DECIMAL(12,4),
    "rating_scale_id" UUID,
    "applies_to_all" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "kra_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_kras_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_kras_status" CHECK ("kra_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_performance_kras_archived" CHECK (("kra_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_kras_code" CHECK ("kra_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "ck_performance_kras_evidence" CHECK ("evidence_requirement" IN ('NONE', 'OPTIONAL', 'REQUIRED')),
    CONSTRAINT "ck_performance_kras_weight" CHECK ("default_weight_percent" IS NULL OR ("default_weight_percent" > 0 AND "default_weight_percent" <= 100)),
    CONSTRAINT "ck_performance_kras_marks" CHECK (
        ("default_max_marks" IS NULL OR "default_max_marks" > 0)
        AND ("default_min_marks" IS NULL OR ("default_min_marks" >= 0 AND "default_max_marks" IS NOT NULL AND "default_min_marks" < "default_max_marks"))
    ),
    CONSTRAINT "ck_performance_kras_dates" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "ck_performance_kras_revision" CHECK ("revision_number" >= 1)
);

CREATE UNIQUE INDEX "uq_performance_kras_tenant_id" ON "rndtechnosoft_performance_kras"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_kras_code" ON "rndtechnosoft_performance_kras"("tenant_id", "kra_code");
CREATE INDEX "ix_performance_kras_status" ON "rndtechnosoft_performance_kras"("tenant_id", "kra_status", "kra_name");

ALTER TABLE "rndtechnosoft_performance_kras" ADD CONSTRAINT "fk_performance_kras_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kras" ADD CONSTRAINT "fk_performance_kras_scale" FOREIGN KEY ("tenant_id", "rating_scale_id") REFERENCES "rndtechnosoft_performance_rating_scales"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kras" ADD CONSTRAINT "fk_performance_kras_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kras" ADD CONSTRAINT "fk_performance_kras_updated_by" FOREIGN KEY ("tenant_id", "updated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Who a KRA is meant for when it does not apply to everyone: one department,
-- designation or employee per row; any one row matching is enough.
CREATE TABLE "rndtechnosoft_performance_kra_scopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kra_id" UUID NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_kra_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_kra_scopes_one_target" CHECK (num_nonnulls("department_id", "designation_id", "employee_id") = 1)
);

CREATE UNIQUE INDEX "uq_performance_kra_scopes_tenant_id" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "id");
CREATE INDEX "ix_performance_kra_scopes_kra" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "kra_id");
CREATE INDEX "ix_performance_kra_scopes_department" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_kra_scopes_department" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "kra_id", "department_id") WHERE "department_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_kra_scopes_designation" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "kra_id", "designation_id") WHERE "designation_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_performance_kra_scopes_employee" ON "rndtechnosoft_performance_kra_scopes"("tenant_id", "kra_id", "employee_id") WHERE "employee_id" IS NOT NULL;

ALTER TABLE "rndtechnosoft_performance_kra_scopes" ADD CONSTRAINT "fk_performance_kra_scopes_kra" FOREIGN KEY ("tenant_id", "kra_id") REFERENCES "rndtechnosoft_performance_kras"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kra_scopes" ADD CONSTRAINT "fk_performance_kra_scopes_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kra_scopes" ADD CONSTRAINT "fk_performance_kra_scopes_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kra_scopes" ADD CONSTRAINT "fk_performance_kra_scopes_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── KPI library ─────────────────────────────────────────────────────────────

CREATE TABLE "rndtechnosoft_performance_kpis" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kpi_code" VARCHAR(64) NOT NULL,
    "kpi_name" VARCHAR(160) NOT NULL,
    "kpi_description" VARCHAR(2000),
    "measurement_type" VARCHAR(24) NOT NULL,
    "unit_label" VARCHAR(32),
    "currency_code" CHAR(3),
    "direction" VARCHAR(24) NOT NULL,
    "default_target" DECIMAL(18,4),
    "minimum_expected" DECIMAL(18,4),
    "stretch_target" DECIMAL(18,4),
    "default_max_marks" DECIMAL(12,4),
    "rating_scale_id" UUID,
    "evidence_requirement" VARCHAR(16) NOT NULL DEFAULT 'NONE',
    "evaluation_instructions" VARCHAR(4000),
    "kpi_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "created_by_tenant_member_id" UUID,
    "updated_by_tenant_member_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_kpis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_kpis_status" CHECK ("kpi_status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "ck_performance_kpis_archived" CHECK (("kpi_status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)),
    CONSTRAINT "ck_performance_kpis_code" CHECK ("kpi_code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT "ck_performance_kpis_type" CHECK ("measurement_type" IN (
        'NUMERIC', 'PERCENTAGE', 'CURRENCY', 'COUNT', 'DURATION', 'QUALITY_SCORE', 'MILESTONE', 'YES_NO', 'RATING', 'QUALITATIVE'
    )),
    CONSTRAINT "ck_performance_kpis_currency" CHECK (("measurement_type" = 'CURRENCY') = ("currency_code" IS NOT NULL)),
    CONSTRAINT "ck_performance_kpis_direction" CHECK (
        "direction" IN ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NOT_APPLICABLE')
        AND (("measurement_type" IN ('YES_NO', 'RATING', 'QUALITATIVE')) = ("direction" = 'NOT_APPLICABLE'))
    ),
    -- Targets only mean something for measured values.
    CONSTRAINT "ck_performance_kpis_targets" CHECK (
        "measurement_type" NOT IN ('YES_NO', 'RATING', 'QUALITATIVE')
        OR ("default_target" IS NULL AND "minimum_expected" IS NULL AND "stretch_target" IS NULL)
    ),
    CONSTRAINT "ck_performance_kpis_rated" CHECK ("measurement_type" NOT IN ('RATING', 'QUALITATIVE') OR "rating_scale_id" IS NOT NULL),
    CONSTRAINT "ck_performance_kpis_marks" CHECK ("default_max_marks" IS NULL OR "default_max_marks" > 0),
    CONSTRAINT "ck_performance_kpis_evidence" CHECK ("evidence_requirement" IN ('NONE', 'OPTIONAL', 'REQUIRED')),
    CONSTRAINT "ck_performance_kpis_revision" CHECK ("revision_number" >= 1)
);

CREATE UNIQUE INDEX "uq_performance_kpis_tenant_id" ON "rndtechnosoft_performance_kpis"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_kpis_code" ON "rndtechnosoft_performance_kpis"("tenant_id", "kpi_code");
CREATE INDEX "ix_performance_kpis_status" ON "rndtechnosoft_performance_kpis"("tenant_id", "kpi_status", "kpi_name");

ALTER TABLE "rndtechnosoft_performance_kpis" ADD CONSTRAINT "fk_performance_kpis_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kpis" ADD CONSTRAINT "fk_performance_kpis_scale" FOREIGN KEY ("tenant_id", "rating_scale_id") REFERENCES "rndtechnosoft_performance_rating_scales"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kpis" ADD CONSTRAINT "fk_performance_kpis_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kpis" ADD CONSTRAINT "fk_performance_kpis_updated_by" FOREIGN KEY ("tenant_id", "updated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- The KPIs a KRA suggests, in order, each with its suggested weight within
-- that KRA. One KPI can serve several KRAs without being copied.
CREATE TABLE "rndtechnosoft_performance_kra_kpis" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kra_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "default_weight_percent" DECIMAL(7,4),
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_performance_kra_kpis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_performance_kra_kpis_weight" CHECK ("default_weight_percent" IS NULL OR ("default_weight_percent" > 0 AND "default_weight_percent" <= 100))
);

CREATE UNIQUE INDEX "uq_performance_kra_kpis_tenant_id" ON "rndtechnosoft_performance_kra_kpis"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_performance_kra_kpis_pair" ON "rndtechnosoft_performance_kra_kpis"("tenant_id", "kra_id", "kpi_id");
CREATE INDEX "ix_performance_kra_kpis_kpi" ON "rndtechnosoft_performance_kra_kpis"("tenant_id", "kpi_id");

ALTER TABLE "rndtechnosoft_performance_kra_kpis" ADD CONSTRAINT "fk_performance_kra_kpis_kra" FOREIGN KEY ("tenant_id", "kra_id") REFERENCES "rndtechnosoft_performance_kras"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_performance_kra_kpis" ADD CONSTRAINT "fk_performance_kra_kpis_kpi" FOREIGN KEY ("tenant_id", "kpi_id") REFERENCES "rndtechnosoft_performance_kpis"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'performance.library.view', 'HRMS', 'View KRAs, KPIs, rating scales and department heads'),
  (gen_random_uuid(), 'performance.library.manage', 'HRMS', 'Create, edit, duplicate and archive KRAs and KPIs'),
  (gen_random_uuid(), 'performance.scales.manage', 'HRMS', 'Create rating scales and publish new versions of them'),
  (gen_random_uuid(), 'performance.department_heads.manage', 'HRMS', 'Appoint, end and cancel department heads')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN (
  'performance.library.view', 'performance.library.manage', 'performance.scales.manage', 'performance.department_heads.manage'
)
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
