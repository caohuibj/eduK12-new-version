-- Survey research-only multiwave foundation. No legacy anonymous study mutation.
ALTER TABLE "survey_projects" DROP CONSTRAINT "survey_projects_status_check";
ALTER TABLE "survey_projects" ADD CONSTRAINT "survey_projects_status_check"
  CHECK ("status" IN ('DRAFT','ACTIVE','PAUSED','CLOSED','ARCHIVED'));
ALTER TABLE "survey_projects" ADD COLUMN "public_id" TEXT UNIQUE;
ALTER TABLE "survey_projects" ADD COLUMN "first_published_at" TIMESTAMPTZ(6);
CREATE OR REPLACE FUNCTION survey_collection_mode_lock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."first_published_at" IS NOT NULL AND NEW."collection_mode"<>OLD."collection_mode" THEN
    RAISE EXCEPTION 'Published Survey collection mode is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."first_published_at" IS NOT NULL AND NEW."first_published_at" IS DISTINCT FROM OLD."first_published_at" THEN
    RAISE EXCEPTION 'Survey first publication time is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_collection_mode_lock BEFORE UPDATE OF "collection_mode","first_published_at"
  ON "survey_projects" FOR EACH ROW EXECUTE FUNCTION survey_collection_mode_lock();

CREATE TABLE "survey_publications" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "definition_digest" TEXT NOT NULL CHECK ("definition_digest" ~ '^[0-9a-f]{64}$'),
  "compiled_snapshot" JSONB NOT NULL CHECK (jsonb_typeof("compiled_snapshot")='object' AND octet_length("compiled_snapshot"::text)<=4194304),
  "consent_version" INTEGER NOT NULL CHECK ("consent_version">0),
  "purpose" TEXT NOT NULL DEFAULT 'RESEARCH_ONLY' CHECK ("purpose"='RESEARCH_ONLY'),
  "version" INTEGER NOT NULL CHECK ("version">0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_publications_project_version_key" UNIQUE ("project_id","version")
);
CREATE INDEX "survey_publications_project_idx" ON "survey_publications"("project_id","created_at");
CREATE TABLE "survey_waves" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "publication_id" TEXT REFERENCES "survey_publications"("id") ON DELETE RESTRICT,
  "ordinal" INTEGER NOT NULL CHECK ("ordinal">0),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','OPEN','PAUSED','CLOSED')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision">=0),
  "consent_text" TEXT NOT NULL CHECK (length("consent_text")<=20000),
  "consent_version" INTEGER NOT NULL DEFAULT 1 CHECK ("consent_version">0),
  "instrument_ids" JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("instrument_ids")='array' AND jsonb_array_length("instrument_ids")<=30),
  "opens_at" TIMESTAMPTZ(6),
  "closes_at" TIMESTAMPTZ(6),
  "finish_until" TIMESTAMPTZ(6),
  "quota_starts" INTEGER CHECK ("quota_starts" IS NULL OR "quota_starts">=1),
  "starts_count" INTEGER NOT NULL DEFAULT 0 CHECK ("starts_count">=0),
  "allow_new_participants" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_waves_project_ordinal_key" UNIQUE ("project_id","ordinal"),
  CONSTRAINT "survey_waves_window_check" CHECK ("opens_at" IS NULL OR "closes_at" IS NULL OR "closes_at">"opens_at")
);
CREATE INDEX "survey_waves_project_status_idx" ON "survey_waves"("project_id","status","opens_at");
-- Enforce project congruence with composite FKs rather than trusting request URLs.
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_id_project_uniq" UNIQUE ("id","project_id");
ALTER TABLE "survey_waves" ADD CONSTRAINT "survey_waves_id_project_uniq" UNIQUE ("id","project_id");
ALTER TABLE "survey_waves" ADD CONSTRAINT "survey_waves_publication_project_fk"
  FOREIGN KEY ("publication_id","project_id") REFERENCES "survey_publications"("id","project_id");

CREATE TABLE "survey_participants" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL REFERENCES "survey_projects"("id") ON DELETE RESTRICT,
  "research_code" TEXT NOT NULL CHECK ("research_code" ~ '^R-[A-Z0-9]{8,32}$'),
  "credential_hash" TEXT NOT NULL CHECK ("credential_hash" ~ '^[0-9a-f]{64}$'),
  "credential_revoked_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','REVOKED','WITHDRAWN')),
  "consent_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_participants_project_code_key" UNIQUE ("project_id","research_code"),
  CONSTRAINT "survey_participants_project_credential_key" UNIQUE ("project_id","credential_hash"),
  CONSTRAINT "survey_participants_id_project_uniq" UNIQUE ("id","project_id")
);
CREATE TABLE "survey_wave_attempts" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "participant_id" TEXT,
  "session_hash" TEXT,
  "runtime_attempt_id" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'STARTED' CHECK ("status" IN ('STARTED','COMPLETED','FAILED','WITHDRAWN')),
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "excluded_at" TIMESTAMPTZ(6),
  CONSTRAINT "survey_attempt_identity_check" CHECK ((participant_id IS NULL) <> (session_hash IS NULL)),
  CONSTRAINT "survey_attempts_wave_participant_key" UNIQUE ("wave_id","participant_id"),
  CONSTRAINT "survey_attempts_wave_session_key" UNIQUE ("wave_id","session_hash"),
  CONSTRAINT "survey_attempts_wave_project_fk" FOREIGN KEY ("wave_id","project_id")
    REFERENCES "survey_waves"("id","project_id"),
  CONSTRAINT "survey_attempts_participant_project_fk" FOREIGN KEY ("participant_id","project_id")
    REFERENCES "survey_participants"("id","project_id")
);
CREATE INDEX "survey_attempts_project_wave_status_idx" ON "survey_wave_attempts"("project_id","wave_id","status");
CREATE TABLE "survey_entry_tokens" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_entry_tokens_wave_project_fk" FOREIGN KEY ("wave_id","project_id")
    REFERENCES "survey_waves"("id","project_id")
);
CREATE INDEX "survey_entry_tokens_project_wave_idx" ON "survey_entry_tokens"("project_id","wave_id","expires_at");
CREATE TABLE "survey_consents" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "participant_id" TEXT,
  "attempt_id" TEXT,
  "consent_version" INTEGER NOT NULL CHECK ("consent_version">0),
  "accepted" BOOLEAN NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_consents_wave_project_fk" FOREIGN KEY ("wave_id","project_id")
    REFERENCES "survey_waves"("id","project_id"),
  CONSTRAINT "survey_consents_participant_project_fk" FOREIGN KEY ("participant_id","project_id")
    REFERENCES "survey_participants"("id","project_id"),
  CONSTRAINT "survey_consents_attempt_fk" FOREIGN KEY ("attempt_id")
    REFERENCES "survey_wave_attempts"("id") ON DELETE RESTRICT
);
CREATE INDEX "survey_consents_project_wave_idx" ON "survey_consents"("project_id","wave_id","created_at");

-- Published bytes and consent records must never be rewritten in place.
CREATE OR REPLACE FUNCTION survey_frozen_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Survey publication/consent is append-only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER survey_publication_frozen BEFORE UPDATE OR DELETE ON "survey_publications"
  FOR EACH ROW EXECUTE FUNCTION survey_frozen_immutable();
CREATE TRIGGER survey_consent_frozen BEFORE UPDATE OR DELETE ON "survey_consents"
  FOR EACH ROW EXECUTE FUNCTION survey_frozen_immutable();

-- Once a Wave has frozen material, its definition and consent cannot change
-- in place; administration may only pause/close admission or extend finish.
CREATE OR REPLACE FUNCTION survey_wave_published_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publication_id" IS NOT NULL
    AND (NEW."publication_id" IS DISTINCT FROM OLD."publication_id"
      OR NEW."consent_text" IS DISTINCT FROM OLD."consent_text"
      OR NEW."consent_version" IS DISTINCT FROM OLD."consent_version"
      OR NEW."instrument_ids" IS DISTINCT FROM OLD."instrument_ids") THEN
    RAISE EXCEPTION 'Published Survey wave definition is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_wave_published_guard BEFORE UPDATE OF
  "publication_id","consent_text","consent_version","instrument_ids" ON "survey_waves"
  FOR EACH ROW EXECUTE FUNCTION survey_wave_published_guard();
