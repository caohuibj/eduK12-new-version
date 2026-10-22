-- Add Authenticator credentials without changing any existing key or authority.
CREATE TABLE "admin_totp_credentials" (
  "user_id" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "secret_cipher" TEXT NOT NULL,
  "last_used_step" BIGINT NOT NULL DEFAULT -1 CHECK ("last_used_step" >= -1),
  "enabled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "admin_security_challenges"
  DROP CONSTRAINT "admin_security_challenges_purpose_check",
  ADD CONSTRAINT "admin_security_challenges_purpose_check"
    CHECK ("purpose" IN ('ENROLLMENT','REGISTER','LOGIN','STEP_UP','TOTP_REGISTER','TOTP_LOGIN','TOTP_STEP_UP'));
