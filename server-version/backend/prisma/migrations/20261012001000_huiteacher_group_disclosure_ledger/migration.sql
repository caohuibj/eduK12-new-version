-- Whole Teacher Form cohorts: repeated release using the same frozen
-- definition cannot change respondent composition and enable differencing.
-- This table does not expose respondent IDs; it stores only a stable digest.
CREATE TABLE "huiteacher_group_disclosure_ledgers" (
  "organization_id" TEXT NOT NULL,
  "definition_digest" TEXT NOT NULL,
  "population_digest" TEXT NOT NULL,
  "first_run_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("organization_id","definition_digest"),
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("organization_id","first_run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CHECK ("definition_digest" ~ '^[a-f0-9]{64}$'),
  CHECK ("population_digest" ~ '^[a-f0-9]{64}$')
);
