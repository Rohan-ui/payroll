-- Onboarding Workflow Builder: Dynamic stage management and versioned visual workflows

-- 1. Onboarding Workflows
CREATE TABLE IF NOT EXISTS "rndtechnosoft_onboarding_workflows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "pk_onboarding_workflows" PRIMARY KEY ("id"),
    CONSTRAINT "uq_onboarding_workflows_tenant_id" UNIQUE ("tenant_id", "id"),
    CONSTRAINT "uq_onboarding_workflows_code" UNIQUE ("tenant_id", "workflow_code"),
    CONSTRAINT "fk_onboarding_workflows_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_onboarding_workflows_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "ix_onboarding_workflows_active" ON "rndtechnosoft_onboarding_workflows"("tenant_id", "is_active");

-- 2. Workflow Versions
CREATE TABLE IF NOT EXISTS "rndtechnosoft_onboarding_workflow_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "change_summary" VARCHAR(500),
    "published_by_tenant_member_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "canvas_layout" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "pk_onboarding_workflow_versions" PRIMARY KEY ("id"),
    CONSTRAINT "uq_onboarding_workflow_versions_tenant_id" UNIQUE ("tenant_id", "id"),
    CONSTRAINT "uq_onboarding_workflow_versions_number" UNIQUE ("tenant_id", "workflow_id", "version_number"),
    CONSTRAINT "fk_onboarding_workflow_versions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_onboarding_workflow_versions_workflow" FOREIGN KEY ("tenant_id", "workflow_id") REFERENCES "rndtechnosoft_onboarding_workflows"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_onboarding_workflow_versions_published_by" FOREIGN KEY ("tenant_id", "published_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "ix_onboarding_workflow_versions_status" ON "rndtechnosoft_onboarding_workflow_versions"("tenant_id", "workflow_id", "version_status");

-- 3. Workflow Stages
CREATE TABLE IF NOT EXISTS "rndtechnosoft_onboarding_workflow_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "stage_key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "stage_type" VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "color_code" VARCHAR(32),
    "icon_name" VARCHAR(48),
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "stage_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "pk_onboarding_workflow_stages" PRIMARY KEY ("id"),
    CONSTRAINT "uq_onboarding_workflow_stages_tenant_id" UNIQUE ("tenant_id", "id"),
    CONSTRAINT "uq_onboarding_workflow_stages_key" UNIQUE ("tenant_id", "workflow_version_id", "stage_key"),
    CONSTRAINT "fk_onboarding_workflow_stages_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_onboarding_workflow_stages_version" FOREIGN KEY ("tenant_id", "workflow_version_id") REFERENCES "rndtechnosoft_onboarding_workflow_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "ix_onboarding_workflow_stages_order" ON "rndtechnosoft_onboarding_workflow_stages"("tenant_id", "workflow_version_id", "display_order");

-- 4. Workflow Transitions
CREATE TABLE IF NOT EXISTS "rndtechnosoft_onboarding_workflow_transitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "from_stage_id" UUID NOT NULL,
    "to_stage_id" UUID NOT NULL,
    "name" VARCHAR(120),
    "condition_type" VARCHAR(32),
    "transition_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "pk_onboarding_workflow_transitions" PRIMARY KEY ("id"),
    CONSTRAINT "uq_onboarding_workflow_transitions_tenant_id" UNIQUE ("tenant_id", "id"),
    CONSTRAINT "uq_onboarding_workflow_transitions_pair" UNIQUE ("tenant_id", "workflow_version_id", "from_stage_id", "to_stage_id"),
    CONSTRAINT "fk_onboarding_workflow_transitions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "fk_onboarding_workflow_transitions_version" FOREIGN KEY ("tenant_id", "workflow_version_id") REFERENCES "rndtechnosoft_onboarding_workflow_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_workflow_transitions_from" FOREIGN KEY ("tenant_id", "from_stage_id") REFERENCES "rndtechnosoft_onboarding_workflow_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_workflow_transitions_to" FOREIGN KEY ("tenant_id", "to_stage_id") REFERENCES "rndtechnosoft_onboarding_workflow_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "ix_onboarding_workflow_transitions_ver" ON "rndtechnosoft_onboarding_workflow_transitions"("tenant_id", "workflow_version_id");

-- 5. Extend Candidates with Workflow References
ALTER TABLE "rndtechnosoft_candidates" ADD COLUMN IF NOT EXISTS "workflow_id" UUID;
ALTER TABLE "rndtechnosoft_candidates" ADD COLUMN IF NOT EXISTS "workflow_version_id" UUID;
ALTER TABLE "rndtechnosoft_candidates" ADD COLUMN IF NOT EXISTS "current_stage_id" UUID;

CREATE INDEX IF NOT EXISTS "ix_candidates_workflow" ON "rndtechnosoft_candidates"("tenant_id", "workflow_id");
CREATE INDEX IF NOT EXISTS "ix_candidates_current_stage" ON "rndtechnosoft_candidates"("tenant_id", "current_stage_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidates_workflow') THEN
    ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_workflow" FOREIGN KEY ("tenant_id", "workflow_id") REFERENCES "rndtechnosoft_onboarding_workflows"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidates_workflow_version') THEN
    ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_workflow_version" FOREIGN KEY ("tenant_id", "workflow_version_id") REFERENCES "rndtechnosoft_onboarding_workflow_versions"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_candidates_stage') THEN
    ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_stage" FOREIGN KEY ("tenant_id", "current_stage_id") REFERENCES "rndtechnosoft_onboarding_workflow_stages"("tenant_id", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
