-- Run only in the isolated synthetic test database with psql -v ON_ERROR_STOP=1 -f.
-- Real migration SQL against minimal tables; transaction rolls back all test objects.
BEGIN;
CREATE SCHEMA cognitive_protocol_migration_test;
SET LOCAL search_path TO cognitive_protocol_migration_test;
CREATE TABLE survey_publications(id TEXT PRIMARY KEY,compiled_snapshot JSONB NOT NULL);
CREATE TABLE survey_cognitive_results(publication_id TEXT,slot_key TEXT,measurement_digest TEXT,trial_count INTEGER NOT NULL,
  CONSTRAINT survey_cognitive_results_trial_count_check CHECK(trial_count=120));
\ir ../../../prisma/migrations/20261023170000_survey_cognitive_exact_protocols/migration.sql
INSERT INTO survey_publications VALUES
 ('gng','{"units":[{"kind":"COGNITIVE","instrumentKey":"task","compiledDefinition":{"templateKey":"gonogo-software-frame-v1","measurementDigest":"gng-digest"}}]}'),
 ('simon','{"units":[{"kind":"COGNITIVE","instrumentKey":"task","compiledDefinition":{"templateKey":"simon-software-frame-v1","measurementDigest":"simon-digest"}}]}'),
 ('unknown','{"units":[{"kind":"COGNITIVE","instrumentKey":"task","compiledDefinition":{"templateKey":"unknown","measurementDigest":"unknown-digest"}}]}'),
 ('duplicate','{"units":[{"kind":"COGNITIVE","instrumentKey":"task","compiledDefinition":{"templateKey":"simon-software-frame-v1","measurementDigest":"same"}},{"kind":"COGNITIVE","instrumentKey":"task","compiledDefinition":{"templateKey":"simon-software-frame-v1","measurementDigest":"same"}}]}');
INSERT INTO survey_cognitive_results VALUES ('gng','task','gng-digest',120),('simon','task','simon-digest',100);
DO $$
DECLARE candidate RECORD; rejected BOOLEAN;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('gng','task','gng-digest',100),('simon','task','simon-digest',120),
  ('unknown','task','unknown-digest',100),('simon','wrong-slot','simon-digest',100),
  ('simon','task','wrong-digest',100),('missing','task','simon-digest',100),
  ('duplicate','task','same',100),('simon','task','simon-digest',101)
 ) AS cases(publication_id,slot_key,measurement_digest,trial_count) LOOP
  rejected:=false;
  BEGIN
   INSERT INTO survey_cognitive_results VALUES(candidate.publication_id,candidate.slot_key,candidate.measurement_digest,candidate.trial_count);
  EXCEPTION WHEN raise_exception OR check_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid protocol accepted: %',candidate; END IF;
 END LOOP;
 IF (SELECT count(*) FROM survey_cognitive_results)<>2 THEN RAISE EXCEPTION 'Valid protocols not preserved'; END IF;
END $$;
ROLLBACK;
