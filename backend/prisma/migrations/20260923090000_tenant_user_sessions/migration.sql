-- Tenant user authentication.
-- Adds server-side sessions for tenant users so the tenant a request acts
-- on comes from stored session state rather than a client-supplied header,
-- plus brute-force protection matching the platform portal.
-- Schema changes generated with 'prisma migrate diff'; CHECK constraints
-- appended because Prisma cannot express them.

-- AlterTable
ALTER TABLE "rndtechnosoft_users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "password_algorithm" VARCHAR(32) NOT NULL DEFAULT 'SHA256';

-- CreateTable
CREATE TABLE "rndtechnosoft_user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tenant_member_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "issued_ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_sessions_1" ON "rndtechnosoft_user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "ix_user_sessions_1" ON "rndtechnosoft_user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "ix_user_sessions_2" ON "rndtechnosoft_user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "ix_user_sessions_3" ON "rndtechnosoft_user_sessions"("tenant_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_user_sessions" ADD CONSTRAINT "fk_user_sessions_user" FOREIGN KEY ("user_id") REFERENCES "rndtechnosoft_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_user_sessions" ADD CONSTRAINT "fk_user_sessions_member" FOREIGN KEY ("tenant_id", "tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Durable invariants Prisma cannot express.
ALTER TABLE "rndtechnosoft_users"
  ADD CONSTRAINT ck_users_failed_login_attempts
  CHECK (failed_login_attempts >= 0);

ALTER TABLE "rndtechnosoft_user_sessions"
  ADD CONSTRAINT ck_user_sessions_expiry
  CHECK (expires_at > created_at);
