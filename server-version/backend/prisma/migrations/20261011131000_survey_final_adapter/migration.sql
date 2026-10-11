-- Survey FINAL adapter: source and immutable persistence are Survey-scoped;
-- existing Composite FINAL algorithms/crypto/score implementations are reused.
ALTER TABLE "survey_waves"
  ADD COLUMN "general_text" TEXT NOT NULL DEFAULT '' CHECK (length("general_text")<=4000),
  ADD COLUMN "hard_stop_at" TIMESTAMPTZ(6);
ALTER TABLE "survey_wave_attempts"
  ADD CONSTRAINT "survey_attempts_id_project_wave_uniq" UNIQUE ("id","project_id","wave_id");

CREATE TABLE "survey_wave_finals" (
  "id" TEXT PRIMARY KEY,
  "attempt_id" TEXT NOT NULL UNIQUE,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "publication_id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL CHECK (length("submission_id") BETWEEN 16 AND 200),
  "payload_hash" TEXT NOT NULL CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  "definition_digest" TEXT NOT NULL CHECK ("definition_digest" ~ '^[0-9a-f]{64}$'),
  "results_cipher" TEXT NOT NULL,
  "results_hash" TEXT NOT NULL CHECK ("results_hash" ~ '^[0-9a-f]{64}$'),
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_final_attempt_scope_fk"
    FOREIGN KEY ("attempt_id","project_id","wave_id")
    REFERENCES "survey_wave_attempts"("id","project_id","wave_id") ON DELETE RESTRICT,
  CONSTRAINT "survey_final_publication_scope_fk"
    FOREIGN KEY ("publication_id","project_id")
    REFERENCES "survey_publications"("id","project_id") ON DELETE RESTRICT
);
CREATE INDEX "survey_finals_project_wave_time_idx"
  ON "survey_wave_finals"("project_id","wave_id","completed_at");

CREATE OR REPLACE FUNCTION survey_final_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Survey FINAL is append-only' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER survey_final_immutable
  BEFORE UPDATE OR DELETE ON "survey_wave_finals" FOR EACH ROW
  EXECUTE FUNCTION survey_final_immutable();

-- Extends the previously installed frozen-wave guard; no old Survey rows modified.
CREATE OR REPLACE FUNCTION survey_wave_published_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publication_id" IS NOT NULL AND (
     NEW."publication_id" IS DISTINCT FROM OLD."publication_id" OR
     NEW."consent_text" IS DISTINCT FROM OLD."consent_text" OR
     NEW."consent_version" IS DISTINCT FROM OLD."consent_version" OR
     NEW."instrument_ids" IS DISTINCT FROM OLD."instrument_ids" OR
     NEW."general_text" IS DISTINCT FROM OLD."general_text"
  ) THEN
    RAISE EXCEPTION 'Published Survey wave definition is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER survey_wave_published_guard ON "survey_waves";
CREATE TRIGGER survey_wave_published_guard
  BEFORE UPDATE OF "publication_id","consent_text","consent_version","instrument_ids","general_text"
  ON "survey_waves" FOR EACH ROW EXECUTE FUNCTION survey_wave_published_guard();
