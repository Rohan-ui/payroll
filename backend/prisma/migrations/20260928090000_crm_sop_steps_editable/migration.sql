-- A workspace's own outreach playbook (30-Day SOP steps), editable in CRM Masters.
--
-- The table existed but the app never read it: every workspace ran on the
-- default steps in code. A workspace with no rows still does; its first change
-- copies the defaults in, so from then on it owns its playbook.
--
-- 0. Rows written only by the demo seed script (prisma/seed-voogyo.ts), which
--    no screen or cadence ever used, are removed. They have no message
--    templates, so reading them would silently blank the outreach messages of
--    those workspaces; removing them keeps every workspace on the playbook it
--    sees and runs today.
-- 1. Columns the step editor saves: per-channel message templates (flexible
--    configuration, so JSONB), timing guide, role note and last update time.
--    step_index is dropped: a step's position follows from its day number.
-- 2. One step per day per workspace, and sane day numbers.
-- 3. masters.sop.update, granted to every workspace owner (ADMIN) role.
--    Mirrors src/common/access/access-catalog.ts.

DELETE FROM "rndtechnosoft_crm_sop_steps_master";

ALTER TABLE "rndtechnosoft_crm_sop_steps_master"
  DROP COLUMN "step_index",
  ADD COLUMN "timing_guide" VARCHAR(255),
  ADD COLUMN "role_note" VARCHAR(500),
  ADD COLUMN "templates" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD CONSTRAINT "ck_crm_sop_steps_master_day_number" CHECK ("day_number" BETWEEN 1 AND 60);

CREATE UNIQUE INDEX "uq_crm_sop_steps_master_tenant_day" ON "rndtechnosoft_crm_sop_steps_master"("tenant_id", "day_number");

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'masters.sop.update', 'CRM', 'Add, edit and remove outreach playbook steps')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'masters.sop.update'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
