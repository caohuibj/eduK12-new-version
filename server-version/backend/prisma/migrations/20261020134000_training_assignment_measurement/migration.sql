ALTER TABLE cognitive_assignments ADD COLUMN measurement_release_id TEXT
 REFERENCES measurement_content_releases(id) ON DELETE RESTRICT;
CREATE FUNCTION guard_assignment_measurement_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.measurement_release_id IS NOT NULL AND
  (OLD.measurement_release_id,OLD.config_id,OLD.created_by,OLD.profile,OLD.profile_definition_version,
   OLD.resolved_config_snapshot_encrypted,OLD.resolved_config_hash)
  IS DISTINCT FROM (NEW.measurement_release_id,NEW.config_id,NEW.created_by,NEW.profile,NEW.profile_definition_version,
   NEW.resolved_config_snapshot_encrypted,NEW.resolved_config_hash) THEN
  RAISE EXCEPTION 'ASSIGNMENT_MEASUREMENT_IDENTITY_IMMUTABLE';
 END IF;
 IF NEW.measurement_release_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM measurement_content_releases r
  WHERE r.id=NEW.measurement_release_id AND r.layer='MEASUREMENT' AND r.family='COGNITIVE'
   AND r.scope->>'kind'='PRIVATE' AND r.scope->>'product'='TRAINING'
   AND r.scope->>'ownerId'=NEW.created_by AND r.scope->>'resourceId'=NEW.id) THEN
  RAISE EXCEPTION 'ASSIGNMENT_MEASUREMENT_SCOPE_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_measurement_release_guard BEFORE INSERT OR UPDATE ON cognitive_assignments
 FOR EACH ROW EXECUTE FUNCTION guard_assignment_measurement_release();
