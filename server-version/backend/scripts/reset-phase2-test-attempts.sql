-- =============================================================================
-- Phase 2 Trial Environment Composite Attempt Reset Script
-- =============================================================================
-- PURPOSE:
--   Cleanly wipes all pilot/trial composite attempt records (Training, School,
--   Teacher) and their legacy child rows before enabling Phase 2 single-row
--   FINAL (`COMPOSITE_WHOLE_V2_ENABLED=true`).
--
-- DESTRUCTIVE SCOPE WARNING:
--   This script deletes ALL composite_assessment_attempts and ALL composite-bound
--   child attempt/evidence rows in the target database (intended ONLY for trial
--   environments with synthetic/test data). An explicit confirmation variable is
--   mandatory to prevent accidental execution against a real production DB.
--
-- STRICTLY PRESERVED (NEVER TOUCHED):
--   - users, organizations, courses, classrooms, memberships, enrollments
--   - scales, scale_library_*, assessment_reference_sets
--   - cognitive_test_configs, cognitive_assignments
--   - sjt_author_releases, sjt_release_grants
--   - composite_assessments, composite_assessment_items, composite_form_sections
--   - assessment_runs, assessment_run_tracks, assessment_run_actor_snapshots
--   - survey_* (all Survey waves & finals)
--   - Standalone (non-composite) assessments / cognitive_sessions / situational_attempts
--
-- TRANSACTIONAL SAFETY:
--   Immutability triggers on composite-attempt evidence tables are temporarily
--   disabled inside this single transaction and re-enabled before COMMIT; if
--   any statement fails, PostgreSQL rolls back everything including trigger state.
--
-- USAGE (confirmation flag required):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v CONFIRM_RESET_ALL_COMPOSITE_ATTEMPTS=YES \
--     -f server-version/backend/scripts/reset-phase2-test-attempts.sql
-- =============================================================================

\if :{?CONFIRM_RESET_ALL_COMPOSITE_ATTEMPTS}
\else
  DO $$ BEGIN RAISE EXCEPTION 'ABORTED: Refusing to wipe composite attempts without -v CONFIRM_RESET_ALL_COMPOSITE_ATTEMPTS=YES'; END $$;
\endif

SELECT CASE
  WHEN :'CONFIRM_RESET_ALL_COMPOSITE_ATTEMPTS' = 'YES' THEN 'CONFIRMED'
  ELSE (1 / 0)::text
END AS reset_confirmation_guard;

BEGIN;

-- Temporarily suspend immutability triggers on pilot composite-attempt tables
-- (all re-enabled unconditionally before COMMIT).
ALTER TABLE "assessment_run_executions" DISABLE TRIGGER "education_personal_snapshots_append";
ALTER TABLE "training_attempt_checkpoints" DISABLE TRIGGER "training_checkpoint_guard";
ALTER TABLE "composite_attempt_finals" DISABLE TRIGGER "composite_attempt_finals_immutable_guard";
ALTER TABLE "assessment_frozen_bindings" DISABLE TRIGGER "assessment_frozen_bindings_immutable";
ALTER TABLE "training_interpretation_artifacts" DISABLE TRIGGER "training_interpretation_artifacts_guard";
ALTER TABLE "training_analysis_quality" DISABLE TRIGGER "training_analysis_quality_guard";
ALTER TABLE "training_analysis_quality_audit" DISABLE TRIGGER "training_analysis_quality_audit_immutable";
ALTER TABLE "training_material_allocation_claims" DISABLE TRIGGER "training_material_claim_immutable";
ALTER TABLE "huiteacher_field_form_evidence" DISABLE TRIGGER "huiteacher_field_form_evidence_guard";

-- 1. Reset composite-bound relational assignments & Run execution pointers so
--    pilot runs remain reusable for fresh WHOLE_V2 tests.
--    IMPORTANT ORDER: update relational_assessment_assignments FIRST (using
--    relational_assignment_status_check valid value 'OPEN'), then delete start
--    claims, then clear BOTH runtime_binding_kind AND runtime_binding_ref to
--    satisfy assessment_run_executions_binding_shape_check.
UPDATE "relational_assessment_assignments" r
SET "status" = 'OPEN',
    "started_at" = NULL,
    "completed_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
FROM "assessment_run_executions" e
WHERE e."relational_assignment_id" = r."id"
  AND e."runtime_binding_kind" = 'COMPOSITE'
  AND e."runtime_binding_ref" IS NOT NULL;

DELETE FROM "assessment_run_execution_start_claims" c
USING "assessment_run_executions" e
WHERE c."execution_id" = e."id"
  AND e."runtime_binding_kind" = 'COMPOSITE';

UPDATE "assessment_run_executions"
SET "status" = 'ASSIGNED',
    "runtime_binding_kind" = NULL,
    "runtime_binding_ref" = NULL,
    "started_at" = NULL,
    "completed_at" = NULL,
    "personal_changes_snapshots" = '{}'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "runtime_binding_kind" = 'COMPOSITE'
  AND "runtime_binding_ref" IS NOT NULL;

-- 2. Remove composite-bound evidence / report / interpretation / checkpoint /
--    analysis artifacts that reference composite attempts (ON DELETE RESTRICT).
DELETE FROM "huiteacher_field_form_evidence" WHERE "attempt_id" IS NOT NULL;
DELETE FROM "training_interpretation_artifacts";
DELETE FROM "training_analysis_quality_audit";
DELETE FROM "training_analysis_quality";
DELETE FROM "anonymous_study_attempts";
DELETE FROM "training_material_allocation_claims";
DELETE FROM "composite_analysis_snapshots";
DELETE FROM "composite_report_jobs";
DELETE FROM "composite_attempt_checkpoints";
DELETE FROM "training_attempt_checkpoints";
DELETE FROM "composite_attempt_finals";

-- 3. Remove composite-bound child unit rows ONLY (standalone single-instrument
--    rows where composite_attempt_id IS NULL are strictly preserved).
DELETE FROM "assessment_unit_snapshots"
WHERE "composite_attempt_id" IS NOT NULL;

DELETE FROM "assessment_result_facts" f
USING "assessments" a
WHERE f."assessment_id" = a."id"
  AND a."composite_attempt_id" IS NOT NULL;

DELETE FROM "assessment_frozen_bindings"
WHERE "composite_attempt_id" IS NOT NULL;

DELETE FROM "composite_form_answers";
DELETE FROM "composite_form_section_attempts";

DELETE FROM "cognitive_raw_submissions" s
USING "cognitive_sessions" c
WHERE s."session_id" = c."id"
  AND c."composite_attempt_id" IS NOT NULL;

DELETE FROM "cognitive_trials" t
USING "cognitive_sessions" c
WHERE t."session_id" = c."id"
  AND c."composite_attempt_id" IS NOT NULL;

DELETE FROM "cognitive_sessions"
WHERE "composite_attempt_id" IS NOT NULL;

DELETE FROM "situational_raw_submissions" r
USING "situational_attempts" s
WHERE r."attempt_id" = s."id"
  AND s."composite_attempt_id" IS NOT NULL;

DELETE FROM "situational_attempts"
WHERE "composite_attempt_id" IS NOT NULL;

DELETE FROM "assessments"
WHERE "composite_attempt_id" IS NOT NULL;

-- 4. Remove composite attempt parent rows.
DELETE FROM "composite_assessment_attempts";

-- Re-enable all immutability triggers before committing.
ALTER TABLE "huiteacher_field_form_evidence" ENABLE TRIGGER "huiteacher_field_form_evidence_guard";
ALTER TABLE "training_material_allocation_claims" ENABLE TRIGGER "training_material_claim_immutable";
ALTER TABLE "training_analysis_quality_audit" ENABLE TRIGGER "training_analysis_quality_audit_immutable";
ALTER TABLE "training_analysis_quality" ENABLE TRIGGER "training_analysis_quality_guard";
ALTER TABLE "training_interpretation_artifacts" ENABLE TRIGGER "training_interpretation_artifacts_guard";
ALTER TABLE "assessment_frozen_bindings" ENABLE TRIGGER "assessment_frozen_bindings_immutable";
ALTER TABLE "composite_attempt_finals" ENABLE TRIGGER "composite_attempt_finals_immutable_guard";
ALTER TABLE "training_attempt_checkpoints" ENABLE TRIGGER "training_checkpoint_guard";
ALTER TABLE "assessment_run_executions" ENABLE TRIGGER "education_personal_snapshots_append";

COMMIT;
