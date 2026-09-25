-- Business modules: HRMS (People, Attendance) and Finance (Payroll,
-- Payslips, Bookkeeping), with CRM & Sales unchanged.
--
-- Generated from src/common/access/access-catalog.ts, the single source of
-- truth; test/organization-settings.spec.ts fails if the database drifts from it.
--
-- 1. Re-assert the permission catalog. module_code now records the workspace
--    module that owns each permission (CRM, HRMS or FINANCE), or the sidebar
--    section for workspace-wide ones (DASHBOARD, ORGANIZATION, HELP). Keys
--    and grants are unchanged, so no role gains or loses anything.
-- 2. The Payroll module switch became part of Finance. A workspace keeps
--    Finance on exactly when it had Payroll on (Bookkeeping could only be on
--    while Payroll was), so nobody loses payroll; the PAYROLL switch is dropped.

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'dashboard.view', 'DASHBOARD', 'View the dashboard'),
  (gen_random_uuid(), 'outreach.view', 'CRM', 'View outreach cadences'),
  (gen_random_uuid(), 'outreach.create', 'CRM', 'Enroll leads in outreach and load sample leads'),
  (gen_random_uuid(), 'outreach.update', 'CRM', 'Complete outreach steps and change reply branches'),
  (gen_random_uuid(), 'pipelines.view', 'CRM', 'View pipelines and stages'),
  (gen_random_uuid(), 'pipelines.create', 'CRM', 'Create pipelines'),
  (gen_random_uuid(), 'pipelines.update', 'CRM', 'Add, edit, reorder and remove pipeline stages'),
  (gen_random_uuid(), 'pipelines.delete', 'CRM', 'Delete pipelines'),
  (gen_random_uuid(), 'leads.view', 'CRM', 'View leads and their activity'),
  (gen_random_uuid(), 'leads.create', 'CRM', 'Create and import leads'),
  (gen_random_uuid(), 'leads.update', 'CRM', 'Edit leads, log activity and mark deals won'),
  (gen_random_uuid(), 'leads.delete', 'CRM', 'Delete leads'),
  (gen_random_uuid(), 'leads.export', 'CRM', 'Export leads'),
  (gen_random_uuid(), 'marketing.view', 'CRM', 'Open Email & Marketing'),
  (gen_random_uuid(), 'followups.view', 'CRM', 'View follow-ups'),
  (gen_random_uuid(), 'followups.create', 'CRM', 'Schedule follow-ups'),
  (gen_random_uuid(), 'followups.update', 'CRM', 'Update and complete follow-ups'),
  (gen_random_uuid(), 'followups.delete', 'CRM', 'Delete follow-ups'),
  (gen_random_uuid(), 'meetings.view', 'CRM', 'View meetings'),
  (gen_random_uuid(), 'meetings.create', 'CRM', 'Schedule meetings'),
  (gen_random_uuid(), 'meetings.update', 'CRM', 'Update meetings and record minutes'),
  (gen_random_uuid(), 'meetings.delete', 'CRM', 'Delete meetings'),
  (gen_random_uuid(), 'quotations.view', 'CRM', 'View quotations and templates'),
  (gen_random_uuid(), 'quotations.create', 'CRM', 'Create quotations'),
  (gen_random_uuid(), 'quotations.update', 'CRM', 'Edit quotations and change their status'),
  (gen_random_uuid(), 'quotations.delete', 'CRM', 'Delete quotations'),
  (gen_random_uuid(), 'clients.view', 'CRM', 'View clients'),
  (gen_random_uuid(), 'clients.create', 'CRM', 'Create clients'),
  (gen_random_uuid(), 'clients.update', 'CRM', 'Edit clients'),
  (gen_random_uuid(), 'analytics.view', 'CRM', 'View CRM reports and analytics'),
  (gen_random_uuid(), 'masters.services.view', 'CRM', 'View services'),
  (gen_random_uuid(), 'masters.services.create', 'CRM', 'Create services'),
  (gen_random_uuid(), 'masters.services.update', 'CRM', 'Edit services'),
  (gen_random_uuid(), 'masters.services.delete', 'CRM', 'Delete services'),
  (gen_random_uuid(), 'masters.sources.view', 'CRM', 'View lead sources'),
  (gen_random_uuid(), 'masters.sources.create', 'CRM', 'Create lead sources'),
  (gen_random_uuid(), 'masters.sources.delete', 'CRM', 'Delete lead sources'),
  (gen_random_uuid(), 'masters.lost_reasons.view', 'CRM', 'View lost reasons'),
  (gen_random_uuid(), 'masters.industries.view', 'CRM', 'View industries'),
  (gen_random_uuid(), 'masters.industries.create', 'CRM', 'Create industries and sub-industries'),
  (gen_random_uuid(), 'masters.industries.update', 'CRM', 'Edit industries and sub-industries'),
  (gen_random_uuid(), 'masters.industries.delete', 'CRM', 'Delete industries and sub-industries'),
  (gen_random_uuid(), 'masters.sop.view', 'CRM', 'View the outreach playbook (steps and reply branches)'),
  (gen_random_uuid(), 'audit.view', 'CRM', 'View the CRM audit trail'),
  (gen_random_uuid(), 'organization.view', 'ORGANIZATION', 'View organization settings'),
  (gen_random_uuid(), 'organization.update', 'ORGANIZATION', 'Edit organization profile, SMTP and WhatsApp settings'),
  (gen_random_uuid(), 'users.view', 'ORGANIZATION', 'View team members'),
  (gen_random_uuid(), 'users.create', 'ORGANIZATION', 'Add team members'),
  (gen_random_uuid(), 'users.update', 'ORGANIZATION', 'Edit team members, their roles and status'),
  (gen_random_uuid(), 'users.delete', 'ORGANIZATION', 'Remove team members'),
  (gen_random_uuid(), 'roles.view', 'ORGANIZATION', 'View roles'),
  (gen_random_uuid(), 'roles.create', 'ORGANIZATION', 'Create roles'),
  (gen_random_uuid(), 'roles.update', 'ORGANIZATION', 'Edit roles and the permissions they grant'),
  (gen_random_uuid(), 'roles.delete', 'ORGANIZATION', 'Delete roles'),
  (gen_random_uuid(), 'permissions.view', 'ORGANIZATION', 'View the permission catalog'),
  (gen_random_uuid(), 'modules.view', 'ORGANIZATION', 'View workspace modules'),
  (gen_random_uuid(), 'modules.update', 'ORGANIZATION', 'Turn workspace modules on or off'),
  (gen_random_uuid(), 'people.view', 'HRMS', 'View employees'),
  (gen_random_uuid(), 'people.create', 'HRMS', 'Add employees'),
  (gen_random_uuid(), 'people.update', 'HRMS', 'Edit employees'),
  (gen_random_uuid(), 'people.bank.update', 'HRMS', 'Add or change employee bank details'),
  (gen_random_uuid(), 'attendance.view', 'HRMS', 'View attendance'),
  (gen_random_uuid(), 'attendance.create', 'HRMS', 'Record clock-in and clock-out punches'),
  (gen_random_uuid(), 'attendance.update', 'HRMS', 'Request attendance corrections'),
  (gen_random_uuid(), 'attendance.adjust', 'HRMS', 'Enter, edit or bulk-mark attendance and approve corrections'),
  (gen_random_uuid(), 'attendance.delete', 'HRMS', 'Delete attendance records'),
  (gen_random_uuid(), 'leave.view', 'HRMS', 'View leave types and balances'),
  (gen_random_uuid(), 'leave.create', 'HRMS', 'Submit leave requests'),
  (gen_random_uuid(), 'leave.approve', 'HRMS', 'Approve leave requests'),
  (gen_random_uuid(), 'leave.configure', 'HRMS', 'Create leave types'),
  (gen_random_uuid(), 'attendance.integration.view', 'HRMS', 'View biometric device (COSEC) settings and data'),
  (gen_random_uuid(), 'attendance.integration.update', 'HRMS', 'Change and test biometric device (COSEC) settings'),
  (gen_random_uuid(), 'attendance.sync', 'HRMS', 'Sync attendance from the biometric device'),
  (gen_random_uuid(), 'payroll.view', 'FINANCE', 'View payroll periods and runs'),
  (gen_random_uuid(), 'payroll.create', 'FINANCE', 'Create payroll periods and runs'),
  (gen_random_uuid(), 'payroll.process', 'FINANCE', 'Calculate payroll runs'),
  (gen_random_uuid(), 'payroll.approve', 'FINANCE', 'Approve payroll runs'),
  (gen_random_uuid(), 'payroll.finalize', 'FINANCE', 'Finalize payroll runs (irreversible)'),
  (gen_random_uuid(), 'salary.view', 'FINANCE', 'View salary components, structures and employee salaries'),
  (gen_random_uuid(), 'salary.configure', 'FINANCE', 'Create salary components and structures'),
  (gen_random_uuid(), 'salary.assign', 'FINANCE', 'Assign salaries to employees'),
  (gen_random_uuid(), 'payslips.view', 'FINANCE', 'View payslips'),
  (gen_random_uuid(), 'bookkeeping.financial_years.view', 'FINANCE', 'View financial years'),
  (gen_random_uuid(), 'bookkeeping.financial_years.create', 'FINANCE', 'Create financial years'),
  (gen_random_uuid(), 'bookkeeping.financial_years.close', 'FINANCE', 'Close financial years'),
  (gen_random_uuid(), 'bookkeeping.ledgers.view', 'FINANCE', 'View ledgers and the trial balance'),
  (gen_random_uuid(), 'bookkeeping.entries.view', 'FINANCE', 'View journal entries'),
  (gen_random_uuid(), 'bookkeeping.entries.post', 'FINANCE', 'Post payroll accounting entries'),
  (gen_random_uuid(), 'reports.view', 'FINANCE', 'View reports'),
  (gen_random_uuid(), 'compliance.view', 'HRMS', 'View compliance'),
  (gen_random_uuid(), 'help.view', 'HELP', 'View help')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

WITH payroll AS (
  SELECT s.tenant_id,
         COALESCE(
           (array_agg((x.e->>'is_enabled')::boolean ORDER BY x.ord DESC)
              FILTER (WHERE jsonb_typeof(x.e->'is_enabled') = 'boolean'))[1],
           true
         ) AS enabled
  FROM rndtechnosoft_tenant_settings s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.settings->'modules') = 'array' THEN s.settings->'modules' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS x(e, ord)
  WHERE x.e->>'id' = 'PAYROLL'
  GROUP BY s.tenant_id
)
UPDATE rndtechnosoft_tenant_settings s
SET settings = jsonb_set(
  s.settings,
  '{modules}',
  COALESCE(
    (SELECT jsonb_agg(
              CASE WHEN x.e->>'id' = 'FINANCE' THEN x.e || jsonb_build_object('is_enabled', p.enabled) ELSE x.e END
              ORDER BY x.ord)
     FROM jsonb_array_elements(s.settings->'modules') WITH ORDINALITY AS x(e, ord)
     WHERE x.e->>'id' IS DISTINCT FROM 'PAYROLL'),
    '[]'::jsonb
  ) || CASE
         WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(s.settings->'modules') e WHERE e->>'id' = 'FINANCE')
           THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object('id', 'FINANCE', 'is_enabled', p.enabled))
       END
)
FROM payroll p
WHERE p.tenant_id = s.tenant_id;
