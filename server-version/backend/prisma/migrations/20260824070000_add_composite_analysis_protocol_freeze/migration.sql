ALTER TABLE "composite_assessments"
  ADD COLUMN "analysis_protocol_key" TEXT,
  ADD COLUMN "analysis_protocol_version" TEXT,
  ADD COLUMN "analysis_protocol_snapshot_encrypted" TEXT;

ALTER TABLE "composite_assessments"
  ADD CONSTRAINT "composite_analysis_protocol_pair_check"
  CHECK (
    ("analysis_protocol_key" IS NULL AND "analysis_protocol_version" IS NULL AND "analysis_protocol_snapshot_encrypted" IS NULL)
    OR
    ("analysis_protocol_key" IS NOT NULL AND "analysis_protocol_version" IS NOT NULL)
  );
