-- Explicit interpretations are immutable siblings of FINAL, never replacements.
CREATE TABLE survey_interpretation_artifacts (
  id TEXT PRIMARY KEY,
  final_id TEXT NOT NULL REFERENCES survey_wave_finals(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_final_hash TEXT NOT NULL CHECK (source_final_hash ~ '^[a-f0-9]{64}$'),
  artifact_cipher TEXT NOT NULL CHECK (length(artifact_cipher) BETWEEN 1 AND 2097152),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX survey_interpretation_artifacts_final_time_idx ON survey_interpretation_artifacts(final_id,created_at,id);
CREATE FUNCTION guard_survey_interpretation_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'survey interpretation artifacts are immutable'; END IF;
  PERFORM 1 FROM survey_wave_finals WHERE id=NEW.final_id AND results_hash=NEW.source_final_hash FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'survey interpretation source identity mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER survey_interpretation_artifacts_guard BEFORE INSERT OR UPDATE OR DELETE ON survey_interpretation_artifacts
FOR EACH ROW EXECUTE FUNCTION guard_survey_interpretation_artifact();
