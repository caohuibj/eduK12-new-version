-- New admissions only. Never rewrite a frozen unit or infer historical identity.
ALTER TABLE anonymous_study_attempts
 ADD COLUMN admission_credential_hash TEXT,
 ADD COLUMN admission_attempt_epoch INTEGER,
 ADD CONSTRAINT anonymous_study_admission_pair CHECK (
  (admission_credential_hash IS NULL AND admission_attempt_epoch IS NULL) OR
  (admission_credential_hash IS NOT NULL AND admission_attempt_epoch IS NOT NULL AND admission_credential_hash ~ '^[0-9a-f]{64}$' AND admission_attempt_epoch>0));
CREATE FUNCTION training_stable_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.wave_id IS DISTINCT FROM OLD.wave_id
   OR NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
   OR NEW.admission_credential_hash IS DISTINCT FROM OLD.admission_credential_hash
   OR NEW.admission_attempt_epoch IS DISTINCT FROM OLD.admission_attempt_epoch
  THEN RAISE EXCEPTION 'Study attempt identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.admission_credential_hash IS NOT NULL THEN RAISE EXCEPTION 'Bound study attempt is retained'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.admission_credential_hash IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM composite_assessment_attempts a JOIN anonymous_study_waves w ON w.id=NEW.wave_id AND w.study_id=NEW.study_id
  JOIN anonymous_study_participants p ON p.id=NEW.participant_id AND p.study_id=NEW.study_id
  WHERE a.id=NEW.attempt_id AND a.user_id IS NULL AND a.access_token_id=w.access_token_id
   AND a.recovery_token_hash=NEW.admission_credential_hash AND a.attempt_epoch=NEW.admission_attempt_epoch AND p.status='ACTIVE'
 ) THEN RAISE EXCEPTION 'Study admission must bind its original anonymous parent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_stable_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON anonymous_study_attempts FOR EACH ROW EXECUTE FUNCTION training_stable_admission_guard();
