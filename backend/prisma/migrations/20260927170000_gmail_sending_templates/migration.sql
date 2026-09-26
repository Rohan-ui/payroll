-- Gmail sends and template writes require an explicit permission. Existing
-- holders of the Email & Marketing screen retain their current capabilities.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES (gen_random_uuid(), 'marketing.manage', 'CRM', 'Send Gmail messages and manage templates')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), rp.tenant_id, rp.role_id, manage.id
FROM rndtechnosoft_role_permissions rp
JOIN rndtechnosoft_permissions view_permission
  ON view_permission.id = rp.permission_id
 AND view_permission.permission_code = 'marketing.view'
JOIN rndtechnosoft_permissions manage
  ON manage.permission_code = 'marketing.manage'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

CREATE TABLE rndtechnosoft_email_templates (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  template_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  description VARCHAR(500),
  body_text TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_email_templates_tenant
    FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE CASCADE,
  CONSTRAINT uq_email_templates_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT ck_email_templates_name CHECK (length(btrim(template_name)) > 0),
  CONSTRAINT ck_email_templates_category CHECK (length(btrim(category)) > 0),
  CONSTRAINT ck_email_templates_subject CHECK (length(btrim(subject)) > 0),
  CONSTRAINT ck_email_templates_body CHECK (length(btrim(body_text)) > 0)
);

CREATE INDEX ix_email_templates_tenant_updated
  ON rndtechnosoft_email_templates (tenant_id, updated_at DESC);
