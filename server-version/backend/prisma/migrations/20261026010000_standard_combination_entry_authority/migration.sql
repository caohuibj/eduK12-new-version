-- A formal entry administrator and an exact content delegate are different
-- issuance bases. Retain old delegated uses unchanged; never invent 21B roots.
ALTER TABLE material_grants
 ADD COLUMN authority_entry_grant_id text REFERENCES admin_entry_grants(id) ON DELETE RESTRICT,
 ADD COLUMN authority_entry_grant_version integer;
ALTER TABLE material_grants DROP CONSTRAINT standard_combination_use_identity;
ALTER TABLE material_grants ADD CONSTRAINT standard_combination_use_identity CHECK (
 (resource_type='STANDARD_COMBINATION' AND standard_combination_hash ~ '^[a-f0-9]{64}$' AND (
   (authority_grant_id IS NOT NULL AND authority_entry_grant_id IS NULL AND authority_entry_grant_version IS NULL)
   OR (authority_grant_id IS NULL AND authority_entry_grant_id IS NOT NULL
       AND authority_entry_grant_version IS NOT NULL AND authority_entry_grant_version>0)
 )) OR (resource_type<>'STANDARD_COMBINATION' AND standard_combination_hash IS NULL
   AND authority_grant_id IS NULL AND authority_entry_grant_id IS NULL AND authority_entry_grant_version IS NULL)
);
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
   IF ROW(NEW.granted_by,NEW.authority_grant_id,NEW.authority_entry_grant_id,NEW.authority_entry_grant_version)
    IS DISTINCT FROM ROW(OLD.granted_by,OLD.authority_grant_id,OLD.authority_entry_grant_id,OLD.authority_entry_grant_version)
   THEN RAISE EXCEPTION 'Revocation cannot substitute distribution authority'; END IF;
  ELSIF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
   NULL; -- Explicit versioned reissue; old frozen references keep the old basis.
  ELSE RAISE EXCEPTION 'Exact use must transition between active and revoked';
  END IF;
 END IF;
 RETURN NEW;
END $$;
