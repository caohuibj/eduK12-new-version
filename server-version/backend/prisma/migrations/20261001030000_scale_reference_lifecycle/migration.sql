ALTER TYPE "AssessmentReferenceStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
CREATE OR REPLACE FUNCTION protect_governed_reference_snapshot() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.definition->'entries') e WHERE e ? 'governance') THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'REFERENCE_SNAPSHOT_DELETE_FORBIDDEN'; END IF;
    IF NEW.instrument_type <> OLD.instrument_type OR NEW.instrument_key <> OLD.instrument_key OR NEW.reference_version <> OLD.reference_version THEN RAISE EXCEPTION 'REFERENCE_IDENTITY_IMMUTABLE'; END IF;
    IF OLD.status::text <> 'DRAFT' AND NEW.definition IS DISTINCT FROM OLD.definition THEN RAISE EXCEPTION 'REFERENCE_SNAPSHOT_IMMUTABLE'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status::text='DRAFT' AND NEW.status::text='ACTIVE') OR (OLD.status::text='ACTIVE' AND NEW.status::text IN ('SUPERSEDED','RETIRED')) OR (OLD.status::text='SUPERSEDED' AND NEW.status::text='RETIRED')) THEN RAISE EXCEPTION 'REFERENCE_LIFECYCLE_INVALID'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_governed_reference_snapshot BEFORE UPDATE OR DELETE ON assessment_reference_sets FOR EACH ROW EXECUTE FUNCTION protect_governed_reference_snapshot();
