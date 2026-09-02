-- V32-2 Closed Aggregate Runtime. All additions are nullable so historical
-- LEGACY and PR40 FINAL_ONLY rows retain their existing semantics.
ALTER TABLE "questionnaire_assessments"
  ADD COLUMN "aggregate_input_hash" TEXT;

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "aggregate_input_hash" TEXT,
  ADD COLUMN "compiled_bundle_runtime_hash" TEXT;

ALTER TABLE "composite_analysis_snapshots"
  ADD COLUMN "aggregate_input_hash" TEXT,
  ADD COLUMN "hash_scheme" TEXT,
  ADD COLUMN "compiled_bundle_runtime_hash" TEXT,
  ADD COLUMN "attempt_epoch" INTEGER,
  ADD COLUMN "context_hash" TEXT,
  ADD COLUMN "runtime_generation" "RuntimeGeneration";
