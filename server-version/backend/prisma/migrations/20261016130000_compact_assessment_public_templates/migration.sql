-- Immutable public/scientific content only, never personal answers or results.
CREATE TABLE "assessment_public_templates" (
 "template_hash" TEXT PRIMARY KEY CHECK ("template_hash" ~ '^[0-9a-f]{64}$'),
 "template_kind" TEXT NOT NULL CHECK ("template_kind" IN ('SCALE_RESULT_BASE','SCALE_REFERENCE','SCALE_INTERPRETATION','SCALE_CAVEATS','SCALE_CANONICAL_LAYOUT','COMPOSITE_REPORT_LAYOUT')),
 "plaintext_bytes" INTEGER NOT NULL CHECK ("plaintext_bytes" BETWEEN 1 AND 2097152),
 "payload_encrypted" TEXT NOT NULL CHECK (octet_length("payload_encrypted") BETWEEN 1 AND 4194304),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "assessment_public_templates_immutable" BEFORE UPDATE OR DELETE ON "assessment_public_templates"
 FOR EACH ROW EXECUTE FUNCTION "reject_assessment_runtime_artifact_mutation"();

-- One immutable personal result per unit/epoch; current rows and reports only reference it.
CREATE TABLE "assessment_result_facts" (
 "assessment_id" TEXT NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "attempt_epoch" INTEGER NOT NULL CHECK ("attempt_epoch">0),
 "submission_id" TEXT NOT NULL UNIQUE,
 "payload_hash" TEXT NOT NULL CHECK ("payload_hash" ~ '^[a-f0-9]{64}$'),
 "source_result_hash" TEXT NOT NULL CHECK ("source_result_hash" ~ '^[a-f0-9]{64}$'),
 "canonical_result_hash" TEXT CHECK ("canonical_result_hash" IS NULL OR "canonical_result_hash" ~ '^[a-f0-9]{64}$'),
 "facts_encrypted" TEXT NOT NULL CHECK (octet_length("facts_encrypted") BETWEEN 1 AND 12582912),
 "raw_answers_encrypted" TEXT,
 "raw_receipt_attempt_id" TEXT,
 "completed_at" TIMESTAMP(3) NOT NULL,
 "total_time" INTEGER NOT NULL CHECK ("total_time">=0),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("assessment_id","attempt_epoch"),
 CHECK (("raw_answers_encrypted" IS NOT NULL AND "raw_receipt_attempt_id" IS NULL) OR
        ("raw_answers_encrypted" IS NULL AND "raw_receipt_attempt_id" IS NOT NULL)),
 CONSTRAINT "assessment_result_facts_raw_receipt_fk" FOREIGN KEY ("raw_receipt_attempt_id","attempt_epoch")
  REFERENCES "composite_report_jobs"("attempt_id","attempt_epoch") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION "reject_assessment_result_fact_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'assessment result facts are immutable; use a new epoch' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER "assessment_result_facts_immutable" BEFORE UPDATE ON "assessment_result_facts"
 FOR EACH ROW EXECUTE FUNCTION "reject_assessment_result_fact_update"();

-- The retained receipt is the sole original for whole submissions. Task-state
-- updates remain allowed; source bytes cannot be cleared while facts refer to them.
CREATE FUNCTION "protect_assessment_whole_raw_facts"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.whole_answers_encrypted IS DISTINCT FROM NEW.whole_answers_encrypted
     OR OLD.whole_payload_hash IS DISTINCT FROM NEW.whole_payload_hash
     OR OLD.whole_submission_id IS DISTINCT FROM NEW.whole_submission_id
     OR OLD.whole_accepted_at IS DISTINCT FROM NEW.whole_accepted_at)
    AND EXISTS (SELECT 1 FROM assessment_result_facts WHERE raw_receipt_attempt_id=OLD.attempt_id AND attempt_epoch=OLD.attempt_epoch)
 THEN RAISE EXCEPTION 'retained whole raw facts are immutable while referenced' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "assessment_whole_raw_facts_immutable" BEFORE UPDATE OF "whole_answers_encrypted","whole_payload_hash","whole_submission_id","whole_accepted_at"
 ON "composite_report_jobs" FOR EACH ROW EXECUTE FUNCTION "protect_assessment_whole_raw_facts"();
