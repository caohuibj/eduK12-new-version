ALTER TABLE material_grants ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN revoked_at timestamp(3);
CREATE OR REPLACE FUNCTION protect_standard_combination_material_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.resource_type='STANDARD_COMBINATION' THEN RAISE EXCEPTION 'Exact combination use history must be retained'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.resource_type='STANDARD_COMBINATION' OR NEW.resource_type='STANDARD_COMBINATION' THEN
  IF ROW(NEW.id,NEW.teacher_id,NEW.resource_type,NEW.resource_id,NEW.created_at,NEW.standard_combination_hash)
   IS DISTINCT FROM ROW(OLD.id,OLD.teacher_id,OLD.resource_type,OLD.resource_id,OLD.created_at,OLD.standard_combination_hash)
  THEN RAISE EXCEPTION 'Exact combination resource identity is immutable'; END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Exact use transition requires the next version'; END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
   IF ROW(NEW.granted_by,NEW.authority_grant_id) IS DISTINCT FROM ROW(OLD.granted_by,OLD.authority_grant_id)
   THEN RAISE EXCEPTION 'Revocation cannot substitute distribution authority'; END IF;
  ELSIF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
   NULL; -- Explicit reviewed reissue; old frozen references retain old version.
  ELSE RAISE EXCEPTION 'Exact use must transition between active and revoked';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER standard_combination_material_delete BEFORE DELETE ON material_grants
 FOR EACH ROW EXECUTE FUNCTION protect_standard_combination_material_identity();
