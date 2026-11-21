ALTER TABLE composite_assessments ADD COLUMN receipt_only boolean NOT NULL DEFAULT false;
ALTER TABLE composite_assessment_attempts ADD COLUMN receipt_only boolean NOT NULL DEFAULT false;
ALTER TABLE assessment_run_tracks ADD COLUMN receipt_only boolean NOT NULL DEFAULT false;
