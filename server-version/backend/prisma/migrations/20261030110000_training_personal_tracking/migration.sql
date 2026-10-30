ALTER TABLE composite_assessments
 ADD COLUMN personal_tracking_baseline_id text,
 ADD COLUMN personal_tracking_ordinal integer,
 ADD COLUMN personal_tracking jsonb,
 ADD CONSTRAINT personal_tracking_complete CHECK (
  (personal_tracking_baseline_id IS NULL AND personal_tracking_ordinal IS NULL AND personal_tracking IS NULL) OR
  (personal_tracking_baseline_id IS NOT NULL AND personal_tracking_ordinal IS NOT NULL AND personal_tracking_ordinal BETWEEN 1 AND 100 AND personal_tracking IS NOT NULL AND jsonb_typeof(personal_tracking)='object'));
CREATE UNIQUE INDEX composite_personal_tracking_wave ON composite_assessments(personal_tracking_baseline_id,personal_tracking_ordinal);
ALTER TABLE composite_assessment_attempts ADD COLUMN personal_changes_snapshots jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(personal_changes_snapshots)='object');
CREATE FUNCTION preserve_composite_personal_tracking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'DRAFT' AND (NEW.personal_tracking_baseline_id IS DISTINCT FROM OLD.personal_tracking_baseline_id
  OR NEW.personal_tracking_ordinal IS DISTINCT FROM OLD.personal_tracking_ordinal OR NEW.personal_tracking IS DISTINCT FROM OLD.personal_tracking) THEN
  RAISE EXCEPTION 'Published personal tracking is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER composite_personal_tracking_immutable BEFORE UPDATE ON composite_assessments
 FOR EACH ROW EXECUTE FUNCTION preserve_composite_personal_tracking();
CREATE FUNCTION preserve_personal_changes_snapshots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW.personal_changes_snapshots @> OLD.personal_changes_snapshots THEN
  RAISE EXCEPTION 'Personal changes snapshots are append-only';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER personal_changes_snapshots_append BEFORE UPDATE ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION preserve_personal_changes_snapshots();
