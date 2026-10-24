-- Additive host admission facts, not scientific responses or mutable checkpoints.
-- Legacy children remain null; no backfill or host adoption is permitted.
ALTER TABLE situational_attempts
  ADD COLUMN survey_locked_answers_cipher TEXT,
  ADD COLUMN survey_locked_answers_hash TEXT,
  ADD CONSTRAINT situational_survey_answer_lock_pair CHECK (
    (survey_locked_answers_cipher IS NULL AND survey_locked_answers_hash IS NULL)
    OR (survey_locked_answers_cipher IS NOT NULL AND survey_locked_answers_hash IS NOT NULL
      AND survey_attempt_id IS NOT NULL AND length(survey_locked_answers_cipher)>0
      AND survey_locked_answers_hash ~ '^[a-f0-9]{64}$')
  );
CREATE FUNCTION protect_situational_survey_answer_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.survey_locked_answers_cipher IS DISTINCT FROM OLD.survey_locked_answers_cipher
    OR NEW.survey_locked_answers_hash IS DISTINCT FROM OLD.survey_locked_answers_hash THEN
    RAISE EXCEPTION 'SITUATIONAL_SURVEY_ANSWER_LOCK_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER situational_survey_answer_lock_immutable BEFORE UPDATE ON situational_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_situational_survey_answer_lock();
