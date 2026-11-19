-- Exit letters (experience, relieving, full and final statement) are stored
-- with the other HR letters, against the employee and their exit. Not every
-- employee came through onboarding, so a letter no longer needs a candidate:
-- it needs a candidate, or an employee and their exit.
ALTER TABLE "rndtechnosoft_candidate_documents" ALTER COLUMN "candidate_id" DROP NOT NULL;
ALTER TABLE "rndtechnosoft_candidate_documents" ADD CONSTRAINT "ck_candidate_documents_owner"
  CHECK ("candidate_id" IS NOT NULL OR ("employee_id" IS NOT NULL AND "separation_id" IS NOT NULL));
-- The exit page lists an exit's letters.
CREATE INDEX IF NOT EXISTS "ix_candidate_documents_separation" ON "rndtechnosoft_candidate_documents"("tenant_id", "separation_id", "document_type");

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'offboarding.documents.manage', 'HRMS', 'Generate and regenerate exit letters and the settlement statement as drafts'),
  (gen_random_uuid(), 'offboarding.documents.issue', 'HRMS', 'Issue exit letters as official, after which they can no longer change')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.documents.manage', 'offboarding.documents.issue')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.documents.manage', 'offboarding.documents.issue')
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
