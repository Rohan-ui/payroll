-- A pipeline is either a sales pipeline (opportunities) or a Client Outreach
-- pipeline (leads working through the outreach cadence). Every existing
-- pipeline is a sales pipeline.
ALTER TABLE "rndtechnosoft_crm_pipelines" ADD COLUMN "pipeline_kind" VARCHAR(16) NOT NULL DEFAULT 'SALES';

ALTER TABLE "rndtechnosoft_crm_pipelines"
  ADD CONSTRAINT "ck_crm_pipelines_kind" CHECK ("pipeline_kind" IN ('SALES', 'OUTREACH'));

-- New leads without a chosen pipeline go to the default one, which must be a sales pipeline.
ALTER TABLE "rndtechnosoft_crm_pipelines"
  ADD CONSTRAINT "ck_crm_pipelines_outreach_not_default" CHECK ("pipeline_kind" = 'SALES' OR "is_default" = false);
