-- Exit-checklist ownership: each item says what is needed, whether it must be
-- done before the exit completes, by when, and who in the owning team has it.
-- A waiver keeps its own reason, apart from the remarks.
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD COLUMN "item_description" VARCHAR(1000);
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD COLUMN "is_required" BOOLEAN NOT NULL DEFAULT true;
-- NULL means by the last working day.
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD COLUMN "due_date" DATE;
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD COLUMN "assigned_tenant_member_id" UUID;
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD COLUMN "waiver_reason" VARCHAR(500);
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD CONSTRAINT "fk_separation_clearance_items_assigned"
  FOREIGN KEY ("tenant_id", "assigned_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A waiver's reason now has its own column: the old rule (a waived item has a
-- note) becomes "a waived item has a waiver reason". Items waived before now
-- kept the reason in the note, so it moves across.
ALTER TABLE "rndtechnosoft_separation_clearance_items" DROP CONSTRAINT "ck_separation_clearance_items_waiver_note";
UPDATE "rndtechnosoft_separation_clearance_items" SET "waiver_reason" = "clearance_note", "clearance_note" = NULL
WHERE "item_status" = 'WAIVED' AND "waiver_reason" IS NULL;
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD CONSTRAINT "ck_separation_clearance_items_waiver"
  CHECK ("item_status" <> 'WAIVED' OR ("waiver_reason" IS NOT NULL AND length(btrim("waiver_reason")) > 0));
-- The owners' inbox: open items by team.
CREATE INDEX "ix_separation_clearance_items_open" ON "rndtechnosoft_separation_clearance_items"("tenant_id", "item_status", "clearance_team");

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'offboarding.clearance.it', 'HRMS', 'Clear or waive IT’s exit-checklist items'),
  (gen_random_uuid(), 'offboarding.clearance.admin', 'HRMS', 'Clear or waive Admin’s exit-checklist items'),
  (gen_random_uuid(), 'offboarding.clearance.finance', 'HRMS', 'Clear or waive Finance’s exit-checklist items'),
  (gen_random_uuid(), 'offboarding.clearance.hr', 'HRMS', 'Clear or waive HR’s exit-checklist items'),
  (gen_random_uuid(), 'offboarding.clearance.update', 'HRMS', 'Override: clear or waive any team’s exit-checklist items')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.clearance.it', 'offboarding.clearance.admin', 'offboarding.clearance.finance', 'offboarding.clearance.hr')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- HR & Accountant roles clear HR's and Finance's items; they keep the override they had.
INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.clearance.finance', 'offboarding.clearance.hr')
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
