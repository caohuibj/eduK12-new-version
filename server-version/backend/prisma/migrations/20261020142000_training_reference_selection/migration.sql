-- Publication keeps its existing content hash semantics. Demographics may only
-- become known after the context form, so selected references freeze separately,
-- once, in that same transaction, before the first measurement is delivered.
ALTER TABLE composite_assessments ADD COLUMN training_reference_selection_draft JSONB;
ALTER TABLE composite_assessment_attempts ADD COLUMN training_reference_binding JSONB,
 ADD COLUMN training_reference_binding_hash TEXT;
ALTER TABLE composite_assessment_attempts ADD CONSTRAINT training_reference_binding_pair CHECK (
 (training_reference_binding IS NULL)=(training_reference_binding_hash IS NULL)
 AND (training_reference_binding_hash IS NULL OR training_reference_binding_hash ~ '^[a-f0-9]{64}$'));
CREATE FUNCTION guard_training_reference_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected JSONB; content_unit JSONB; slot JSONB;
BEGIN
 IF TG_OP='UPDATE' AND OLD.training_reference_binding IS NOT NULL AND
    (OLD.training_reference_binding,OLD.training_reference_binding_hash)
    IS DISTINCT FROM (NEW.training_reference_binding,NEW.training_reference_binding_hash) THEN
   RAISE EXCEPTION 'Training reference selection is immutable';
 END IF;
 IF NEW.training_reference_binding IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.training_reference_binding IS NULL AND OLD.status::text<>'IN_PROGRESS' THEN
   RAISE EXCEPTION 'Training reference selection cannot backfill completed history';
 END IF;
 IF NEW.training_content_binding IS NULL OR
    ((NEW.training_reference_binding->>'schemaVersion'='1')
     AND (NEW.training_reference_binding->>'attemptId'=NEW.id)
     AND (NEW.training_reference_binding->>'epoch'=NEW.attempt_epoch::text)
     AND (NEW.training_reference_binding->>'contentBindingHash'=NEW.training_content_binding_hash)) IS NOT TRUE
    OR (NEW.training_reference_binding->>'contextHash') IS DISTINCT FROM NEW.context_snapshot_hash
    OR jsonb_typeof(NEW.training_reference_binding->'units') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.training_reference_binding->'units')<>jsonb_array_length(NEW.training_content_binding->'units') THEN
   RAISE EXCEPTION 'Training reference selection context identity mismatch';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.training_reference_binding->'units')) <>
    (SELECT count(DISTINCT u->>'itemId') FROM jsonb_array_elements(NEW.training_reference_binding->'units') u) THEN
   RAISE EXCEPTION 'Training reference selection duplicate items';
 END IF;
 FOR selected IN SELECT * FROM jsonb_array_elements(NEW.training_reference_binding->'units') LOOP
   SELECT u INTO content_unit FROM jsonb_array_elements(NEW.training_content_binding->'units') u WHERE u->>'itemId'=selected->>'itemId';
   IF content_unit IS NULL OR jsonb_typeof(selected->'references') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Training reference selection unknown unit';
   END IF;
   FOR slot IN SELECT * FROM jsonb_array_elements(selected->'references') LOOP
     IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(content_unit->'referencePolicy'->'choices','[]'::jsonb)) c
       WHERE c->>'metricKey'=slot->>'metricKey' AND c->>'referenceKind'=slot->>'referenceKind'
        AND (slot->>'status'='UNAVAILABLE' OR (slot->>'status'='SELECTED' AND c->>'releaseId'=slot->>'releaseId'
          AND c->>'contentHash'=slot->>'contentHash' AND c->>'entryKey'=slot->>'entryKey'))) THEN
       RAISE EXCEPTION 'Training reference selection is outside frozen publication';
     END IF;
   END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER training_reference_binding_guard BEFORE INSERT OR UPDATE ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION guard_training_reference_binding();
