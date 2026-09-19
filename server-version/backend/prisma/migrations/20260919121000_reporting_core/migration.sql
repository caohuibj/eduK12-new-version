CREATE TABLE "reporting_analysis_specs" (
  "id" TEXT NOT NULL,
  "spec_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "definition" JSONB NOT NULL,
  "spec_hash" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "reviewed_by_user_id" TEXT,
  "published_by_user_id" TEXT,
  "retired_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "retired_at" TIMESTAMPTZ(6),
  CONSTRAINT "reporting_analysis_specs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reporting_analysis_specs_version_check" CHECK ("version" >= 1),
  CONSTRAINT "reporting_analysis_specs_status_check" CHECK ("status" IN ('DRAFT','REVIEWED','PUBLISHED','RETIRED')),
  CONSTRAINT "reporting_analysis_specs_key_check" CHECK (length(btrim("spec_key")) > 0),
  CONSTRAINT "reporting_analysis_specs_hash_check" CHECK ("spec_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_analysis_specs_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_specs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_specs_published_by_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_specs_retired_by_fkey" FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_analysis_specs_key_version_key" ON "reporting_analysis_specs"("spec_key", "version");
CREATE INDEX "reporting_analysis_specs_status_idx" ON "reporting_analysis_specs"("status", "spec_key", "version" DESC);

CREATE OR REPLACE FUNCTION "reporting_spec_transition_guard"()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT','REVIEWED') THEN
    RAISE EXCEPTION 'invalid reporting spec transition from DRAFT';
  ELSIF OLD.status = 'REVIEWED' AND NEW.status NOT IN ('REVIEWED','PUBLISHED') THEN
    RAISE EXCEPTION 'invalid reporting spec transition from REVIEWED';
  ELSIF OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','RETIRED') THEN
    RAISE EXCEPTION 'invalid reporting spec transition from PUBLISHED';
  ELSIF OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED' THEN
    RAISE EXCEPTION 'retired reporting spec is immutable';
  END IF;
  IF OLD.status IN ('PUBLISHED','RETIRED') AND (
    NEW.definition IS DISTINCT FROM OLD.definition
    OR NEW.spec_hash IS DISTINCT FROM OLD.spec_hash
    OR NEW.spec_key IS DISTINCT FROM OLD.spec_key
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'published reporting spec definition is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "reporting_spec_transition_guard_trigger"
BEFORE UPDATE ON "reporting_analysis_specs"
FOR EACH ROW EXECUTE FUNCTION "reporting_spec_transition_guard"();

CREATE TABLE "reporting_cohort_snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL DEFAULT 'RUN_TRACK',
  "source_run_id" TEXT NOT NULL,
  "source_track_id" TEXT NOT NULL,
  "selector" JSONB NOT NULL,
  "members" JSONB NOT NULL,
  "eligible_n" INTEGER NOT NULL,
  "cohort_identity_hash" TEXT NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "generated_by_user_id" TEXT NOT NULL,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reporting_cohort_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reporting_cohort_snapshots_source_check" CHECK ("source_kind" = 'RUN_TRACK'),
  CONSTRAINT "reporting_cohort_snapshots_n_check" CHECK ("eligible_n" >= 0),
  CONSTRAINT "reporting_cohort_snapshots_identity_hash_check" CHECK ("cohort_identity_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_cohort_snapshots_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_cohort_snapshots_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_cohort_snapshots_track_fkey" FOREIGN KEY ("organization_id", "source_run_id", "source_track_id") REFERENCES "assessment_run_tracks"("organization_id", "run_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_cohort_snapshots_generated_by_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_cohort_snapshots_org_id_id_key" ON "reporting_cohort_snapshots"("organization_id", "id");
CREATE UNIQUE INDEX "reporting_cohort_snapshots_identity_key" ON "reporting_cohort_snapshots"("organization_id", "cohort_identity_hash");
CREATE INDEX "reporting_cohort_snapshots_source_idx" ON "reporting_cohort_snapshots"("organization_id", "source_run_id", "source_track_id", "generated_at" DESC);

CREATE TABLE "reporting_analysis_artifacts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "cohort_snapshot_id" TEXT NOT NULL,
  "spec_id" TEXT NOT NULL,
  "analysis_identity_hash" TEXT NOT NULL,
  "artifact_payload" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "generated_by_user_id" TEXT NOT NULL,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reporting_analysis_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reporting_analysis_artifacts_identity_hash_check" CHECK ("analysis_identity_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_analysis_artifacts_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_analysis_artifacts_cohort_fkey" FOREIGN KEY ("organization_id", "cohort_snapshot_id") REFERENCES "reporting_cohort_snapshots"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_artifacts_spec_fkey" FOREIGN KEY ("spec_id") REFERENCES "reporting_analysis_specs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_analysis_artifacts_generated_by_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_analysis_artifacts_identity_key" ON "reporting_analysis_artifacts"("analysis_identity_hash");
CREATE INDEX "reporting_analysis_artifacts_org_created_idx" ON "reporting_analysis_artifacts"("organization_id", "generated_at" DESC);
