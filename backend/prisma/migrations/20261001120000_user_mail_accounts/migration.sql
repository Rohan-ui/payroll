-- Personal mail accounts: each member can connect their own mail account in a
-- workspace, to send as themselves (SMTP) and, optionally, read their inbox
-- (IMAP). Passwords are encrypted by the application with
-- PLATFORM_ENCRYPTION_KEY and are never stored in plaintext.
--
-- Nothing is copied from the workspace's SMTP account, which stays as it is.
-- Whether members may send from their own accounts is a workspace setting
-- (settings.email.personalAccounts), off until an administrator turns it on,
-- so every workspace keeps sending exactly as before.
--
-- Onboarding emails now record which account sent them and who started them.

-- AlterTable
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD COLUMN     "initiated_by_tenant_member_id" UUID,
ADD COLUMN     "sender_email" VARCHAR(320),
ADD COLUMN     "sender_kind" VARCHAR(16);

-- CreateTable
CREATE TABLE "rndtechnosoft_user_mail_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "smtp_host" VARCHAR(253) NOT NULL,
    "smtp_port" INTEGER NOT NULL,
    "smtp_security" VARCHAR(16) NOT NULL,
    "smtp_username" VARCHAR(320) NOT NULL,
    "smtp_password_encrypted" TEXT,
    "sender_email" VARCHAR(320) NOT NULL,
    "sender_name" VARCHAR(160),
    "reply_to_email" VARCHAR(320),
    "imap_enabled" BOOLEAN NOT NULL DEFAULT false,
    "imap_host" VARCHAR(253),
    "imap_port" INTEGER,
    "imap_security" VARCHAR(16),
    "imap_username" VARCHAR(320),
    "imap_password_encrypted" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "smtp_status" VARCHAR(16) NOT NULL DEFAULT 'UNTESTED',
    "smtp_last_tested_at" TIMESTAMPTZ(6),
    "smtp_last_success_at" TIMESTAMPTZ(6),
    "smtp_last_error" VARCHAR(500),
    "imap_status" VARCHAR(16) NOT NULL DEFAULT 'UNTESTED',
    "imap_last_tested_at" TIMESTAMPTZ(6),
    "imap_last_success_at" TIMESTAMPTZ(6),
    "imap_last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_user_mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_user_mail_accounts_status" ON "rndtechnosoft_user_mail_accounts"("tenant_id", "smtp_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_mail_accounts_tenant_user" ON "rndtechnosoft_user_mail_accounts"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD CONSTRAINT "fk_onboarding_notifications_initiated_by" FOREIGN KEY ("tenant_id", "initiated_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_user_mail_accounts" ADD CONSTRAINT "fk_user_mail_accounts_member" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;



-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_user_mail_accounts"
  ADD CONSTRAINT "ck_user_mail_accounts_provider" CHECK ("provider" IN ('GMAIL', 'MICROSOFT_365', 'ZOHO', 'CUSTOM')),
  -- Personal accounts always sign in, so the connection is always encrypted.
  ADD CONSTRAINT "ck_user_mail_accounts_smtp_security" CHECK ("smtp_security" IN ('SSL', 'STARTTLS')),
  ADD CONSTRAINT "ck_user_mail_accounts_smtp_port" CHECK ("smtp_port" BETWEEN 1 AND 65535),
  ADD CONSTRAINT "ck_user_mail_accounts_imap_security" CHECK ("imap_security" IS NULL OR "imap_security" IN ('SSL', 'STARTTLS')),
  ADD CONSTRAINT "ck_user_mail_accounts_imap_port" CHECK ("imap_port" IS NULL OR "imap_port" BETWEEN 1 AND 65535),
  ADD CONSTRAINT "ck_user_mail_accounts_imap_complete" CHECK (NOT "imap_enabled" OR ("imap_host" IS NOT NULL AND "imap_port" IS NOT NULL AND "imap_security" IS NOT NULL AND "imap_username" IS NOT NULL)),
  ADD CONSTRAINT "ck_user_mail_accounts_statuses" CHECK ("smtp_status" IN ('UNTESTED', 'CONNECTED', 'FAILED', 'DISCONNECTED') AND "imap_status" IN ('UNTESTED', 'CONNECTED', 'FAILED', 'DISCONNECTED')),
  ADD CONSTRAINT "ck_user_mail_accounts_version" CHECK ("credential_version" >= 1),
  -- An enabled account can sign in.
  ADD CONSTRAINT "ck_user_mail_accounts_enabled" CHECK (NOT "is_enabled" OR "smtp_password_encrypted" IS NOT NULL);

ALTER TABLE "rndtechnosoft_onboarding_notifications"
  ADD CONSTRAINT "ck_onboarding_notifications_sender_kind" CHECK ("sender_kind" IS NULL OR "sender_kind" IN ('PERSONAL', 'GMAIL', 'ORGANIZATION'));
