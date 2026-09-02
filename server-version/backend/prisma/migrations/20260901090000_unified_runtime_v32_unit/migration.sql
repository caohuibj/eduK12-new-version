-- V32-1 Unified Unit Runtime. All additions are nullable or new tables so
-- historical rows remain LEGACY by the application-level NULL fallback.
CREATE TYPE "RuntimeGeneration" AS ENUM ('LEGACY', 'UNIFIED_V1');
CREATE TYPE "AssessmentUnitType" AS ENUM ('SCALE', 'COGNITIVE', 'FORM_SECTION');
CREATE TYPE "AssessmentUnitTerminalState" AS ENUM ('COMPLETED', 'SKIPPED', 'NOT_APPLICABLE');
CREATE TYPE "AssessmentUnitPayloadKind" AS ENUM ('UNIT_RESULT', 'COLLECTION_FACTS', 'NONE');

ALTER TABLE "assessments"
  ADD COLUMN "runtime_generation" "RuntimeGeneration",
  ADD COLUMN "runtime_snapshot_encrypted" TEXT,
  ADD COLUMN "compiled_runtime_hash" TEXT;

ALTER TABLE "questionnaire_assessments"
  ADD COLUMN "runtime_generation" "RuntimeGeneration",
  ADD COLUMN "frozen_active_slot_set_encrypted" TEXT,
  ADD COLUMN "frozen_active_slot_set_hash" TEXT;

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "runtime_generation" "RuntimeGeneration",
  ADD COLUMN "frozen_active_slot_set_encrypted" TEXT,
  ADD COLUMN "frozen_active_slot_set_hash" TEXT;

ALTER TABLE "cognitive_sessions"
  ADD COLUMN "runtime_generation" "RuntimeGeneration",
  ADD COLUMN "compiled_runtime_hash" TEXT;

CREATE TABLE "cognitive_raw_submissions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "attempt_epoch" INTEGER NOT NULL,
    "trial_count" INTEGER NOT NULL,
    "payload_encrypted" TEXT NOT NULL,
    "payload_schema_version" INTEGER NOT NULL,
    "encoding_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cognitive_raw_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cognitive_raw_submissions_session_epoch_key"
  ON "cognitive_raw_submissions"("session_id", "attempt_epoch");
CREATE INDEX "cognitive_raw_submissions_session_id_idx"
  ON "cognitive_raw_submissions"("session_id");

CREATE TABLE "assessment_unit_snapshots" (
    "id" TEXT NOT NULL,
    "questionnaire_assessment_id" TEXT,
    "composite_attempt_id" TEXT,
    "attempt_epoch" INTEGER NOT NULL,
    "slot_key" TEXT NOT NULL,
    "unit_type" "AssessmentUnitType" NOT NULL,
    "terminal_state" "AssessmentUnitTerminalState" NOT NULL,
    "payload_kind" "AssessmentUnitPayloadKind" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_attempt_id" TEXT NOT NULL,
    "source_submission_id" TEXT,
    "source_definition_hash" TEXT,
    "compiled_runtime_hash" TEXT,
    "canonical_result_encrypted" TEXT,
    "collection_facts_encrypted" TEXT,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_unit_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_unit_snapshots_one_parent_check"
      CHECK (("questionnaire_assessment_id" IS NOT NULL)::integer + ("composite_attempt_id" IS NOT NULL)::integer = 1)
);

CREATE UNIQUE INDEX "assessment_unit_snapshots_questionnaire_slot_key"
  ON "assessment_unit_snapshots"("questionnaire_assessment_id", "attempt_epoch", "slot_key");
CREATE UNIQUE INDEX "assessment_unit_snapshots_composite_slot_key"
  ON "assessment_unit_snapshots"("composite_attempt_id", "attempt_epoch", "slot_key");
CREATE UNIQUE INDEX "assessment_unit_snapshots_questionnaire_source_key"
  ON "assessment_unit_snapshots"("questionnaire_assessment_id", "attempt_epoch", "source_attempt_id");
CREATE UNIQUE INDEX "assessment_unit_snapshots_composite_source_key"
  ON "assessment_unit_snapshots"("composite_attempt_id", "attempt_epoch", "source_attempt_id");
CREATE INDEX "assessment_unit_snapshots_questionnaire_terminal_idx"
  ON "assessment_unit_snapshots"("questionnaire_assessment_id", "attempt_epoch", "terminal_state");
CREATE INDEX "assessment_unit_snapshots_composite_terminal_idx"
  ON "assessment_unit_snapshots"("composite_attempt_id", "attempt_epoch", "terminal_state");

ALTER TABLE "cognitive_raw_submissions"
  ADD CONSTRAINT "cognitive_raw_submissions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "cognitive_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_unit_snapshots"
  ADD CONSTRAINT "assessment_unit_snapshots_questionnaire_assessment_id_fkey"
  FOREIGN KEY ("questionnaire_assessment_id") REFERENCES "questionnaire_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "assessment_unit_snapshots_composite_attempt_id_fkey"
  FOREIGN KEY ("composite_attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
