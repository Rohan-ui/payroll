-- A workspace's own objection strategies (outreach reply branches), editable in
-- CRM Masters, and deleting lost reasons.
--
-- The strategies table existed but the app never read it: every workspace ran
-- on the default strategies in code. A workspace with no rows still does; its
-- first change copies the defaults in, so from then on it owns them.
--
-- 0. Rows written only by the demo seed script (prisma/seed-voogyo.ts), which
--    no screen or cadence ever used, are removed. They use different keys and
--    have no WhatsApp message, so reading them would silently change or blank
--    the outreach replies of those workspaces; removing them keeps every
--    workspace on the strategies it sees and uses today.
-- 1. Columns the editor saves: next lead temperature, WhatsApp and email
--    messages, last update time.
-- 2. One strategy per key in a workspace; a known temperature.
-- 3. masters.sop.update now also covers strategies (renamed to say so), and
--    masters.lost_reasons.delete is new, granted to every workspace owner
--    (ADMIN) role. Mirrors src/common/access/access-catalog.ts.

DELETE FROM "rndtechnosoft_crm_sop_reply_branches_master";

ALTER TABLE "rndtechnosoft_crm_sop_reply_branches_master"
  ADD COLUMN "next_lead_temperature" VARCHAR(8) NOT NULL DEFAULT 'WARM',
  ADD COLUMN "whatsapp_message" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "email_subject" VARCHAR(255),
  ADD COLUMN "email_body" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD CONSTRAINT "ck_crm_sop_reply_branches_master_temperature" CHECK ("next_lead_temperature" IN ('HOT', 'WARM', 'COLD', 'LOST'));

CREATE UNIQUE INDEX "uq_crm_sop_reply_branches_master_tenant_key" ON "rndtechnosoft_crm_sop_reply_branches_master"("tenant_id", "branch_key");

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'masters.sop.update', 'CRM', 'Add, edit and remove outreach playbook steps and objection strategies'),
  (gen_random_uuid(), 'masters.lost_reasons.delete', 'CRM', 'Delete lost reasons')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'masters.lost_reasons.delete'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
