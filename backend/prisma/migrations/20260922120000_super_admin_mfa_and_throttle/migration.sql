-- Platform portal: TOTP two-factor authentication and login throttling.
-- Schema changes generated with 'prisma migrate diff'; the CHECK
-- constraints below are appended because Prisma's schema language
-- cannot express them.

-- AlterTable
ALTER TABLE "rndtechnosoft_super_admin_sessions" ADD COLUMN     "mfa_pending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "rndtechnosoft_super_admins" ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_enrolled_at" TIMESTAMPTZ(6),
ADD COLUMN     "totp_last_used_step" BIGINT,
ADD COLUMN     "totp_secret_encrypted" VARCHAR(512);

-- CreateTable
CREATE TABLE "rndtechnosoft_super_admin_recovery_codes" (
    "id" UUID NOT NULL,
    "super_admin_id" UUID NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_super_admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_platform_login_throttle" (
    "id" UUID NOT NULL,
    "throttle_key" VARCHAR(160) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "blocked_until" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_platform_login_throttle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_super_admin_recovery_codes_1" ON "rndtechnosoft_super_admin_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "ix_super_admin_recovery_codes_1" ON "rndtechnosoft_super_admin_recovery_codes"("super_admin_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_login_throttle_1" ON "rndtechnosoft_platform_login_throttle"("throttle_key");

-- CreateIndex
CREATE INDEX "ix_platform_login_throttle_1" ON "rndtechnosoft_platform_login_throttle"("blocked_until");

-- CreateIndex
CREATE INDEX "ix_platform_login_throttle_2" ON "rndtechnosoft_platform_login_throttle"("window_started_at");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_super_admin_recovery_codes" ADD CONSTRAINT "fk_super_admin_recovery_codes_admin" FOREIGN KEY ("super_admin_id") REFERENCES "rndtechnosoft_super_admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Durable invariants Prisma cannot express.
ALTER TABLE "rndtechnosoft_platform_login_throttle"
  ADD CONSTRAINT ck_platform_login_throttle_attempts
  CHECK (attempt_count >= 0);

-- A confirmed second factor must always have a stored secret to verify against.
ALTER TABLE "rndtechnosoft_super_admins"
  ADD CONSTRAINT ck_super_admins_totp_secret_present
  CHECK (totp_enabled = false OR totp_secret_encrypted IS NOT NULL);
