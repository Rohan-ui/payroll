-- Tenant access control.
--
-- 1. A fixed, platform-global permission catalog. The keys must match
--    src/common/access/access-catalog.ts; test/organization-settings.spec.ts
--    fails if the two drift apart.
-- 2. Default grants for the built-in HR_ACCOUNTANT and MANAGER roles, so they
--    keep read access to workspace settings and their CRM lead access now that
--    permissions are enforced. ADMIN holds every key implicitly and gets no rows.
-- 3. Integrity rules for membership and role lifecycles, and unique role names
--    within a workspace.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'organization.view',   'ORGANIZATION', 'View organization settings'),
  (gen_random_uuid(), 'organization.update', 'ORGANIZATION', 'Edit organization profile, SMTP and WhatsApp settings'),
  (gen_random_uuid(), 'users.view',          'USERS',        'View team members'),
  (gen_random_uuid(), 'users.create',        'USERS',        'Add team members'),
  (gen_random_uuid(), 'users.update',        'USERS',        'Edit team members, their roles and status'),
  (gen_random_uuid(), 'users.delete',        'USERS',        'Remove team members'),
  (gen_random_uuid(), 'roles.view',          'ROLES',        'View roles'),
  (gen_random_uuid(), 'roles.create',        'ROLES',        'Create roles'),
  (gen_random_uuid(), 'roles.update',        'ROLES',        'Edit roles and the permissions they grant'),
  (gen_random_uuid(), 'roles.delete',        'ROLES',        'Delete roles'),
  (gen_random_uuid(), 'permissions.view',    'ROLES',        'View the permission catalog'),
  (gen_random_uuid(), 'modules.view',        'MODULES',      'View workspace modules'),
  (gen_random_uuid(), 'modules.update',      'MODULES',      'Turn workspace modules on or off'),
  (gen_random_uuid(), 'leads.view',          'CRM',          'View leads'),
  (gen_random_uuid(), 'leads.create',        'CRM',          'Create and import leads'),
  (gen_random_uuid(), 'leads.update',        'CRM',          'Edit leads'),
  (gen_random_uuid(), 'leads.delete',        'CRM',          'Delete leads')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN (
  VALUES
    ('organization.view'), ('users.view'), ('roles.view'), ('permissions.view'), ('modules.view'),
    ('leads.view'), ('leads.create'), ('leads.update'), ('leads.delete')
) AS g(permission_code) ON TRUE
JOIN rndtechnosoft_permissions p ON p.permission_code = g.permission_code
WHERE r.role_code IN ('HR_ACCOUNTANT', 'MANAGER')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- ACTIVE members can sign in; SUSPENDED members are paused by a workspace
-- administrator; ARCHIVED members were removed from the workspace.
ALTER TABLE rndtechnosoft_tenant_members
  ADD CONSTRAINT ck_tenant_members_status
  CHECK (membership_status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'));

ALTER TABLE rndtechnosoft_roles
  ADD CONSTRAINT ck_roles_status
  CHECK (role_status IN ('ACTIVE', 'ARCHIVED'));

-- Two live roles in one workspace may not share a name, ignoring case.
CREATE UNIQUE INDEX uq_roles_2
  ON rndtechnosoft_roles (tenant_id, lower(role_name))
  WHERE role_status = 'ACTIVE';
