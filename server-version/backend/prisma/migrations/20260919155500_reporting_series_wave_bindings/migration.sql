-- PR4-C01: scoped longitudinal Series and immutable Wave bindings.
-- Reporting remains a single authority: Waves bind existing immutable cohort snapshots
-- and freeze the exact authoritative result identities available at bind time.

CREATE TABLE "reporting_series" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "series_key" TEXT NOT NULL,
  "scope" JSONB NOT NULL,
  "series_identity_hash" TEXT NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reporting_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reporting_series_key_check" CHECK (length(btrim("series_key")) > 0),
  CONSTRAINT "reporting_series_scope_shape_check" CHECK (
    jsonb_typeof("scope") = 'object'
    AND ("scope"->>'schemaVersion')::int = 1
    AND "scope"->>'resourceFamily' IN ('BUNDLE','SCALE','COGNITIVE','SITUATIONAL')
    AND length(btrim("scope"->>'resourceKey')) > 0
  ),
  CONSTRAINT "reporting_series_identity_hash_check" CHECK ("series_identity_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_series_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_series_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_series_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_series_org_id_id_key" ON "reporting_series"("organization_id","id");
CREATE UNIQUE INDEX "reporting_series_org_key_key" ON "reporting_series"("organization_id","series_key");
CREATE UNIQUE INDEX "reporting_series_identity_key" ON "reporting_series"("series_identity_hash");

-- Add a composite cohort source key so a Wave cannot bind a cohort id while
-- substituting another Run/Track identity.
CREATE UNIQUE INDEX "reporting_cohort_snapshots_wave_ref_key"
  ON "reporting_cohort_snapshots"("organization_id","id","source_run_id","source_track_id");

CREATE TABLE "reporting_series_waves" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "wave_key" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "cohort_snapshot_id" TEXT NOT NULL,
  "source_run_id" TEXT NOT NULL,
  "source_track_id" TEXT NOT NULL,
  "input_manifest" JSONB NOT NULL,
  "input_identity_hash" TEXT NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reporting_series_waves_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reporting_series_waves_key_check" CHECK (length(btrim("wave_key")) > 0),
  CONSTRAINT "reporting_series_waves_ordinal_check" CHECK ("ordinal" >= 1),
  CONSTRAINT "reporting_series_waves_manifest_shape_check" CHECK (
    jsonb_typeof("input_manifest") = 'object'
    AND ("input_manifest"->>'schemaVersion')::int = 1
    AND jsonb_typeof("input_manifest"->'resolved') = 'array'
    AND jsonb_typeof("input_manifest"->'unresolved') = 'array'
  ),
  CONSTRAINT "reporting_series_waves_input_hash_check" CHECK ("input_identity_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_series_waves_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_series_waves_series_fkey" FOREIGN KEY ("organization_id","series_id") REFERENCES "reporting_series"("organization_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_series_waves_cohort_fkey" FOREIGN KEY ("organization_id","cohort_snapshot_id","source_run_id","source_track_id") REFERENCES "reporting_cohort_snapshots"("organization_id","id","source_run_id","source_track_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reporting_series_waves_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reporting_series_waves_org_id_id_key" ON "reporting_series_waves"("organization_id","id");
CREATE UNIQUE INDEX "reporting_series_waves_series_wave_key" ON "reporting_series_waves"("organization_id","series_id","wave_key");
CREATE UNIQUE INDEX "reporting_series_waves_series_ordinal_key" ON "reporting_series_waves"("organization_id","series_id","ordinal");
CREATE INDEX "reporting_series_waves_source_idx" ON "reporting_series_waves"("organization_id","source_run_id","source_track_id");

CREATE OR REPLACE FUNCTION "reject_reporting_series_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'reporting Series/Wave history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reporting_series_immutable"
BEFORE UPDATE OR DELETE ON "reporting_series"
FOR EACH ROW EXECUTE FUNCTION "reject_reporting_series_mutation"();

CREATE TRIGGER "reporting_series_waves_immutable"
BEFORE UPDATE OR DELETE ON "reporting_series_waves"
FOR EACH ROW EXECUTE FUNCTION "reject_reporting_series_mutation"();
