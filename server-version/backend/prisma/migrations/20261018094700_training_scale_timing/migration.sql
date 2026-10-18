-- Additive opt-in administration provenance. Never backfill historical course scope.
ALTER TABLE composite_assessments ADD COLUMN training_timing_policy jsonb,
 ADD COLUMN timing_export_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_timing_snapshot jsonb;
ALTER TABLE assessments ADD COLUMN timing_encrypted text;
