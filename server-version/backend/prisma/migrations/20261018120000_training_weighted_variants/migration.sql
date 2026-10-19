-- Additive opt-in only. Historical publications and accepted attempts remain NULL.
ALTER TABLE "composite_assessments"
 ADD COLUMN "training_variant_draft" JSONB,
 ADD COLUMN "training_variant_frozen" JSONB,
 ADD COLUMN "training_variant_digest" TEXT;
ALTER TABLE "composite_assessment_attempts"
 ADD COLUMN "training_variant_allocation_encrypted" TEXT,
 ADD COLUMN "training_variant_allocation_hash" TEXT;
ALTER TABLE "composite_assessments" ADD CONSTRAINT "training_variant_frozen_pair"
 CHECK ((training_variant_frozen IS NULL) = (training_variant_digest IS NULL));
ALTER TABLE "composite_assessment_attempts" ADD CONSTRAINT "training_variant_allocation_pair"
 CHECK ((training_variant_allocation_encrypted IS NULL) = (training_variant_allocation_hash IS NULL));
-- Allocation is written at admission, never repaired or redrawn during recovery.
CREATE FUNCTION protect_training_variant_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.training_variant_allocation_encrypted IS DISTINCT FROM NEW.training_variant_allocation_encrypted
 OR OLD.training_variant_allocation_hash IS DISTINCT FROM NEW.training_variant_allocation_hash THEN
   RAISE EXCEPTION 'Training variant allocation is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER training_variant_allocation_immutable BEFORE UPDATE ON composite_assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION protect_training_variant_allocation();
