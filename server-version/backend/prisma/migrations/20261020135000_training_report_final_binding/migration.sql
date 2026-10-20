ALTER TABLE composite_assessments ADD COLUMN training_report_selection_draft JSONB;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_content_interpretation_encrypted TEXT,
 ADD COLUMN training_content_interpretation_hash TEXT;
ALTER TABLE composite_assessment_attempts ADD CONSTRAINT training_content_interpretation_pair CHECK (
 (training_content_interpretation_encrypted IS NULL)=(training_content_interpretation_hash IS NULL)
 AND (training_content_interpretation_hash IS NULL OR training_content_interpretation_hash ~ '^[a-f0-9]{64}$'));
CREATE FUNCTION guard_training_content_interpretation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.training_content_interpretation_encrypted IS NOT NULL AND
  (OLD.training_content_interpretation_encrypted,OLD.training_content_interpretation_hash,OLD.aggregate_input_hash,OLD.attempt_epoch,OLD.id)
  IS DISTINCT FROM (NEW.training_content_interpretation_encrypted,NEW.training_content_interpretation_hash,NEW.aggregate_input_hash,NEW.attempt_epoch,NEW.id) THEN
  RAISE EXCEPTION 'TRAINING_INITIAL_INTERPRETATION_IMMUTABLE';
 END IF;
 IF NEW.training_content_interpretation_encrypted IS NOT NULL AND
   (NEW.status::text<>'COMPLETED' OR NEW.training_content_binding IS NULL OR NEW.aggregate_input_hash IS NULL) THEN
  RAISE EXCEPTION 'TRAINING_INTERPRETATION_REQUIRES_BOUND_FINAL';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_content_interpretation_guard BEFORE INSERT OR UPDATE ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION guard_training_content_interpretation();
