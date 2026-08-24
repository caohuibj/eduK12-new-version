-- PR8: immutable package-scoped cognitive analysis snapshots.
-- The completion snapshot is the historical default; explicit reanalysis is
-- append-only and is never represented by a latest flag.

CREATE TYPE "CompositeAnalysisSnapshotGenerationReason" AS ENUM ('COMPLETION', 'REANALYSIS');

CREATE TABLE "composite_analysis_snapshots" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "package_key" TEXT NOT NULL,
    "package_version" TEXT NOT NULL,
    "analysis_definition_version" TEXT NOT NULL,
    "analysis_version" TEXT NOT NULL,
    "report_schema_version" TEXT NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "generation_reason" "CompositeAnalysisSnapshotGenerationReason" NOT NULL,
    "generated_by" TEXT,
    "payload_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composite_analysis_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_analysis_snapshots_attempt_version_fingerprint_key"
    ON "composite_analysis_snapshots"("attempt_id", "analysis_version", "input_fingerprint");

CREATE INDEX "composite_analysis_snapshots_attempt_reason_created_idx"
    ON "composite_analysis_snapshots"("attempt_id", "generation_reason", "created_at");

ALTER TABLE "composite_analysis_snapshots"
  ADD CONSTRAINT "composite_analysis_snapshots_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "composite_assessment_attempts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "composite_analysis_snapshots"
  ADD CONSTRAINT "composite_analysis_snapshots_generated_by_fkey"
  FOREIGN KEY ("generated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
