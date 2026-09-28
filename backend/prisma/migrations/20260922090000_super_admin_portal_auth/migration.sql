-- Super Admin Portal Authentication
-- Adds durable server-side sessions and brute-force protection for the
-- platform (super admin) portal, which authenticates separately from tenants.

ALTER TABLE rndtechnosoft_super_admins
  ADD COLUMN IF NOT EXISTS password_algorithm VARCHAR(32) NOT NULL DEFAULT 'SHA256',
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ(6);

ALTER TABLE rndtechnosoft_super_admins
  ADD CONSTRAINT ck_super_admins_failed_login_attempts
  CHECK (failed_login_attempts >= 0);

CREATE TABLE rndtechnosoft_super_admin_sessions (
  id                 UUID          NOT NULL,
  super_admin_id     UUID          NOT NULL,
  token_hash         VARCHAR(128)  NOT NULL,
  issued_ip_address  VARCHAR(64),
  user_agent         VARCHAR(255),
  expires_at         TIMESTAMPTZ(6) NOT NULL,
  revoked_at         TIMESTAMPTZ(6),
  last_used_at       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT rndtechnosoft_super_admin_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT fk_super_admin_sessions_admin FOREIGN KEY (super_admin_id)
    REFERENCES rndtechnosoft_super_admins (id) ON DELETE CASCADE,
  CONSTRAINT ck_super_admin_sessions_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX uq_super_admin_sessions_1 ON rndtechnosoft_super_admin_sessions (token_hash);
CREATE INDEX ix_super_admin_sessions_1 ON rndtechnosoft_super_admin_sessions (super_admin_id, revoked_at);
CREATE INDEX ix_super_admin_sessions_2 ON rndtechnosoft_super_admin_sessions (expires_at);
