-- Convert 100%-NULL nullable-FK indexes on assessment_unit_snapshots and
-- assessments into partial indexes with identical index names.
--
-- Production measurement (2026-11-23):
--   assessment_unit_snapshots: 590,824 total rows, 0 with non-null questionnaire_assessment_id
--     -> 3 legacy questionnaire indexes consumed 71 MB (58 + 6.4 + 6.4 MB) indexing pure NULLs
--   assessments: 601,189 total rows, 0 with non-null questionnaire_assessment_id or episode_id
--     -> 2 legacy indexes consumed 14.6 MB (7.3 + 7.3 MB) indexing pure NULLs
--
-- Uniqueness semantics for non-null rows are 100% preserved (PostgreSQL UNIQUE
-- already allows arbitrary duplicate NULLs), index names remain identical for
-- contract tests, and every composite scale INSERT skips 5 wasted B-tree page writes.

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_slot_key";
CREATE UNIQUE INDEX "assessment_unit_snapshots_questionnaire_slot_key"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "slot_key")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_source_key";
CREATE UNIQUE INDEX "assessment_unit_snapshots_questionnaire_source_key"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "source_attempt_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_terminal_idx";
CREATE INDEX "assessment_unit_snapshots_questionnaire_terminal_idx"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "terminal_state")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

DROP INDEX IF EXISTS "assessments_questionnaire_assessment_id_idx";
CREATE INDEX "assessments_questionnaire_assessment_id_idx"
  ON "assessments" ("questionnaire_assessment_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

DROP INDEX IF EXISTS "assessments_episode_id_idx";
CREATE INDEX "assessments_episode_id_idx"
  ON "assessments" ("episode_id")
  WHERE "episode_id" IS NOT NULL;
