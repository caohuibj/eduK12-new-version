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
-- this scale. Review decision pending: this migration alone does not approve
-- anything.
--
-- CONCURRENTLY note: prisma migrate runs migrations inside a transaction, so
-- this file uses a plain CREATE INDEX (brief write lock while building). If
-- the production table is expected to be much larger at deploy time, apply
-- CONCURRENTLY out-of-band first and keep this migration as a no-op guard.
CREATE INDEX IF NOT EXISTS
  "assessment_run_executions_respondent_created_idx"
  ON "assessment_run_executions" ("respondent_actor_snapshot_id", "created_at" DESC);
