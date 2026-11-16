-- Exporting the employee directory is a bulk copy of personal data, so it is
-- its own permission. Mirrors src/common/access/access-catalog.ts. Every
-- workspace owner (ADMIN) role holds every permission, so it gets this one.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES (gen_random_uuid(), 'people.export', 'HRMS', 'Export the employee directory to Excel')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'people.export'
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
