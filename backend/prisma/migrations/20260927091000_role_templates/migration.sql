-- Role templates: platform-wide blueprints for workspace roles, managed from
-- the platform console. A template's grants are copied onto a workspace role
-- when that role is first created from it; each workspace then owns its role
-- and its rows in rndtechnosoft_role_permissions, so editing a template never
-- changes the access of a role that already exists.
--
-- Templates reference the same granular permission catalog as workspace
-- roles. The Administrator (ADMIN) role is not a template: it always holds
-- every permission, which the application enforces.
CREATE TABLE rndtechnosoft_role_templates (
  id uuid PRIMARY KEY,
  template_code varchar(64) NOT NULL,
  template_name varchar(120) NOT NULL,
  description varchar(500),
  -- Built-in templates the platform itself relies on: editable, never deleted.
  is_system_template boolean NOT NULL DEFAULT false,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_role_templates_code UNIQUE (template_code),
  CONSTRAINT ck_role_templates_code CHECK (template_code ~ '^[A-Z][A-Z0-9_]{1,63}$' AND template_code <> 'ADMIN')
);

CREATE TABLE rndtechnosoft_role_template_permissions (
  id uuid PRIMARY KEY,
  role_template_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_role_template_permissions UNIQUE (role_template_id, permission_id),
  CONSTRAINT fk_role_template_permissions_template FOREIGN KEY (role_template_id) REFERENCES rndtechnosoft_role_templates (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_role_template_permissions_permission FOREIGN KEY (permission_id) REFERENCES rndtechnosoft_permissions (id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX ix_role_template_permissions_permission ON rndtechnosoft_role_template_permissions (permission_id);

-- The built-in templates, with the starting grants they had in code
-- (DEFAULT_ROLE_PERMISSIONS in src/common/access/access-catalog.ts).
INSERT INTO rndtechnosoft_role_templates (id, template_code, template_name, description, is_system_template)
VALUES
  (gen_random_uuid(), 'HR_ACCOUNTANT', 'HR & Accountant', 'People, attendance and payroll processing.', true),
  (gen_random_uuid(), 'MANAGER', 'Manager', 'CRM pipelines, leads, quotations and analytics.', true),
  (gen_random_uuid(), 'EMPLOYEE', 'Employee', 'Dashboard and help only; everything else is granted explicitly.', true)
ON CONFLICT (template_code) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM (VALUES
  ('HR_ACCOUNTANT', 'dashboard.view'), ('HR_ACCOUNTANT', 'help.view'),
  ('HR_ACCOUNTANT', 'organization.view'), ('HR_ACCOUNTANT', 'users.view'), ('HR_ACCOUNTANT', 'roles.view'),
  ('HR_ACCOUNTANT', 'permissions.view'), ('HR_ACCOUNTANT', 'modules.view'),
  ('HR_ACCOUNTANT', 'people.view'), ('HR_ACCOUNTANT', 'people.create'), ('HR_ACCOUNTANT', 'people.update'),
  ('HR_ACCOUNTANT', 'attendance.view'), ('HR_ACCOUNTANT', 'attendance.update'),
  ('HR_ACCOUNTANT', 'payroll.view'), ('HR_ACCOUNTANT', 'payroll.process'), ('HR_ACCOUNTANT', 'payslips.view'),
  ('MANAGER', 'dashboard.view'), ('MANAGER', 'help.view'),
  ('MANAGER', 'organization.view'), ('MANAGER', 'users.view'), ('MANAGER', 'roles.view'),
  ('MANAGER', 'permissions.view'), ('MANAGER', 'modules.view'),
  ('MANAGER', 'pipelines.view'), ('MANAGER', 'pipelines.create'), ('MANAGER', 'pipelines.update'),
  ('MANAGER', 'leads.view'), ('MANAGER', 'leads.create'), ('MANAGER', 'leads.update'),
  ('MANAGER', 'quotations.view'), ('MANAGER', 'quotations.create'), ('MANAGER', 'quotations.update'),
  ('MANAGER', 'analytics.view'), ('MANAGER', 'masters.services.view'), ('MANAGER', 'masters.sources.view'),
  ('EMPLOYEE', 'dashboard.view'), ('EMPLOYEE', 'help.view')
) AS grants (template_code, permission_code)
JOIN rndtechnosoft_role_templates t ON t.template_code = grants.template_code
JOIN rndtechnosoft_permissions p ON p.permission_code = grants.permission_code
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
