-- Lead sources can be edited (name, channel group, active) from CRM Masters.
--
-- masters.sources.update is new. Mirrors src/common/access/access-catalog.ts;
-- test/organization-settings.spec.ts fails if the database drifts from it.
-- Every role and role template that can already add lead sources, and every
-- workspace owner (ADMIN) role, is granted it, so whoever could add a source
-- can now correct one.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'masters.sources.update', 'CRM', 'Edit lead sources')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, edit.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions edit ON edit.permission_code = 'masters.sources.update'
WHERE r.role_code = 'ADMIN'
   OR EXISTS (
     SELECT 1
     FROM rndtechnosoft_role_permissions rp
     JOIN rndtechnosoft_permissions create_permission ON create_permission.id = rp.permission_id
     WHERE rp.role_id = r.id
       AND rp.tenant_id = r.tenant_id
       AND create_permission.permission_code = 'masters.sources.create'
   )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), tp.role_template_id, edit.id
FROM rndtechnosoft_role_template_permissions tp
JOIN rndtechnosoft_permissions create_permission ON create_permission.id = tp.permission_id AND create_permission.permission_code = 'masters.sources.create'
JOIN rndtechnosoft_permissions edit ON edit.permission_code = 'masters.sources.update'
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
