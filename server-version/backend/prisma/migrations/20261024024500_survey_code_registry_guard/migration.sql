-- Assigned short numbers stay attached to the original participant.
CREATE FUNCTION survey_guard_participant_code_registry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p survey_projects;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO p FROM survey_projects WHERE id=NEW.project_id;
  IF p.first_published_at IS NOT NULL AND p.participant_identity_mode<>'SELF_CODE' THEN
   RAISE EXCEPTION 'Published assigned code registry is fixed';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  SELECT * INTO p FROM survey_projects WHERE id=OLD.project_id;
  IF OLD.participant_id IS NOT NULL OR p.first_published_at IS NOT NULL THEN
   RAISE EXCEPTION 'Participant code registry cannot be removed';
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.prefix IS DISTINCT FROM OLD.prefix OR
 (OLD.participant_id IS NOT NULL AND NEW.participant_id IS DISTINCT FROM OLD.participant_id) THEN
  RAISE EXCEPTION 'Participant short number cannot be reassigned';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_guard_participant_code_registry BEFORE INSERT OR UPDATE OR DELETE ON survey_participant_codes
 FOR EACH ROW EXECUTE FUNCTION survey_guard_participant_code_registry();
