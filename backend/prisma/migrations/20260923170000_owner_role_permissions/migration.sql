-- Workspace owner (ADMIN) roles hold their permissions as role_permissions rows.
--
-- The tenant_access_control migration seeded grants only for HR_ACCOUNTANT and
-- MANAGER and relied on a code-level rule that treated role code ADMIN as
-- holding every permission. That rule is removed: authorization now reads only
-- role_permissions, so every existing ADMIN role is granted the full catalog
-- here. New ADMIN roles get the same grants from grantDefaultRolePermissions
-- (src/common/access/role-defaults.ts) when they are created.

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN (
  'organization.view', 'organization.update',
  'users.view', 'users.create', 'users.update', 'users.delete',
  'roles.view', 'roles.create', 'roles.update', 'roles.delete',
  'permissions.view',
  'modules.view', 'modules.update',
  'leads.view', 'leads.create', 'leads.update', 'leads.delete'
)
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
