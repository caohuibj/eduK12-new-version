-- Additive host binding only. No existing attempt, grant, publication or raw
-- answer changes. Native publication/admission is not enabled by this migration.
ALTER TABLE situational_attempts
  ADD COLUMN survey_attempt_id TEXT,
  ADD COLUMN survey_publication_id TEXT,
  ADD COLUMN survey_slot_key TEXT,
  ADD CONSTRAINT situational_attempts_survey_host_check CHECK (
    num_nonnulls(survey_attempt_id,survey_publication_id,survey_slot_key)=0 OR (
      num_nonnulls(survey_attempt_id,survey_publication_id,survey_slot_key)=3
      AND length(survey_attempt_id)>0 AND length(survey_publication_id)>0
      AND survey_slot_key ~ '^[a-z][a-z0-9_-]{0,79}$'
      AND user_id IS NULL AND composite_attempt_id IS NULL
      AND composite_item_id IS NULL AND composite_slot_key IS NULL
      AND attempt_epoch>0
    )
  ),
  ADD CONSTRAINT situational_attempts_survey_attempt_id_fkey
    FOREIGN KEY(survey_attempt_id) REFERENCES survey_wave_attempts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT situational_attempts_survey_publication_id_fkey
    FOREIGN KEY(survey_publication_id) REFERENCES survey_publications(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX situational_attempts_survey_slot_epoch_key
  ON situational_attempts(survey_attempt_id,survey_slot_key,attempt_epoch);

-- A Survey child is not a standalone participant attempt. Preserve all previous
-- standalone uniqueness semantics, in their original namespace.
DROP INDEX situational_attempts_standalone_identity_key;
CREATE UNIQUE INDEX situational_attempts_standalone_identity_key
  ON situational_attempts(instrument_key,instrument_version,participant_key,attempt_no)
  WHERE composite_attempt_id IS NULL AND survey_attempt_id IS NULL;
DROP INDEX situational_attempts_active_participant_key;
CREATE UNIQUE INDEX situational_attempts_active_participant_key
  ON situational_attempts(instrument_key,instrument_version,participant_key)
  WHERE status='IN_PROGRESS' AND composite_attempt_id IS NULL AND survey_attempt_id IS NULL;

CREATE FUNCTION protect_situational_survey_host() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_wave TEXT;
BEGIN
  IF TG_OP='UPDATE' THEN
    -- Host is assigned on INSERT only. Historical rows cannot be adopted into
    -- a different host, and a native child's epoch/slot cannot be repurposed.
    IF NEW.survey_attempt_id IS DISTINCT FROM OLD.survey_attempt_id
      OR NEW.survey_publication_id IS DISTINCT FROM OLD.survey_publication_id
      OR NEW.survey_slot_key IS DISTINCT FROM OLD.survey_slot_key
      OR (OLD.survey_attempt_id IS NOT NULL AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.attempt_epoch IS DISTINCT FROM OLD.attempt_epoch
        OR NEW.participant_key IS DISTINCT FROM OLD.participant_key)) THEN
      RAISE EXCEPTION 'SITUATIONAL_SURVEY_HOST_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.survey_attempt_id IS NULL THEN RETURN NEW; END IF;
  -- Existing content-binding guard freezes id/project/wave once bound; existing
  -- published-wave guard freezes publication. Do not upgrade a legacy null
  -- binding, and do not invent a client-derived parent epoch.
  SELECT wave_id INTO parent_wave FROM survey_wave_attempts
    WHERE id=NEW.survey_attempt_id AND content_binding_cipher IS NOT NULL AND content_binding_hash IS NOT NULL;
  IF parent_wave IS NULL THEN
    RAISE EXCEPTION 'SITUATIONAL_SURVEY_PARENT_NOT_FROZEN' USING ERRCODE='23514';
  END IF;
  -- Same wave -> attempt lock order as Survey admission. Caller already holds
  -- its authority locks; these constraints also protect direct database writes.
  PERFORM id FROM survey_waves WHERE id=parent_wave FOR SHARE;
  PERFORM a.id FROM survey_wave_attempts a JOIN survey_waves w ON w.id=a.wave_id
    WHERE a.id=NEW.survey_attempt_id AND a.wave_id=parent_wave
      AND a.project_id=w.project_id AND w.publication_id=NEW.survey_publication_id
      AND a.content_binding_cipher IS NOT NULL AND a.content_binding_hash IS NOT NULL
    FOR SHARE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SITUATIONAL_SURVEY_PUBLICATION_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER situational_survey_host_immutable BEFORE INSERT OR UPDATE ON situational_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_situational_survey_host();
