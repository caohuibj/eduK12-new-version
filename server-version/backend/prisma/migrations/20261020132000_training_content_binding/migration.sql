-- Shared publication identities once; per-attempt pointers only. No historical
-- attempt backfill or deletion. Existing null/null bindings remain legacy facts.
ALTER TABLE composite_assessments ADD COLUMN training_content_snapshot JSONB,
 ADD COLUMN training_content_snapshot_hash TEXT;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_content_binding JSONB,
 ADD COLUMN training_content_binding_hash TEXT;
ALTER TABLE composite_assessments ADD CONSTRAINT training_content_snapshot_pair CHECK (
 (training_content_snapshot IS NULL)=(training_content_snapshot_hash IS NULL)
 AND (training_content_snapshot_hash IS NULL OR training_content_snapshot_hash ~ '^[a-f0-9]{64}$'));
ALTER TABLE composite_assessment_attempts ADD CONSTRAINT training_content_binding_pair CHECK (
 (training_content_binding IS NULL)=(training_content_binding_hash IS NULL)
 AND (training_content_binding_hash IS NULL OR training_content_binding_hash ~ '^[a-f0-9]{64}$'));
CREATE FUNCTION guard_training_content_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.training_content_snapshot IS NOT NULL AND
    (OLD.training_content_snapshot,OLD.training_content_snapshot_hash)
    IS DISTINCT FROM (NEW.training_content_snapshot,NEW.training_content_snapshot_hash) THEN
   RAISE EXCEPTION 'Training content publication is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_content_publication_guard BEFORE UPDATE ON composite_assessments
 FOR EACH ROW EXECUTE FUNCTION guard_training_content_publication();
CREATE FUNCTION guard_training_content_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE publication composite_assessments;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (OLD.training_content_binding,OLD.training_content_binding_hash)
     IS DISTINCT FROM (NEW.training_content_binding,NEW.training_content_binding_hash) THEN
     RAISE EXCEPTION 'Training content binding is immutable, including legacy null';
   END IF;
   IF OLD.training_content_binding IS NOT NULL AND
      (OLD.id,OLD.composite_assessment_id,OLD.attempt_epoch)
      IS DISTINCT FROM (NEW.id,NEW.composite_assessment_id,NEW.attempt_epoch) THEN
     RAISE EXCEPTION 'Training content binding requires a new attempt identity';
   END IF;
 END IF;
 IF NEW.training_content_binding IS NOT NULL THEN
   SELECT * INTO STRICT publication FROM composite_assessments
     WHERE id=NEW.composite_assessment_id FOR SHARE;
   IF ((NEW.training_content_binding->>'attemptId'=NEW.id)
      AND (NEW.training_content_binding->>'compositeId'=NEW.composite_assessment_id)
      AND (NEW.training_content_binding->>'epoch'=NEW.attempt_epoch::text)
      AND (NEW.training_content_binding->>'publicationHash'=publication.training_content_snapshot_hash)) IS NOT TRUE THEN
     RAISE EXCEPTION 'Training content binding publication mismatch';
   END IF;
   IF jsonb_typeof(NEW.training_content_binding->'units') IS DISTINCT FROM 'array'
      OR jsonb_typeof(publication.training_content_snapshot->'units') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Training content units must be explicit arrays';
   END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.training_content_binding->'units') unit
     WHERE (publication.training_content_snapshot->'units' @> jsonb_build_array(unit)) IS NOT TRUE) THEN
     RAISE EXCEPTION 'Training attempt unit is not in its frozen publication';
   END IF;
   IF (SELECT COUNT(*) FROM jsonb_array_elements(NEW.training_content_binding->'units')) <>
      (SELECT COUNT(DISTINCT unit->>'itemId') FROM jsonb_array_elements(NEW.training_content_binding->'units') unit) THEN
     RAISE EXCEPTION 'Training attempt contains duplicate or missing item identities';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_content_attempt_guard BEFORE INSERT OR UPDATE ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION guard_training_content_attempt();
