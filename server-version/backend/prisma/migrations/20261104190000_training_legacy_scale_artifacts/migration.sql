-- Legacy (schemaVersion 1) Training publications predate format-3 static
-- artifacts. This append-only map binds (composite, exact publication snapshot
-- hash, item) to a format-3 artifact that was verified to reproduce the unit's
-- pinned releaseId/contentHash. Publications themselves are never mutated.
-- No FK to composite_assessments: rows are keyed by the immutable snapshot hash
-- and must not block or cascade composite lifecycle operations.
CREATE TABLE training_legacy_scale_artifacts (
  composite_assessment_id TEXT NOT NULL,
  publication_hash TEXT NOT NULL CHECK (publication_hash ~ '^[0-9a-f]{64}$'),
  item_id TEXT NOT NULL,
  artifact_hash TEXT NOT NULL REFERENCES assessment_runtime_artifacts(artifact_hash),
  release_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (composite_assessment_id, publication_hash, item_id)
);
CREATE FUNCTION reject_training_legacy_scale_artifact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'training_legacy_scale_artifacts are insert-only' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER training_legacy_scale_artifacts_insert_only
  BEFORE UPDATE OR DELETE ON training_legacy_scale_artifacts
  FOR EACH ROW EXECUTE FUNCTION reject_training_legacy_scale_artifact_mutation();
CREATE TRIGGER training_legacy_scale_artifacts_no_truncate
  BEFORE TRUNCATE ON training_legacy_scale_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION reject_training_legacy_scale_artifact_mutation();
