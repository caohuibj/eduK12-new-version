ALTER TABLE assessment_runs ADD COLUMN personal_tracking_baseline_id text,
 ADD COLUMN personal_tracking_ordinal integer, ADD COLUMN personal_tracking jsonb,
 ADD CONSTRAINT education_tracking_complete CHECK (
  (personal_tracking_baseline_id IS NULL AND personal_tracking_ordinal IS NULL AND personal_tracking IS NULL) OR
  (personal_tracking_baseline_id IS NOT NULL AND personal_tracking_ordinal IS NOT NULL AND personal_tracking_ordinal BETWEEN 1 AND 100
   AND personal_tracking IS NOT NULL AND jsonb_typeof(personal_tracking)='object'));
CREATE UNIQUE INDEX education_personal_tracking_wave ON assessment_runs(organization_id,personal_tracking_baseline_id,personal_tracking_ordinal);
ALTER TABLE assessment_run_executions ADD COLUMN personal_changes_snapshots jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(personal_changes_snapshots)='object');
CREATE FUNCTION preserve_education_personal_tracking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status<>'DRAFT' AND (NEW.personal_tracking_baseline_id IS DISTINCT FROM OLD.personal_tracking_baseline_id
  OR NEW.personal_tracking_ordinal IS DISTINCT FROM OLD.personal_tracking_ordinal OR NEW.personal_tracking IS DISTINCT FROM OLD.personal_tracking) THEN
  RAISE EXCEPTION 'Published education tracking is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER education_personal_tracking_immutable BEFORE UPDATE ON assessment_runs
 FOR EACH ROW EXECUTE FUNCTION preserve_education_personal_tracking();
CREATE TRIGGER education_personal_snapshots_append BEFORE UPDATE ON assessment_run_executions
 FOR EACH ROW EXECUTE FUNCTION preserve_personal_changes_snapshots();
