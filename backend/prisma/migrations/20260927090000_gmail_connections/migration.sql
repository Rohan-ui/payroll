-- Per-user, per-workspace Gmail OAuth connections. Passwords and access tokens
-- are never stored. Refresh tokens are application-encrypted before insertion.
CREATE TABLE rndtechnosoft_gmail_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  gmail_email varchar(320),
  refresh_token_encrypted text,
  connection_status varchar(32) NOT NULL DEFAULT 'PENDING',
  oauth_state_hash char(64),
  oauth_state_expires_at timestamptz(6),
  connected_at timestamptz(6),
  disconnected_at timestamptz(6),
  last_error_code varchar(64),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_gmail_connections_member
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES rndtechnosoft_tenant_members (tenant_id, user_id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT ck_gmail_connections_status
    CHECK (connection_status IN ('PENDING', 'CONNECTED', 'OAUTH_FAILED', 'REAUTH_REQUIRED', 'DISCONNECTED')),
  CONSTRAINT ck_gmail_connections_state
    CHECK ((oauth_state_hash IS NULL) = (oauth_state_expires_at IS NULL)),
  CONSTRAINT ck_gmail_connections_token
    CHECK (connection_status <> 'CONNECTED' OR (gmail_email IS NOT NULL AND refresh_token_encrypted IS NOT NULL))
);

CREATE UNIQUE INDEX uq_gmail_connections_tenant_user
  ON rndtechnosoft_gmail_connections (tenant_id, user_id);
CREATE UNIQUE INDEX uq_gmail_connections_oauth_state
  ON rndtechnosoft_gmail_connections (oauth_state_hash);
CREATE INDEX ix_gmail_connections_tenant_status
  ON rndtechnosoft_gmail_connections (tenant_id, connection_status);
