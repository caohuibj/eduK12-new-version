-- V32-4 Frozen Unit Admission: additive child-attempt snapshots for Cognitive
-- sessions and Form section attempts. Historical UNIFIED_V1 rows stay nullable;
-- delivery/submit activates once or fail-closes.
ALTER TABLE "cognitive_sessions" ADD COLUMN "frozen_admission_snapshot_encrypted" TEXT;
ALTER TABLE "cognitive_sessions" ADD COLUMN "frozen_admission_snapshot_hash" TEXT;
ALTER TABLE "questionnaire_form_section_attempts" ADD COLUMN "frozen_admission_snapshot_encrypted" TEXT;
ALTER TABLE "questionnaire_form_section_attempts" ADD COLUMN "frozen_admission_snapshot_hash" TEXT;
ALTER TABLE "composite_form_section_attempts" ADD COLUMN "frozen_admission_snapshot_encrypted" TEXT;
ALTER TABLE "composite_form_section_attempts" ADD COLUMN "frozen_admission_snapshot_hash" TEXT;
