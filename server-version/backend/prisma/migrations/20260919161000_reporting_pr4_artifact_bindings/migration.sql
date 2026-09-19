-- PR4-R03: expand the single reporting artifact authority for longitudinal and protected artifacts.
-- Existing GROUP payloads and hashes are untouched; row-level metadata carries the new dispatch contract.

ALTER TABLE "reporting_analysis_artifacts"
  ADD COLUMN "analysis_kind" TEXT NOT NULL DEFAULT 'GROUP',
  ADD COLUMN "policy_domain" TEXT NOT NULL DEFAULT 'ORG_GROUP_REPORT_V1',
  ADD COLUMN "series_id" TEXT,
  ADD COLUMN "source_run_id" TEXT,
  ADD COLUMN "source_track_id" TEXT,
  ADD COLUMN "subject_actor_snapshot_id" TEXT,
  ADD COLUMN "relationship_kind" TEXT,
  ADD COLUMN "perspective" TEXT;

ALTER TABLE "reporting_analysis_artifacts"
  ALTER COLUMN "cohort_snapshot_id" DROP NOT NULL;

ALTER TABLE "reporting_analysis_artifacts"
  ADD CONSTRAINT "reporting_analysis_artifacts_kind_check"
    CHECK ("analysis_kind" IN ('GROUP','REPEATED_COHORT','MATCHED_LONGITUDINAL','PROTECTED_FEEDBACK')),
  ADD CONSTRAINT "reporting_analysis_artifacts_policy_check"
    CHECK ("policy_domain" IN ('ORG_GROUP_REPORT_V1','ORG_PROTECTED_FEEDBACK_V1')),
  ADD CONSTRAINT "reporting_analysis_artifacts_perspective_check"
    CHECK ("perspective" IS NULL OR "perspective" IN ('SELF_REPORT','OBSERVER_REPORT','RELATIONAL_EXPERIENCE')),
  ADD CONSTRAINT "reporting_analysis_artifacts_source_shape_check" CHECK (
    (
      "analysis_kind"='GROUP'
      AND "policy_domain"='ORG_GROUP_REPORT_V1'
      AND "cohort_snapshot_id" IS NOT NULL
      AND "series_id" IS NULL
      AND "source_run_id" IS NULL AND "source_track_id" IS NULL
      AND "subject_actor_snapshot_id" IS NULL AND "relationship_kind" IS NULL AND "perspective" IS NULL
    )
    OR (
      "analysis_kind" IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
      AND "policy_domain"='ORG_GROUP_REPORT_V1'
      AND "cohort_snapshot_id" IS NULL
      AND "series_id" IS NOT NULL
      AND "source_run_id" IS NULL AND "source_track_id" IS NULL
      AND "subject_actor_snapshot_id" IS NULL AND "relationship_kind" IS NULL AND "perspective" IS NULL
    )
    OR (
      "analysis_kind"='PROTECTED_FEEDBACK'
      AND "policy_domain"='ORG_PROTECTED_FEEDBACK_V1'
      AND "cohort_snapshot_id" IS NULL
      AND "series_id" IS NULL
      AND "source_run_id" IS NOT NULL AND "source_track_id" IS NOT NULL
      AND "subject_actor_snapshot_id" IS NOT NULL
      AND length(btrim("relationship_kind")) > 0
      AND "perspective" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "reporting_analysis_artifacts_series_fkey"
    FOREIGN KEY ("organization_id","series_id") REFERENCES "reporting_series"("organization_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reporting_analysis_artifacts_source_track_fkey"
    FOREIGN KEY ("organization_id","source_run_id","source_track_id") REFERENCES "assessment_run_tracks"("organization_id","run_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reporting_analysis_artifacts_subject_actor_fkey"
    FOREIGN KEY ("organization_id","source_run_id","subject_actor_snapshot_id") REFERENCES "assessment_run_actor_snapshots"("organization_id","run_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "reporting_analysis_artifacts_org_id_id_key"
  ON "reporting_analysis_artifacts"("organization_id","id");
CREATE UNIQUE INDEX "reporting_analysis_artifacts_org_id_series_id_key"
  ON "reporting_analysis_artifacts"("organization_id","id","series_id");
CREATE INDEX "reporting_analysis_artifacts_kind_idx"
  ON "reporting_analysis_artifacts"("organization_id","analysis_kind","generated_at" DESC);

CREATE UNIQUE INDEX "reporting_series_waves_org_series_id_id_key"
  ON "reporting_series_waves"("organization_id","series_id","id");

CREATE TABLE "reporting_analysis_artifact_waves" (
  "organization_id" TEXT NOT NULL,
  "artifact_id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "input_identity_hash" TEXT NOT NULL,
  "wave_snapshot_hash" TEXT NOT NULL,
  CONSTRAINT "reporting_analysis_artifact_waves_ordinal_check" CHECK ("ordinal" >= 1),
  CONSTRAINT "reporting_analysis_artifact_waves_input_hash_check" CHECK ("input_identity_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_analysis_artifact_waves_snapshot_hash_check" CHECK ("wave_snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_analysis_artifact_waves_artifact_fkey"
    FOREIGN KEY ("organization_id","artifact_id","series_id")
    REFERENCES "reporting_analysis_artifacts"("organization_id","id","series_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_artifact_waves_wave_fkey"
    FOREIGN KEY ("organization_id","series_id","wave_id")
    REFERENCES "reporting_series_waves"("organization_id","series_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_analysis_artifact_waves_artifact_wave_key"
  ON "reporting_analysis_artifact_waves"("artifact_id","wave_id");
CREATE UNIQUE INDEX "reporting_analysis_artifact_waves_artifact_ordinal_key"
  ON "reporting_analysis_artifact_waves"("artifact_id","ordinal");

CREATE TRIGGER "reporting_analysis_artifact_waves_immutable"
BEFORE UPDATE OR DELETE ON "reporting_analysis_artifact_waves"
FOR EACH ROW EXECUTE FUNCTION "reject_reporting_snapshot_mutation"();
