-- Offboarding emails are sent and logged like onboarding's: one row per
-- event and recipient (the idempotency key), its delivery status and failure
-- reason, now with the exit it belongs to and how many times it was tried.
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD COLUMN "separation_id" UUID;
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD CONSTRAINT "fk_onboarding_notifications_separation"
  FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD CONSTRAINT "ck_onboarding_notifications_attempts" CHECK ("attempt_count" >= 1);
CREATE INDEX "ix_onboarding_notifications_separation" ON "rndtechnosoft_onboarding_notifications"("tenant_id", "separation_id", "created_at");

-- A manager's comments and handover notes on a direct report's exit.
CREATE TABLE "rndtechnosoft_separation_comments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "separation_id" UUID NOT NULL,
  "comment_kind" VARCHAR(16) NOT NULL,
  "comment_body" VARCHAR(2000) NOT NULL,
  "author_tenant_member_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_separation_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_separation_comments_kind" CHECK ("comment_kind" IN ('COMMENT', 'HANDOVER')),
  CONSTRAINT "ck_separation_comments_body" CHECK (length(btrim("comment_body")) > 0),
  CONSTRAINT "fk_separation_comments_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_separation_comments_author" FOREIGN KEY ("tenant_id", "author_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_separation_comments_separation" ON "rndtechnosoft_separation_comments"("tenant_id", "separation_id", "created_at");

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES (gen_random_uuid(), 'offboarding.team.view', 'HRMS', 'See their direct reports’ exits, add comments and handover notes, and clear manager checklist items (managers only ever see their own team)')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

-- Like My resignation, every role has it: what a member sees is decided by who reports to them.
INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.team.view'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.team.view'
ON CONFLICT DO NOTHING;
