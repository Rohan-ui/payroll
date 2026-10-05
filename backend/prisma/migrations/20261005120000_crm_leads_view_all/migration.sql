-- Lead visibility: a member sees only the leads assigned to them, unless their
-- role holds leads.view_all, which shows every lead of the workspace,
-- unassigned leads and other members' leads included.
--
-- leads.view_all is new. Mirrors src/common/access/access-catalog.ts;
-- test/organization-settings.spec.ts fails if the database drifts from it.
-- Every workspace owner (ADMIN) role is granted it; any other role gets it only
-- when an administrator grants it on the Roles page.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'leads.view_all', 'CRM', 'See every lead, including unassigned leads and other members'' leads')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'leads.view_all'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
