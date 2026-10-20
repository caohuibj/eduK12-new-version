-- Additive and replay-safe. Never infer privileges from historical User.role.
CREATE TABLE IF NOT EXISTS "admin_entry_grants" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "entry" TEXT NOT NULL CHECK ("entry" IN ('TRAINING','SURVEY','HUISCHOOL','HUITEACHER')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "granted_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "admin_entry_grants_revoke_pair" CHECK (("revoked_by" IS NULL) = ("revoked_at" IS NULL)),
  CONSTRAINT "admin_entry_grants_user_entry_key" UNIQUE ("user_id","entry")
);
CREATE INDEX IF NOT EXISTS "admin_entry_grants_active_idx" ON "admin_entry_grants"("user_id","entry") WHERE "revoked_at" IS NULL;
CREATE TABLE IF NOT EXISTS "admin_authorization_audits" (
  "id" TEXT PRIMARY KEY,
  "actor_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "target_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "entry" TEXT CHECK ("entry" IN ('TRAINING','SURVEY','HUISCHOOL','HUITEACHER')),
  "action" TEXT NOT NULL,
  "version" INTEGER,
  "reason" TEXT NOT NULL CHECK (length("reason") BETWEEN 1 AND 500),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "admin_authorization_audits_target_idx" ON "admin_authorization_audits"("target_user_id","created_at" DESC);
CREATE OR REPLACE FUNCTION admin_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'admin authorization audit is append-only'; END $$;
DROP TRIGGER IF EXISTS "admin_audit_append_only" ON "admin_authorization_audits";
CREATE TRIGGER "admin_audit_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "admin_authorization_audits"
FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_append_only();
