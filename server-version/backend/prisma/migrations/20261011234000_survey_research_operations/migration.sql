-- PR4 operations: opt-in group quotas and encrypted temporary checkpoints.
-- No backfill of existing attempts or mutation of immutable FINALs.
ALTER TABLE "survey_waves"
  ADD COLUMN "quota_policy" JSONB,
  ADD COLUMN "checkpoint_policy" JSONB;
CREATE TABLE "survey_experiment_quota_buckets" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL REFERENCES "survey_waves"("id") ON DELETE RESTRICT,
  "group_key" TEXT NOT NULL,
  "max_assigned" INTEGER NOT NULL,
  "assigned_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_quota_positive" CHECK ("max_assigned" BETWEEN 1 AND 10000),
  CONSTRAINT "survey_quota_count_bounds" CHECK ("assigned_count" >= 0 AND "assigned_count" <= "max_assigned"),
  CONSTRAINT "survey_quota_bucket_wave_group_uniq" UNIQUE ("wave_id","group_key")
);
CREATE INDEX "survey_quota_bucket_project_wave_idx"
  ON "survey_experiment_quota_buckets"("project_id","wave_id");
CREATE TABLE "survey_attempt_checkpoints" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "wave_id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL UNIQUE,
  "definition_digest" TEXT NOT NULL,
  "content_cipher" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_checkpoint_version_positive" CHECK ("version" >= 0),
  CONSTRAINT "survey_checkpoint_attempt_project_wave_fk"
    FOREIGN KEY ("attempt_id","project_id","wave_id")
    REFERENCES "survey_wave_attempts"("id","project_id","wave_id") ON DELETE CASCADE
);
CREATE INDEX "survey_checkpoint_expiry_idx" ON "survey_attempt_checkpoints"("expires_at");
CREATE INDEX "survey_checkpoint_project_wave_idx"
  ON "survey_attempt_checkpoints"("project_id","wave_id");
