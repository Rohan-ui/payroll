-- Documents & letterheads: document templates and letterheads move from
-- onboarding to the organization, shared by offers, quotations and appraisal
-- letters. The tables were already general; this adds the new kinds and
-- replaces the onboarding template permissions with organization ones,
-- keeping everyone's access as it was.

ALTER TABLE "rndtechnosoft_document_templates" DROP CONSTRAINT "ck_document_templates_kind";
ALTER TABLE "rndtechnosoft_document_templates"
  ADD CONSTRAINT "ck_document_templates_kind" CHECK ("template_kind" IN ('OFFER_LETTER', 'JOINING_LETTER', 'EMPLOYMENT_AGREEMENT', 'CERTIFICATE', 'QUOTATION', 'APPRAISAL_LETTER'));

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'documents.view', 'ORGANIZATION', 'View document templates and letterheads'),
  (gen_random_uuid(), 'documents.templates.manage', 'ORGANIZATION', 'Create and edit document templates (offer letters, quotations, appraisal letters)'),
  (gen_random_uuid(), 'documents.templates.approve', 'ORGANIZATION', 'Approve document templates for use, and manage letterheads')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

-- Carry each role's onboarding template access over: manage to manage,
-- approve to approve, and either to view (which lists templates and letterheads).
INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), rp.tenant_id, rp.role_id, np.id
FROM rndtechnosoft_role_permissions rp
JOIN rndtechnosoft_permissions op ON op.id = rp.permission_id
JOIN rndtechnosoft_permissions np ON np.permission_code = CASE op.permission_code
  WHEN 'onboarding.templates.manage' THEN 'documents.templates.manage'
  WHEN 'onboarding.templates.approve' THEN 'documents.templates.approve'
END
WHERE op.permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT DISTINCT ON (rp.tenant_id, rp.role_id) gen_random_uuid(), rp.tenant_id, rp.role_id, np.id
FROM rndtechnosoft_role_permissions rp
JOIN rndtechnosoft_permissions op ON op.id = rp.permission_id
JOIN rndtechnosoft_permissions np ON np.permission_code = 'documents.view'
WHERE op.permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Administrators get all three, whatever they held before.
INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('documents.view', 'documents.templates.manage', 'documents.templates.approve')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Role templates (used for new workspaces' roles), the same way.
INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), tp.role_template_id, np.id
FROM rndtechnosoft_role_template_permissions tp
JOIN rndtechnosoft_permissions op ON op.id = tp.permission_id
JOIN rndtechnosoft_permissions np ON np.permission_code IN (
  CASE op.permission_code WHEN 'onboarding.templates.manage' THEN 'documents.templates.manage' ELSE 'documents.templates.approve' END,
  'documents.view'
)
WHERE op.permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve')
ON CONFLICT DO NOTHING;

-- The onboarding template permissions are retired: nothing checks them any more.
DELETE FROM rndtechnosoft_role_permissions
WHERE permission_id IN (SELECT id FROM rndtechnosoft_permissions WHERE permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve'));
DELETE FROM rndtechnosoft_role_template_permissions
WHERE permission_id IN (SELECT id FROM rndtechnosoft_permissions WHERE permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve'));
DELETE FROM rndtechnosoft_permissions WHERE permission_code IN ('onboarding.templates.manage', 'onboarding.templates.approve');
