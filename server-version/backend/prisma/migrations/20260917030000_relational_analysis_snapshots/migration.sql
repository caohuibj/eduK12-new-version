-- RA-01 C6: frozen relational-analysis snapshots above canonical results.
-- This table is append-only by application contract and is not part of UNIT FINAL.

CREATE TABLE "relational_analysis_snapshots" (
  "id" TEXT NOT NULL,
  "subject_user_id" TEXT NOT NULL,
  "resource_kind" TEXT NOT NULL,
  "resource_key" TEXT NOT NULL,
  "resource_version" TEXT NOT NULL,
  "analysis_kind" TEXT NOT NULL,
  "policy_key" TEXT NOT NULL,
  "policy_version" TEXT NOT NULL,
  "policy_hash" TEXT NOT NULL,
  "respondent_count" INTEGER NOT NULL,
  "input_result_hashes_json" JSONB NOT NULL,
  "payload_json" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relational_analysis_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relational_analysis_kind_check" CHECK ("analysis_kind" IN ('COHORT_AGGREGATE')),
  CONSTRAINT "relational_analysis_policy_hash_check" CHECK ("policy_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "relational_analysis_snapshot_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "relational_analysis_respondent_count_check" CHECK ("respondent_count" >= 3)
);

CREATE UNIQUE INDEX "relational_analysis_snapshot_hash_key"
  ON "relational_analysis_snapshots"("snapshot_hash");
CREATE INDEX "relational_analysis_subject_resource_created_idx"
  ON "relational_analysis_snapshots"("subject_user_id", "resource_kind", "resource_key", "created_at" DESC);

ALTER TABLE "relational_analysis_snapshots"
  ADD CONSTRAINT "relational_analysis_subject_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
