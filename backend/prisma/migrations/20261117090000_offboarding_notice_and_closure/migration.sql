-- Offboarding, stage 1: the decision on a notice-period shortfall, and the
-- history of every change to an exit's last working day.

ALTER TABLE "rndtechnosoft_employee_separations"
  ADD COLUMN "notice_shortfall_decision" VARCHAR(16),
  ADD COLUMN "notice_decision_reason" VARCHAR(500),
  ADD COLUMN "notice_decided_by_tenant_member_id" UUID,
  ADD COLUMN "notice_decided_at" TIMESTAMPTZ(6);
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_notice_decision"
  CHECK ("notice_shortfall_decision" IS NULL OR "notice_shortfall_decision" IN ('RECOVER', 'WAIVE'));
-- A decision says who made it and when; a waiver also says why.
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_notice_decided"
  CHECK (("notice_shortfall_decision" IS NULL) = ("notice_decided_at" IS NULL)
     AND ("notice_decided_at" IS NULL) = ("notice_decided_by_tenant_member_id" IS NULL)
     AND ("notice_shortfall_decision" IS DISTINCT FROM 'WAIVE' OR "notice_decision_reason" IS NOT NULL));
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_notice_decided_by"
  FOREIGN KEY ("tenant_id", "notice_decided_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Every change to the last working day, oldest first; the requested day stays on the exit itself.
CREATE TABLE "rndtechnosoft_separation_date_changes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "separation_id" UUID NOT NULL,
  "previous_last_working_date" DATE NOT NULL,
  "new_last_working_date" DATE NOT NULL,
  "change_reason" VARCHAR(500),
  "changed_by_tenant_member_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_separation_date_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_separation_date_changes_changed" CHECK ("previous_last_working_date" <> "new_last_working_date"),
  CONSTRAINT "fk_separation_date_changes_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_separation_date_changes_changed_by" FOREIGN KEY ("tenant_id", "changed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_separation_date_changes_separation" ON "rndtechnosoft_separation_date_changes"("tenant_id", "separation_id", "created_at");
