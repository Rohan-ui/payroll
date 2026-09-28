-- Approving an attendance correction request gets its own permission.
--
-- It used to be part of attendance.adjust (direct entry, edit and bulk-mark).
-- Mirrors src/common/access/access-catalog.ts; test/organization-settings.spec.ts
-- fails if the database drifts from it.
--
-- Every role that holds attendance.adjust today, which includes every workspace
-- owner (ADMIN) role, is granted attendance.approve, so nobody loses the
-- ability to approve corrections. Administrators can then separate the two.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'attendance.approve', 'HRMS', 'Approve attendance correction requests'),
  (gen_random_uuid(), 'attendance.adjust', 'HRMS', 'Enter, edit or bulk-mark attendance')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, approve.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions approve ON approve.permission_code = 'attendance.approve'
WHERE r.role_code = 'ADMIN'
   OR EXISTS (
     SELECT 1
     FROM rndtechnosoft_role_permissions rp
     JOIN rndtechnosoft_permissions adjust ON adjust.id = rp.permission_id
     WHERE rp.role_id = r.id
       AND rp.tenant_id = r.tenant_id
       AND adjust.permission_code = 'attendance.adjust'
   )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
