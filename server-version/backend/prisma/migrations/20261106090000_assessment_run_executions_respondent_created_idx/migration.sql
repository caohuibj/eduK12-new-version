-- Respondent-direct execution lookup for the run-tasks inbox query.
--
-- Evidence (full production listAssignedRunTasks SQL, 447 lines / 27 params,
-- 1,000,000 executions, NON-EMPTY authorized success path, isolated synthetic DB):
--   without index : service median 7,051 ms (first run 3,053 ms, max 13,987 ms)
--   with index    : service median    45 ms
--   ~158x; returned executionId set, ordering and statuses IDENTICAL between arms
--   unauthorized identity: 0 rows on both arms
--   index size 78 MB at ~2M execution rows; 10x1000-row insert batches showed
--   no measurable write degradation in the experiment
-- Fixture caveat: the non-empty measurement used a LEGACY product-domain org;
-- SCHOOL-domain runs (huiteacher/campus event wiring) were not exercised at
-- this scale.
--
-- Locking: plain CREATE INDEX takes a SHARE lock on assessment_run_executions
-- (writes wait, reads continue) for the duration of the build.
-- Prisma 5 migrate deploy runs a multi-statement migration script as one
-- implicit transaction; a script whose only statement is
-- CREATE INDEX CONCURRENTLY is not wrapped. This migration keeps the plain
-- form. Optional out-of-band path for a large table: build the same index
-- with CREATE INDEX CONCURRENTLY first; IF NOT EXISTS then makes this file a
-- no-op. A failed or cancelled CONCURRENTLY build leaves an INVALID index with
-- this name that IF NOT EXISTS would silently keep, so before running migrate
-- check pg_index.indisvalid for it and, if false, DROP INDEX CONCURRENTLY and
-- rebuild it.
CREATE INDEX IF NOT EXISTS
  "assessment_run_executions_respondent_created_idx"
  ON "assessment_run_executions" ("respondent_actor_snapshot_id", "created_at" DESC);
