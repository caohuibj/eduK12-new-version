-- Additive Survey cognitive pilot. No historical publication or FINAL is rewritten.
ALTER TABLE survey_instrument_drafts DROP CONSTRAINT survey_instrument_drafts_kind_check;
ALTER TABLE survey_instrument_drafts ADD CONSTRAINT survey_instrument_drafts_kind_check
  CHECK (kind IN ('FORM','SCALE','SJT','COGNITIVE'));
CREATE TABLE survey_cognitive_sessions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, wave_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL, publication_id TEXT NOT NULL REFERENCES survey_publications(id) ON DELETE RESTRICT,
  slot_key TEXT NOT NULL CHECK (slot_key ~ '^[a-z][a-z0-9_-]{0,79}$'),
  epoch INTEGER NOT NULL CHECK (epoch IN (1,2)),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','INTERRUPTED','ABANDONED','COMPLETED')),
  measurement_digest TEXT NOT NULL CHECK (measurement_digest ~ '^[0-9a-f]{64}$'),
  random_seed_cipher TEXT NOT NULL, locked_answers_cipher TEXT NOT NULL,
  locked_answers_hash TEXT NOT NULL CHECK (locked_answers_hash ~ '^[0-9a-f]{64}$'),
  admission_cipher TEXT NOT NULL,
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  interrupted_at TIMESTAMPTZ(6), finished_at TIMESTAMPTZ(6),
  retention_review_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT survey_cognitive_session_parent_fk FOREIGN KEY(attempt_id,project_id,wave_id)
    REFERENCES survey_wave_attempts(id,project_id,wave_id) ON DELETE RESTRICT,
  CONSTRAINT survey_cognitive_attempt_slot_epoch_uniq UNIQUE(attempt_id,slot_key,epoch),
  CONSTRAINT survey_cognitive_session_scope_uniq UNIQUE(id,project_id,wave_id,attempt_id,publication_id,slot_key,epoch)
);
CREATE INDEX survey_cognitive_session_scope_idx ON survey_cognitive_sessions(project_id,wave_id,attempt_id);
CREATE INDEX survey_cognitive_retention_review_idx ON survey_cognitive_sessions(retention_review_at);
CREATE TABLE survey_cognitive_results (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL, wave_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,slot_key TEXT NOT NULL,epoch INTEGER NOT NULL,
  measurement_digest TEXT NOT NULL CHECK (measurement_digest ~ '^[0-9a-f]{64}$'),
  submission_id TEXT NOT NULL CHECK (length(submission_id) BETWEEN 16 AND 200),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  raw_hash TEXT NOT NULL CHECK (raw_hash ~ '^[0-9a-f]{64}$'),
  raw_cipher TEXT NOT NULL CHECK (octet_length(raw_cipher)<=2097152),
  result_hash TEXT NOT NULL CHECK (result_hash ~ '^[0-9a-f]{64}$'),
  result_cipher TEXT NOT NULL CHECK (octet_length(result_cipher)<=262144),
  trial_count INTEGER NOT NULL CHECK (trial_count=120),
  completed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT survey_cognitive_result_session_fk FOREIGN KEY(session_id,project_id,wave_id,attempt_id,publication_id,slot_key,epoch)
    REFERENCES survey_cognitive_sessions(id,project_id,wave_id,attempt_id,publication_id,slot_key,epoch) ON DELETE RESTRICT,
  CONSTRAINT survey_cognitive_result_scope_uniq UNIQUE(session_id,project_id,wave_id,attempt_id,publication_id,slot_key,epoch),
  CONSTRAINT survey_cognitive_result_attempt_slot_uniq UNIQUE(attempt_id,slot_key)
);
CREATE INDEX survey_cognitive_result_scope_idx ON survey_cognitive_results(project_id,wave_id,attempt_id);
CREATE FUNCTION reject_survey_cognitive_result_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Survey cognitive FINAL is immutable'; END; $$;
CREATE TRIGGER survey_cognitive_result_immutable BEFORE UPDATE OR DELETE ON survey_cognitive_results
  FOR EACH ROW EXECUTE FUNCTION reject_survey_cognitive_result_mutation();
CREATE FUNCTION guard_survey_cognitive_session_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Survey cognitive retention requires explicit reviewed workflow'; END IF;
  IF OLD.status IN ('COMPLETED','ABANDONED') OR NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id
    OR NEW.wave_id<>OLD.wave_id OR NEW.attempt_id<>OLD.attempt_id OR NEW.publication_id<>OLD.publication_id
    OR NEW.slot_key<>OLD.slot_key OR NEW.epoch<>OLD.epoch OR NEW.measurement_digest<>OLD.measurement_digest
    OR NEW.random_seed_cipher<>OLD.random_seed_cipher OR NEW.locked_answers_cipher<>OLD.locked_answers_cipher
    OR NEW.locked_answers_hash<>OLD.locked_answers_hash OR NEW.admission_cipher<>OLD.admission_cipher
    OR NEW.started_at<>OLD.started_at OR NEW.retention_review_at<>OLD.retention_review_at
    OR (OLD.status='INTERRUPTED' AND NEW.status NOT IN ('INTERRUPTED','ABANDONED','COMPLETED'))
  THEN RAISE EXCEPTION 'Survey cognitive frozen admission or terminal state cannot change'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_cognitive_session_frozen BEFORE UPDATE OR DELETE ON survey_cognitive_sessions
  FOR EACH ROW EXECUTE FUNCTION guard_survey_cognitive_session_transition();
COMMENT ON COLUMN survey_cognitive_sessions.retention_review_at IS
  '30-day review deadline for parent-unfinalized pilot data. No automatic deletion. Parent-referenced FINALs are immutable; authorized retention workflow must honor consent, withdrawal and referenced results.';
-- Trial-long is a separately bounded, authorized research export; existing formats remain.
ALTER TABLE survey_export_tickets DROP CONSTRAINT survey_export_tickets_format_check;
ALTER TABLE survey_export_tickets ADD CONSTRAINT survey_export_tickets_format_check
  CHECK (format IN ('RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE','COGNITIVE_TRIAL_LONG'));
