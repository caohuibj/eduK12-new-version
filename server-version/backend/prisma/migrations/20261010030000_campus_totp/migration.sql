-- School administrator MFA is separate from legacy sessions and passwords.
-- Encrypted TOTP secrets and short challenges are never stored in plain text.
CREATE TABLE "campus_mfa_credentials" (
  "user_id" TEXT NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "secret_cipher" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_used_step" BIGINT NOT NULL DEFAULT -1,
  "enabled_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "campus_mfa_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "challenge_hash" TEXT NOT NULL,
  "token_version" INTEGER NOT NULL,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_mfa_challenges_budget_check" CHECK ("failed_count" BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX "campus_mfa_challenges_digest_key"
  ON "campus_mfa_challenges" ("challenge_hash");
CREATE INDEX "campus_mfa_challenges_user_idx"
  ON "campus_mfa_challenges" ("user_id", "expires_at");
CREATE TABLE "campus_mfa_recovery_codes" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "code_hash")
);
