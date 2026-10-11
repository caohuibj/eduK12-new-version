-- SURVEY is a separate account realm. No existing user is promoted or migrated.
ALTER TABLE "users" DROP CONSTRAINT "users_account_domain_check";
ALTER TABLE "users" ADD CONSTRAINT "users_account_domain_check"
  CHECK ("account_domain" IN ('LEGACY','TRAINING','SCHOOL','SURVEY'));

CREATE OR REPLACE FUNCTION survey_account_domain_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."account_domain" = 'SURVEY') <> (NEW."account_domain" = 'SURVEY') THEN
    RAISE EXCEPTION 'SURVEY realm is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_account_domain_immutable
  BEFORE UPDATE OF "account_domain" ON "users"
  FOR EACH ROW EXECUTE FUNCTION survey_account_domain_immutable();

CREATE TABLE "survey_accounts" (
  "user_id" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "login_name" TEXT NOT NULL,
  "normalized_login" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_login_shape_check" CHECK (
    length("login_name") BETWEEN 4 AND 32
    AND "normalized_login" = lower(trim("login_name"))
    AND "normalized_login" ~ '^[a-z0-9_.-]{4,32}$')
);
CREATE OR REPLACE FUNCTION survey_account_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id"=NEW."user_id" AND "account_domain"='SURVEY')
  THEN RAISE EXCEPTION 'Survey alias requires SURVEY account' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_account_guard
  BEFORE INSERT OR UPDATE OF "user_id" ON "survey_accounts"
  FOR EACH ROW EXECUTE FUNCTION survey_account_guard();

CREATE TABLE "survey_researcher_grants" (
  "user_id" TEXT PRIMARY KEY REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_MFA'
    CHECK ("status" IN ('PENDING_MFA','ACTIVE','SUSPENDED','REVOKED')),
  "granted_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "survey_invitations" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'INVITE' CHECK ("kind" IN ('INVITE','PASSWORD_RESET')),
  "token_hash" TEXT NOT NULL UNIQUE,
  "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "target_user_id" TEXT REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "claimed_at" TIMESTAMPTZ(6),
  "claimed_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_invitation_claim_consistency"
    CHECK (("claimed_at" IS NULL) = ("claimed_user_id" IS NULL)),
  CONSTRAINT "survey_invitation_kind_target"
    CHECK (("kind"='INVITE' AND "target_user_id" IS NULL) OR
           ("kind"='PASSWORD_RESET' AND "target_user_id" IS NOT NULL))
);
CREATE INDEX "survey_invitations_validity_idx" ON "survey_invitations"("expires_at","claimed_at","revoked_at");

-- Independent TOTP/recovery storage: never share Huischool secrets or sessions.
CREATE TABLE "survey_mfa_credentials" (
  "user_id" TEXT PRIMARY KEY REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "secret_cipher" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_used_step" BIGINT NOT NULL DEFAULT -1,
  "enabled_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "survey_mfa_challenges" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "challenge_hash" TEXT NOT NULL UNIQUE,
  "token_version" INTEGER NOT NULL,
  "failed_count" INTEGER NOT NULL DEFAULT 0 CHECK ("failed_count" BETWEEN 0 AND 5),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "survey_mfa_challenges_user_idx" ON "survey_mfa_challenges"("user_id","expires_at");
CREATE TABLE "survey_mfa_recovery_codes" (
  "user_id" TEXT NOT NULL REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id","code_hash")
);
CREATE TABLE "survey_projects" (
  "id" TEXT PRIMARY KEY,
  "owner_user_id" TEXT NOT NULL REFERENCES "survey_accounts"("user_id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
  "description" TEXT NOT NULL DEFAULT '' CHECK (length("description") <= 5000),
  "collection_mode" TEXT NOT NULL CHECK ("collection_mode" IN ('SINGLE_UNLINKED','LINKED_WAVES')),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','ARCHIVED')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "survey_projects_owner_status_idx"
  ON "survey_projects"("owner_user_id","status","updated_at" DESC,"id");

CREATE TABLE "survey_events" (
  "id" TEXT PRIMARY KEY,
  "actor_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "target_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "project_id" TEXT REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "survey_events_actor_idx" ON "survey_events"("actor_user_id","created_at" DESC);
CREATE INDEX "survey_events_project_idx" ON "survey_events"("project_id","created_at" DESC);
