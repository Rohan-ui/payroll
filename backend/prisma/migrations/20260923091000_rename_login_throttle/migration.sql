-- The throttle table now backs tenant sign-in as well as platform sign-in,
-- so its name no longer says "platform". Renames preserve the existing rows.

ALTER TABLE "rndtechnosoft_platform_login_throttle" RENAME TO "rndtechnosoft_login_throttle";

ALTER TABLE "rndtechnosoft_login_throttle"
  RENAME CONSTRAINT "rndtechnosoft_platform_login_throttle_pkey" TO "rndtechnosoft_login_throttle_pkey";

ALTER TABLE "rndtechnosoft_login_throttle"
  RENAME CONSTRAINT ck_platform_login_throttle_attempts TO ck_login_throttle_attempts;

ALTER INDEX "uq_platform_login_throttle_1" RENAME TO "uq_login_throttle_1";
ALTER INDEX "ix_platform_login_throttle_1" RENAME TO "ix_login_throttle_1";
ALTER INDEX "ix_platform_login_throttle_2" RENAME TO "ix_login_throttle_2";
