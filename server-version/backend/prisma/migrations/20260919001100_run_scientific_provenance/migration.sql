ALTER TABLE "assessment_run_executions"
  ADD COLUMN "scientific_maturity" TEXT,
  ADD COLUMN "scientific_provenance" JSONB,
  ADD COLUMN "scientific_provenance_hash" TEXT,
  ADD COLUMN "scientific_frozen_at" TIMESTAMPTZ(6);

ALTER TABLE "assessment_run_executions"
  ADD CONSTRAINT "assessment_run_execution_science_shape_check" CHECK (
    ("scientific_maturity" IS NULL AND "scientific_provenance" IS NULL AND "scientific_provenance_hash" IS NULL AND "scientific_frozen_at" IS NULL)
    OR
    ("scientific_maturity" IN ('PILOT','RESEARCH_READY','RESEARCH_GRADE')
      AND "scientific_provenance" IS NOT NULL
      AND "scientific_provenance_hash" ~ '^[0-9a-f]{64}$'
      AND "scientific_frozen_at" IS NOT NULL)
  );
