CREATE TABLE IF NOT EXISTS "admin_security_keys" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "public_key" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0 CHECK ("counter">=0),
  "transports" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "admin_security_keys_user_idx" ON "admin_security_keys"("user_id");
CREATE TABLE IF NOT EXISTS "admin_security_challenges" (
  "id_hash" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('ENROLLMENT','REGISTER','LOGIN','STEP_UP')),
  "challenge" TEXT NOT NULL,
  "token_version" INTEGER NOT NULL,
  "session_id" TEXT,
  "enrollment_hash" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_security_challenges_expiry_idx" ON "admin_security_challenges"("expires_at");
