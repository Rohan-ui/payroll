-- COSEC automatic sync, per workspace: whether it runs, which worker holds it
-- (so two workers never sync one workspace at once), and how the last run went.
CREATE TABLE "rndtechnosoft_cosec_sync_states" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "is_auto_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  "claimed_until" TIMESTAMPTZ(6),
  "last_started_at" TIMESTAMPTZ(6),
  "last_finished_at" TIMESTAMPTZ(6),
  "last_sync_status" VARCHAR(16),
  "last_sync_error" VARCHAR(500),
  "last_changed_records" INTEGER NOT NULL DEFAULT 0,
  "last_unmatched_users" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_cosec_sync_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_cosec_sync_states_status" CHECK ("last_sync_status" IS NULL OR "last_sync_status" IN ('SUCCEEDED', 'FAILED')),
  CONSTRAINT "ck_cosec_sync_states_counts" CHECK ("last_changed_records" >= 0 AND "last_unmatched_users" >= 0)
);
CREATE UNIQUE INDEX "uq_cosec_sync_states_tenant" ON "rndtechnosoft_cosec_sync_states" ("tenant_id");
ALTER TABLE "rndtechnosoft_cosec_sync_states"
  ADD CONSTRAINT "fk_cosec_sync_states_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
