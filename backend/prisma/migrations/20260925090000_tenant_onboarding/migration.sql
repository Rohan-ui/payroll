-- Tenant onboarding from the platform console: outbound email deliveries, the
-- onboarding record of each provisioned workspace, and one-time account setup
-- links for owners who have no password yet.

-- Every email the platform tries to send. The message body is not stored: it
-- can contain a setup link, which is a credential.
CREATE TABLE rndtechnosoft_email_deliveries (
  id uuid PRIMARY KEY,
  tenant_id uuid,
  template_code varchar(64) NOT NULL,
  recipient_email varchar(320) NOT NULL,
  subject varchar(300) NOT NULL,
  delivery_status varchar(32) NOT NULL DEFAULT 'QUEUED',
  error_message varchar(500),
  provider_message_id varchar(255),
  requested_by_super_admin_id uuid,
  sent_at timestamptz(6),
  failed_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_email_deliveries_tenant FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_email_deliveries_admin FOREIGN KEY (requested_by_super_admin_id) REFERENCES rndtechnosoft_super_admins (id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT ck_email_deliveries_status CHECK (delivery_status IN ('QUEUED', 'SENT', 'FAILED')),
  CONSTRAINT ck_email_deliveries_outcome CHECK (
    (delivery_status = 'QUEUED' AND sent_at IS NULL AND failed_at IS NULL)
    OR (delivery_status = 'SENT' AND sent_at IS NOT NULL AND failed_at IS NULL)
    OR (delivery_status = 'FAILED' AND failed_at IS NOT NULL AND sent_at IS NULL AND error_message IS NOT NULL)
  )
);

CREATE INDEX ix_email_deliveries_tenant ON rndtechnosoft_email_deliveries (tenant_id, created_at DESC);
CREATE INDEX ix_email_deliveries_created ON rndtechnosoft_email_deliveries (created_at DESC);

-- One per workspace provisioned from the console. The idempotency key comes
-- from the provisioning form, so a repeated submission returns the workspace
-- it already created instead of creating another.
CREATE TABLE rndtechnosoft_tenant_onboardings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  owner_is_new_account boolean NOT NULL,
  provisioned_by_super_admin_id uuid,
  onboarding_email_delivery_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_tenant_onboardings_tenant FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_tenant_onboardings_owner FOREIGN KEY (owner_user_id) REFERENCES rndtechnosoft_users (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_tenant_onboardings_admin FOREIGN KEY (provisioned_by_super_admin_id) REFERENCES rndtechnosoft_super_admins (id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT fk_tenant_onboardings_email FOREIGN KEY (onboarding_email_delivery_id) REFERENCES rndtechnosoft_email_deliveries (id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX uq_tenant_onboardings_tenant ON rndtechnosoft_tenant_onboardings (tenant_id);
CREATE UNIQUE INDEX uq_tenant_onboardings_idempotency_key ON rndtechnosoft_tenant_onboardings (idempotency_key);

-- One-time links for setting the first password. Only a SHA-256 digest of
-- the token is stored; a user has at most one usable link at a time.
CREATE TABLE rndtechnosoft_account_setup_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  token_hash char(64) NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  used_at timestamptz(6),
  revoked_at timestamptz(6),
  created_by_super_admin_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_account_setup_tokens_user FOREIGN KEY (user_id) REFERENCES rndtechnosoft_users (id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_account_setup_tokens_tenant FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_account_setup_tokens_admin FOREIGN KEY (created_by_super_admin_id) REFERENCES rndtechnosoft_super_admins (id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT ck_account_setup_tokens_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_account_setup_tokens_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_account_setup_tokens_single_outcome CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX uq_account_setup_tokens_hash ON rndtechnosoft_account_setup_tokens (token_hash);
CREATE UNIQUE INDEX uq_account_setup_tokens_open ON rndtechnosoft_account_setup_tokens (user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX ix_account_setup_tokens_tenant ON rndtechnosoft_account_setup_tokens (tenant_id);
