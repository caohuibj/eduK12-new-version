ALTER TABLE material_grants
 ADD COLUMN standard_combination_hash text,
 ADD COLUMN authority_grant_id text REFERENCES content_capability_grants(id) ON DELETE RESTRICT;
ALTER TABLE material_grants ADD CONSTRAINT standard_combination_use_identity CHECK (
 (resource_type='STANDARD_COMBINATION' AND standard_combination_hash ~ '^[a-f0-9]{64}$' AND authority_grant_id IS NOT NULL)
 OR (resource_type<>'STANDARD_COMBINATION' AND standard_combination_hash IS NULL AND authority_grant_id IS NULL)
);
CREATE FUNCTION protect_standard_combination_material_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.resource_type='STANDARD_COMBINATION' OR NEW.resource_type='STANDARD_COMBINATION' THEN
  IF ROW(NEW.id,NEW.teacher_id,NEW.resource_type,NEW.resource_id,NEW.granted_by,NEW.created_at,NEW.standard_combination_hash,NEW.authority_grant_id)
   IS DISTINCT FROM ROW(OLD.id,OLD.teacher_id,OLD.resource_type,OLD.resource_id,OLD.granted_by,OLD.created_at,OLD.standard_combination_hash,OLD.authority_grant_id)
  THEN RAISE EXCEPTION 'Exact combination use identity is immutable; revoke and issue a new use'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER standard_combination_material_identity BEFORE UPDATE ON material_grants
 FOR EACH ROW EXECUTE FUNCTION protect_standard_combination_material_identity();
ALTER TABLE composite_assessment_items ADD COLUMN standard_combination_source jsonb;
ALTER TABLE composite_assessment_items ADD CONSTRAINT standard_combination_scale_item CHECK (
 standard_combination_source IS NULL OR (type='SCALE' AND scale_id IS NOT NULL)
);
