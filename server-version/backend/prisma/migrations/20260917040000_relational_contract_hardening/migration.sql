-- RA-01 C8: harden consent lineage and freeze cohort privacy contract.
-- Additive only: no historical assessment/attempt backfill.

ALTER TABLE "assessment_attempt_consents"
  ADD COLUMN "prior_consent_id" TEXT;

CREATE UNIQUE INDEX "assessment_attempt_consents_prior_consent_id_key"
  ON "assessment_attempt_consents"("prior_consent_id");

ALTER TABLE "assessment_attempt_consents"
  ADD CONSTRAINT "assessment_attempt_consents_prior_consent_id_fkey"
  FOREIGN KEY ("prior_consent_id") REFERENCES "assessment_attempt_consents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "relational_assessment_assignments"
  ADD COLUMN "analysis_mode" TEXT,
  ADD COLUMN "minimum_respondents" INTEGER,
  ADD COLUMN "applicability_hash" TEXT;

ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_analysis_mode_check"
    CHECK ("analysis_mode" IS NULL OR "analysis_mode" IN ('INDIVIDUAL_ONLY', 'COHORT_AGGREGATE')),
  ADD CONSTRAINT "relational_assignment_minimum_respondents_check"
    CHECK ("minimum_respondents" IS NULL OR "minimum_respondents" >= 3),
  ADD CONSTRAINT "relational_assignment_applicability_hash_check"
    CHECK ("applicability_hash" IS NULL OR "applicability_hash" ~ '^[0-9a-f]{64}$');

CREATE INDEX "relational_assignment_cohort_scope_idx"
  ON "relational_assessment_assignments"(
    "subject_user_id", "episode_id", "resource_kind", "resource_key", "resource_version", "status"
  );
