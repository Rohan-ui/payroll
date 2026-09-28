-- Indexes for the platform console's tenant and user directories: server-side
-- search, the default sort, last-activity lookups, and the activity shown on
-- a workspace or a user. No tables or columns change.

-- Trigram indexes make substring (ILIKE-style) search indexable. pg_trgm ships
-- with PostgreSQL and is a trusted extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Search. These expressions are exactly the ones PlatformDirectoryService uses.
CREATE INDEX ix_tenants_search ON rndtechnosoft_tenants
  USING gin (lower(display_name || ' ' || legal_name || ' ' || tenant_code) gin_trgm_ops);
CREATE INDEX ix_users_search ON rndtechnosoft_users
  USING gin (lower(coalesce(display_name, '') || ' ' || email || ' ' || coalesce(mobile_number, '')) gin_trgm_ops);

-- Newest first, the default order of both directories.
CREATE INDEX ix_tenants_created_at ON rndtechnosoft_tenants (created_at DESC);
CREATE INDEX ix_users_created_at ON rndtechnosoft_users (created_at DESC);

-- Last activity, and the latest session, per workspace and per user.
CREATE INDEX ix_user_sessions_tenant_last_used ON rndtechnosoft_user_sessions (tenant_id, last_used_at DESC);
CREATE INDEX ix_user_sessions_user_last_used ON rndtechnosoft_user_sessions (user_id, last_used_at DESC);

-- A workspace's platform history, and a user's activity and account events.
CREATE INDEX ix_platform_activity_tenant ON rndtechnosoft_platform_activity_logs (target_tenant_id, created_at DESC);
CREATE INDEX ix_platform_activity_user ON rndtechnosoft_platform_activity_logs ((metadata->>'userId'), created_at DESC)
  WHERE metadata ? 'userId';
CREATE INDEX ix_audit_logs_actor ON rndtechnosoft_audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX ix_crm_audit_logs_actor ON rndtechnosoft_crm_audit_logs (actor_id, created_at DESC);
