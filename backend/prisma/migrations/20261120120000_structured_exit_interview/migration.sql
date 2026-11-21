-- A structured exit interview, on the exit as before: who held it, the
-- primary and secondary reason for leaving (codes from the workspace's
-- exit-reason list), ratings out of 5, the employee's and the manager's
-- feedback, rehire with remarks, and confidential notes only HR with the
-- permission sees. exit_interview_notes stays the employee's feedback.
ALTER TABLE "rndtechnosoft_employee_separations"
  ADD COLUMN "exit_interview_conducted_by_tenant_member_id" UUID,
  ADD COLUMN "primary_exit_reason" VARCHAR(48),
  ADD COLUMN "secondary_exit_reason" VARCHAR(48),
  ADD COLUMN "workplace_rating" SMALLINT,
  ADD COLUMN "compensation_rating" SMALLINT,
  ADD COLUMN "growth_rating" SMALLINT,
  ADD COLUMN "rehire_remarks" VARCHAR(1000),
  ADD COLUMN "exit_interview_confidential_notes" VARCHAR(4000),
  ADD COLUMN "manager_feedback" VARCHAR(4000),
  ADD COLUMN "manager_feedback_by_tenant_member_id" UUID,
  ADD COLUMN "manager_feedback_at" TIMESTAMPTZ(6);

ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_interview_conducted_by"
  FOREIGN KEY ("tenant_id", "exit_interview_conducted_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_manager_feedback_by"
  FOREIGN KEY ("tenant_id", "manager_feedback_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Interviews recorded before this had no reason or interviewer: whoever
-- recorded it held it, and the reason follows the kind of exit.
UPDATE "rndtechnosoft_employee_separations"
SET "exit_interview_conducted_by_tenant_member_id" = "exit_interview_recorded_by_tenant_member_id",
    "primary_exit_reason" = CASE "separation_type" WHEN 'RETIREMENT' THEN 'RETIREMENT' WHEN 'TERMINATION' THEN 'TERMINATION' WHEN 'CONTRACT_END' THEN 'CONTRACT_COMPLETION' ELSE 'OTHER' END
WHERE "exit_interview_date" IS NOT NULL AND "primary_exit_reason" IS NULL;

ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_interview_reason"
  CHECK ("exit_interview_date" IS NULL OR "primary_exit_reason" IS NOT NULL);
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_secondary_reason"
  CHECK ("secondary_exit_reason" IS NULL OR "secondary_exit_reason" <> "primary_exit_reason");
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_ratings"
  CHECK (("workplace_rating" IS NULL OR "workplace_rating" BETWEEN 1 AND 5)
     AND ("compensation_rating" IS NULL OR "compensation_rating" BETWEEN 1 AND 5)
     AND ("growth_rating" IS NULL OR "growth_rating" BETWEEN 1 AND 5));
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_manager_feedback"
  CHECK (("manager_feedback" IS NULL) = ("manager_feedback_by_tenant_member_id" IS NULL) AND ("manager_feedback" IS NULL) = ("manager_feedback_at" IS NULL));
-- Exit reasons are reported on.
CREATE INDEX "ix_employee_separations_reason" ON "rndtechnosoft_employee_separations"("tenant_id", "primary_exit_reason");

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES (gen_random_uuid(), 'offboarding.interview.confidential', 'HRMS', 'See and write the confidential HR-only notes of exit interviews')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.interview.confidential'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.interview.confidential'
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
