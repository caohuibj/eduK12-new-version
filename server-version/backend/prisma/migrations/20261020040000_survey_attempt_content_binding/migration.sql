ALTER TABLE survey_wave_attempts
  ADD COLUMN content_binding_cipher TEXT,
  ADD COLUMN content_binding_hash TEXT,
  ADD CONSTRAINT survey_attempt_content_binding_pair CHECK (
    (content_binding_cipher IS NULL AND content_binding_hash IS NULL) OR
    (content_binding_cipher IS NOT NULL AND length(content_binding_cipher)>0 AND content_binding_hash IS NOT NULL AND content_binding_hash ~ '^[a-f0-9]{64}$')
  );
CREATE FUNCTION protect_survey_attempt_content_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content_binding_cipher IS NOT NULL AND
    (NEW.content_binding_cipher IS DISTINCT FROM OLD.content_binding_cipher OR
     NEW.content_binding_hash IS DISTINCT FROM OLD.content_binding_hash OR
     NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.wave_id IS DISTINCT FROM OLD.wave_id) THEN
    RAISE EXCEPTION 'SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER survey_attempt_content_binding_immutable BEFORE UPDATE ON survey_wave_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_survey_attempt_content_binding();
