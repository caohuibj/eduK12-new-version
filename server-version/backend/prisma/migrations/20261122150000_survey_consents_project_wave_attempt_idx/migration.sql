-- Direct attempt-scoped consent lookup for Survey FINAL, GENERAL feedback,
-- task authority, and screen-out checks.
--
-- Without this index, `WHERE project_id = $1 AND wave_id = $2 AND attempt_id = $3`
-- falls back to `survey_consents_project_wave_idx` (or a Seq Scan), scanning
-- every consent row in the wave (13,744+ rows per wave in production; 43.5M
-- seq_tup_read observed). With this index it becomes a single B-tree lookup.
--
-- Locking: plain CREATE INDEX takes a SHARE lock on survey_consents while
-- building (milliseconds on ~20k rows). Optional out-of-band path: create with
-- CREATE INDEX CONCURRENTLY first; IF NOT EXISTS makes migrate deploy a no-op.
CREATE INDEX IF NOT EXISTS
  "survey_consents_project_wave_attempt_idx"
  ON "survey_consents" ("project_id", "wave_id", "attempt_id");
