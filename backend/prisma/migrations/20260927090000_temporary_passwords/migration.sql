-- Workspace owners onboarded from the platform console now receive a
-- temporary password by email (only its hash is stored) and must replace it
-- at their first sign-in. Until they do, their session reaches nothing but
-- the password change, their profile and sign-out.
ALTER TABLE rndtechnosoft_users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- The one-time setup links this replaces are no longer issued or accepted.
DROP TABLE rndtechnosoft_account_setup_tokens;
