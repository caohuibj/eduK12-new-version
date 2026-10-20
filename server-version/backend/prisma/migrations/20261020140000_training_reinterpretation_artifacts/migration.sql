-- Exact Training FINAL data scope is independent of report authorship. No grants
-- or historical interpretations are created by this additive migration.
ALTER TABLE content_capability_grants DROP CONSTRAINT content_capability_grants_data_project_check,
 ADD CONSTRAINT content_capability_grants_data_scope_check CHECK (resource_kind <> 'data' OR
  (product='SURVEY' AND scope_kind='PROJECT') OR (product='TRAINING' AND scope_kind='COURSE'));
CREATE TABLE training_interpretation_artifacts (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
 composite_id TEXT NOT NULL REFERENCES composite_assessments(id) ON DELETE RESTRICT,
 attempt_id TEXT NOT NULL REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 attempt_epoch INTEGER NOT NULL CHECK (attempt_epoch>0),
 item_id TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 source_aggregate_hash TEXT NOT NULL CHECK (source_aggregate_hash ~ '^[a-f0-9]{64}$'),
 source_binding_hash TEXT NOT NULL CHECK (source_binding_hash ~ '^[a-f0-9]{64}$'),
 source_receipt_hash TEXT NOT NULL CHECK (source_receipt_hash ~ '^[a-f0-9]{64}$'),
 previous_artifact_id TEXT REFERENCES training_interpretation_artifacts(id) ON DELETE RESTRICT,
 artifact_cipher TEXT NOT NULL CHECK (octet_length(artifact_cipher) BETWEEN 1 AND 2097152),
 artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
 CHECK (previous_artifact_id IS NULL OR previous_artifact_id<>id)
);
CREATE INDEX training_interpretation_artifacts_attempt_time_idx ON training_interpretation_artifacts(attempt_id,created_at,id);
CREATE FUNCTION guard_training_interpretation_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'training interpretation artifacts are immutable'; END IF;
 PERFORM 1 FROM composite_assessment_attempts a
  WHERE a.id=NEW.attempt_id AND a.composite_assessment_id=NEW.composite_id AND a.delivery_course_id=NEW.course_id
   AND a.attempt_epoch=NEW.attempt_epoch AND a.status='COMPLETED' AND a.delivery_mode='FINAL_ONLY' AND a.runtime_generation='UNIFIED_V1'
   AND a.aggregate_input_hash=NEW.source_aggregate_hash AND a.training_content_binding_hash=NEW.source_binding_hash
   AND a.training_content_interpretation_hash=NEW.source_receipt_hash
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.training_content_binding->'units') u WHERE u->>'itemId'=NEW.item_id) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'training interpretation source identity mismatch'; END IF;
 IF NEW.previous_artifact_id IS NOT NULL THEN
  PERFORM 1 FROM training_interpretation_artifacts p WHERE p.id=NEW.previous_artifact_id
   AND p.attempt_id=NEW.attempt_id AND p.attempt_epoch=NEW.attempt_epoch AND p.course_id=NEW.course_id
   AND p.composite_id=NEW.composite_id AND p.item_id=NEW.item_id AND p.source_receipt_hash=NEW.source_receipt_hash FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'training interpretation predecessor identity mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_interpretation_artifacts_guard BEFORE INSERT OR UPDATE OR DELETE ON training_interpretation_artifacts
 FOR EACH ROW EXECUTE FUNCTION guard_training_interpretation_artifact();
