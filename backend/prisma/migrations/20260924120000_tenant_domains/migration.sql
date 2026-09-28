-- Workspace addresses. Every workspace gets one primary platform subdomain
-- (<subdomain>.<PLATFORM_BASE_DOMAIN>); custom domains can be added later as
-- CUSTOM rows without changing the tenancy model. Provisioning status records
-- whether the address was verified to reach this application over HTTPS.

CREATE TABLE rndtechnosoft_tenant_domains (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  domain_kind varchar(32) NOT NULL,
  subdomain varchar(63),
  custom_hostname varchar(253),
  is_primary boolean NOT NULL DEFAULT false,
  provisioning_status varchar(32) NOT NULL DEFAULT 'PENDING',
  provisioning_error varchar(500),
  provisioning_attempts integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz(6),
  verified_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_tenant_domains_tenant FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT ck_tenant_domains_kind CHECK (domain_kind IN ('SUBDOMAIN', 'CUSTOM')),
  CONSTRAINT ck_tenant_domains_status CHECK (provisioning_status IN ('PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED')),
  CONSTRAINT ck_tenant_domains_shape CHECK (
    (domain_kind = 'SUBDOMAIN' AND subdomain IS NOT NULL AND custom_hostname IS NULL)
    OR (domain_kind = 'CUSTOM' AND custom_hostname IS NOT NULL AND subdomain IS NULL)
  ),
  -- One DNS label: lower-case letters, digits, single hyphens, no leading or trailing hyphen.
  CONSTRAINT ck_tenant_domains_subdomain CHECK (
    subdomain IS NULL OR (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' AND length(subdomain) >= 2 AND position('--' in subdomain) = 0)
  ),
  CONSTRAINT ck_tenant_domains_custom_hostname CHECK (custom_hostname IS NULL OR custom_hostname = lower(custom_hostname)),
  CONSTRAINT ck_tenant_domains_attempts CHECK (provisioning_attempts >= 0)
);

CREATE UNIQUE INDEX uq_tenant_domains_subdomain ON rndtechnosoft_tenant_domains (subdomain);
CREATE UNIQUE INDEX uq_tenant_domains_custom_hostname ON rndtechnosoft_tenant_domains (custom_hostname);
CREATE UNIQUE INDEX uq_tenant_domains_tenant_id ON rndtechnosoft_tenant_domains (tenant_id, id);
CREATE INDEX ix_tenant_domains_tenant ON rndtechnosoft_tenant_domains (tenant_id);
CREATE INDEX ix_tenant_domains_provisioning ON rndtechnosoft_tenant_domains (provisioning_status, last_checked_at);
-- At most one primary address per workspace.
CREATE UNIQUE INDEX uq_tenant_domains_primary ON rndtechnosoft_tenant_domains ((tenant_id)) WHERE is_primary;

-- Every existing workspace gets its tenant code as its subdomain (RND_IN → rnd-in).
-- A code that is reserved, too short, or already taken falls back to ws-<id>.
WITH candidates AS (
  SELECT t.id AS tenant_id, t.created_at,
         trim(both '-' from left(trim(both '-' from regexp_replace(lower(t.tenant_code), '[^a-z0-9]+', '-', 'g')), 63)) AS label
  FROM rndtechnosoft_tenants t
), ranked AS (
  SELECT tenant_id, label, row_number() OVER (PARTITION BY label ORDER BY created_at, tenant_id) AS n
  FROM candidates
)
INSERT INTO rndtechnosoft_tenant_domains (id, tenant_id, domain_kind, subdomain, is_primary, provisioning_status)
SELECT gen_random_uuid(), tenant_id, 'SUBDOMAIN',
       CASE
         WHEN n = 1 AND length(label) >= 2 AND label NOT IN ('abuse', 'account', 'accounts', 'acme', 'admin', 'administrator', 'alpha', 'api', 'apis', 'app', 'apps', 'assets', 'auth', 'autoconfig', 'autodiscover', 'beta', 'billing', 'blog', 'cache', 'careers', 'cdn', 'checkout', 'ci', 'cname', 'community', 'console', 'cpanel', 'crm', 'cron', 'dashboard', 'database', 'db', 'demo', 'dev', 'development', 'dkim', 'dmarc', 'dns', 'docs', 'documentation', 'domainkey', 'download', 'downloads', 'email', 'erp', 'files', 'forum', 'ftp', 'gateway', 'git', 'grafana', 'health', 'help', 'helpdesk', 'hooks', 'hq', 'hrms', 'id', 'identity', 'images', 'imap', 'img', 'internal', 'intranet', 'invoice', 'invoices', 'jenkins', 'jobs', 'jobs-worker', 'lb', 'legacy', 'legal', 'local', 'localhost', 'login', 'logs', 'mail', 'media', 'metrics', 'monitor', 'monitoring', 'mta-sts', 'mx', 'my', 'mysql', 'new', 'news', 'next', 'noc', 'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'oauth', 'old', 'pay', 'payment', 'payments', 'payroll', 'phpmyadmin', 'platform', 'pma', 'pop', 'pop3', 'portal', 'postgres', 'preview', 'privacy', 'proxy', 'qa', 'redis', 'register', 'rndtechnosoft', 'root', 'sandbox', 'security', 'sftp', 'shop', 'signin', 'signup', 'smtp', 'socket', 'spf', 'ssh', 'ssl', 'sso', 'stage', 'staging', 'static', 'status', 'store', 'super-admin', 'superadmin', 'support', 'system', 'test', 'testing', 'tls', 'trust', 'uat', 'uploads', 'user', 'users', 'voogyo', 'vpn', 'webhook', 'webhooks', 'webmail', 'whm', 'ws', 'www') THEN label
         ELSE 'ws-' || left(replace(tenant_id::text, '-', ''), 12)
       END,
       true, 'PENDING'
FROM ranked;
