-- Lost reasons can be added from CRM Masters.
--
-- masters.lost_reasons.create is new. Mirrors src/common/access/access-catalog.ts;
-- test/organization-settings.spec.ts fails if the database drifts from it.
-- Every workspace owner (ADMIN) role, and every role and role template that can
-- already edit lost reasons, is granted it.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'masters.lost_reasons.create', 'CRM', 'Create lost reasons')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, add_permission.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions add_permission ON add_permission.permission_code = 'masters.lost_reasons.create'
WHERE r.role_code = 'ADMIN'
   OR EXISTS (
     SELECT 1
     FROM rndtechnosoft_role_permissions rp
     JOIN rndtechnosoft_permissions edit ON edit.id = rp.permission_id
     WHERE rp.role_id = r.id
       AND rp.tenant_id = r.tenant_id
       AND edit.permission_code = 'masters.lost_reasons.update'
   )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), tp.role_template_id, add_permission.id
FROM rndtechnosoft_role_template_permissions tp
JOIN rndtechnosoft_permissions edit ON edit.id = tp.permission_id AND edit.permission_code = 'masters.lost_reasons.update'
JOIN rndtechnosoft_permissions add_permission ON add_permission.permission_code = 'masters.lost_reasons.create'
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
