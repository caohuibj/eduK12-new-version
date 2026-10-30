BEGIN;
-- Keep the original 120-trial rule for v1. Native profile results use only the
-- exact bound already fixed in their immutable publication and admitted slot.
-- No current grant check belongs here: admitted FINAL survives ordinary revoke.
CREATE FUNCTION guard_survey_cognitive_frozen_trial_budget() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE candidates jsonb; frozen jsonb; expected integer;
BEGIN
 SELECT jsonb_agg(unit->'compiledDefinition') INTO candidates
 FROM public.survey_publications p
 CROSS JOIN LATERAL jsonb_array_elements(p.compiled_snapshot->'units') AS unit
 WHERE p.id=NEW.publication_id AND p.project_id=NEW.project_id
  AND unit->>'kind'='COGNITIVE' AND unit->>'instrumentKey'=NEW.slot_key;
 IF candidates IS NULL OR jsonb_array_length(candidates)<>1 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='survey cognitive frozen slot required';
 END IF;
 frozen:=candidates->0;
 IF frozen->>'measurementDigest' IS DISTINCT FROM NEW.measurement_digest OR NOT EXISTS(
  SELECT 1 FROM public.survey_cognitive_sessions s WHERE s.id=NEW.session_id
   AND s.project_id=NEW.project_id AND s.wave_id=NEW.wave_id AND s.attempt_id=NEW.attempt_id
   AND s.publication_id=NEW.publication_id AND s.slot_key=NEW.slot_key AND s.epoch=NEW.epoch
   AND s.measurement_digest=NEW.measurement_digest) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='survey cognitive frozen measurement mismatch';
 END IF;
 IF frozen->>'schemaVersion'='1' AND frozen->>'templateKey'='gonogo-software-frame-v1' THEN
  expected:=120;
 ELSIF frozen->>'schemaVersion'='2' AND frozen->>'templateKey'='native-profile-v1'
  AND jsonb_typeof(frozen->'maxTrials')='number' AND frozen->>'maxTrials' ~ '^[0-9]{1,4}$'
  AND frozen->>'artifactHash' ~ '^[a-f0-9]{64}$' THEN
  expected:=(frozen->>'maxTrials')::integer;
 ELSE
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='survey cognitive protocol format unsupported';
 END IF;
 IF expected<1 OR expected>1000 OR NEW.trial_count<>expected THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='survey cognitive exact frozen trial count required';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_cognitive_result_frozen_trial_budget BEFORE INSERT ON survey_cognitive_results
 FOR EACH ROW EXECUTE FUNCTION guard_survey_cognitive_frozen_trial_budget();
ALTER TABLE survey_cognitive_results DROP CONSTRAINT survey_cognitive_results_trial_count_check;
ALTER TABLE survey_cognitive_results ADD CONSTRAINT survey_cognitive_results_trial_count_check CHECK(trial_count BETWEEN 1 AND 1000);
COMMIT;
