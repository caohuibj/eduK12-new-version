-- Convert 100%-NULL nullable-FK indexes on assessment_unit_snapshots and
-- assessments into partial indexes with identical index names.
--
-- Production measurement (2026-11-23):
--   assessment_unit_snapshots: 590,824 total rows, 0 with non-null questionnaire_assessment_id
--     -> 3 legacy questionnaire indexes consumed 71 MB (58 + 6.4 + 6.4 MB) indexing pure NULLs
--   assessments: 601,189 total rows, 0 with non-null questionnaire_assessment_id or episode_id
--     -> 2 legacy indexes consumed 14.6 MB (7.3 + 7.3 MB) indexing pure NULLs
--
-- Safety & Rollout:
--   1. Each replacement partial index is created under a temporary name BEFORE
--      dropping the old full index and renaming, so uniqueness enforcement and
--      index coverage are never absent even if a step fails before completion.
--   2. Prisma 5 wraps multi-statement migration scripts in a single transaction,
--      making each create/drop/rename atomic.
--   3. Optional zero-write-block pre-stage on busy tables: create the 5 `*_p2`
--      indexes beforehand via `CREATE [UNIQUE] INDEX CONCURRENTLY ...`, verify
--      `pg_index.indisvalid = true`, then let `prisma migrate deploy` perform
--      only the instantaneous metadata drop + rename.

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_slot_key_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "slot_key")
  WHERE "questionnaire_assessment_id" IS NOT NULL;
DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_slot_key";
ALTER INDEX "assessment_unit_snapshots_questionnaire_slot_key_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_slot_key";

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_source_key_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "source_attempt_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;
DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_source_key";
ALTER INDEX "assessment_unit_snapshots_questionnaire_source_key_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_source_key";

CREATE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_terminal_idx_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "terminal_state")
  WHERE "questionnaire_assessment_id" IS NOT NULL;
DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_terminal_idx";
ALTER INDEX "assessment_unit_snapshots_questionnaire_terminal_idx_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_terminal_idx";

CREATE INDEX IF NOT EXISTS "assessments_questionnaire_assessment_id_idx_p2"
  ON "assessments" ("questionnaire_assessment_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;
DROP INDEX IF EXISTS "assessments_questionnaire_assessment_id_idx";
ALTER INDEX "assessments_questionnaire_assessment_id_idx_p2"
  RENAME TO "assessments_questionnaire_assessment_id_idx";

CREATE INDEX IF NOT EXISTS "assessments_episode_id_idx_p2"
  ON "assessments" ("episode_id")
  WHERE "episode_id" IS NOT NULL;
DROP INDEX IF EXISTS "assessments_episode_id_idx";
ALTER INDEX "assessments_episode_id_idx_p2"
  RENAME TO "assessments_episode_id_idx";
