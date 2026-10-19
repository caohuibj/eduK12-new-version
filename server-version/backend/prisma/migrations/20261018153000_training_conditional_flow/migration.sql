-- Explicit opt-in only. Historical publications and accepted facts remain untouched.
ALTER TABLE composite_assessments
  ADD COLUMN training_flow_draft JSONB,
  ADD COLUMN training_flow_frozen JSONB,
  ADD COLUMN training_flow_digest TEXT;
ALTER TABLE composite_assessment_attempts
  ADD COLUMN training_flow_snapshot_encrypted TEXT,
  ADD COLUMN training_flow_snapshot_hash TEXT,
  ADD COLUMN training_flow_path_encrypted TEXT,
  ADD COLUMN training_flow_path_hash TEXT;
