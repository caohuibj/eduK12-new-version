-- Add one explicit Simon protocol. No frozen publication or existing FINAL is rewritten.
-- The two allowed counts are only an outer budget; the insertion trigger binds
-- each count to the exact frozen parent unit and measurement digest.
ALTER TABLE survey_cognitive_results DROP CONSTRAINT survey_cognitive_results_trial_count_check;
ALTER TABLE survey_cognitive_results ADD CONSTRAINT survey_cognitive_results_trial_count_check
  CHECK (trial_count IN (100,120));
CREATE FUNCTION guard_survey_cognitive_result_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE unit_count INTEGER; frozen JSONB; protocol_key TEXT; expected_count INTEGER;
BEGIN
  SELECT count(*), (jsonb_agg(unit->'compiledDefinition'))->0
    INTO unit_count, frozen
    FROM survey_publications publication,
      LATERAL jsonb_array_elements(publication.compiled_snapshot->'units') unit
    WHERE publication.id=NEW.publication_id
      AND unit->>'kind'='COGNITIVE' AND unit->>'instrumentKey'=NEW.slot_key;
  IF unit_count<>1 OR frozen->>'measurementDigest' IS DISTINCT FROM NEW.measurement_digest THEN
    RAISE EXCEPTION 'Survey cognitive FINAL requires its exact frozen parent protocol';
  END IF;
  protocol_key := frozen->>'templateKey';
  expected_count := CASE protocol_key
    WHEN 'gonogo-software-frame-v1' THEN 120
    WHEN 'simon-software-frame-v1' THEN 100
    ELSE NULL END;
  IF expected_count IS NULL OR NEW.trial_count<>expected_count THEN
    RAISE EXCEPTION 'Survey cognitive FINAL trial count does not match its frozen protocol';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_cognitive_result_protocol BEFORE INSERT ON survey_cognitive_results
  FOR EACH ROW EXECUTE FUNCTION guard_survey_cognitive_result_protocol();
-- Existing immutable UPDATE/DELETE protection and all scope foreign keys remain.
-- Rollback: stop new Simon admission and retain this additive schema for historical
-- Simon results. Do not down-migrate to the old 120-only constraint after any Simon FINAL.
