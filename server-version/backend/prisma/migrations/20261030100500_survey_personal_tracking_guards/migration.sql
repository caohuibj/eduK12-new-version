CREATE FUNCTION survey_personal_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.longitudinal_plan IS NOT NULL AND NEW.longitudinal_plan IS DISTINCT FROM OLD.longitudinal_plan THEN
    RAISE EXCEPTION 'Published personal tracking plan is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_personal_plan_immutable BEFORE UPDATE OF longitudinal_plan ON survey_projects
FOR EACH ROW EXECUTE FUNCTION survey_personal_plan_guard();

CREATE FUNCTION survey_personal_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.publication_id IS NOT NULL AND NEW.longitudinal_source_wave_id IS DISTINCT FROM OLD.longitudinal_source_wave_id THEN
    RAISE EXCEPTION 'Published personal tracking source is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER survey_personal_source_immutable BEFORE UPDATE OF longitudinal_source_wave_id ON survey_waves
FOR EACH ROW EXECUTE FUNCTION survey_personal_source_guard();
