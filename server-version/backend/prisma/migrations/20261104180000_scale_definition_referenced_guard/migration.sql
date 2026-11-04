-- A scale whose content is frozen into a published Training snapshot must not
-- be revised in place: the published publication pins its release/contentHash
-- and runtime fails closed (or would silently diverge) on a changed row.
-- Revisions must go to a new scale/version. Mirrors scale_library_wrapper_immutable.
CREATE FUNCTION protect_published_referenced_scale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.definition,NEW.definition_hash,NEW.instruction,NEW.instrument_class,NEW.instrument_version,NEW.code)
    IS DISTINCT FROM (OLD.definition,OLD.definition_hash,OLD.instruction,OLD.instrument_class,OLD.instrument_version,OLD.code)
  AND EXISTS (SELECT 1 FROM composite_assessment_items i JOIN composite_assessments c ON c.id=i.composite_assessment_id
              WHERE i.scale_id=OLD.id AND c.training_content_snapshot IS NOT NULL)
 THEN RAISE EXCEPTION 'SCALE_DEFINITION_REFERENCED' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scale_published_reference_immutable
 BEFORE UPDATE OF definition, definition_hash, instruction, instrument_class, instrument_version, code ON scales
 FOR EACH ROW EXECUTE FUNCTION protect_published_referenced_scale();
