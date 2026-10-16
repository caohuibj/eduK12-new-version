-- Bound foreign-key/retention lookups as personal facts grow. Existing rows
-- and storage representations remain unchanged.
CREATE INDEX "assessment_result_facts_raw_receipt_epoch_idx"
 ON "assessment_result_facts"("raw_receipt_attempt_id","attempt_epoch");

CREATE OR REPLACE FUNCTION "protect_assessment_whole_raw_facts"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- First receipt: there is no prior accepted original to protect. Avoid a
 -- result-table lookup on the latency-sensitive initial answer confirmation.
 IF OLD.whole_answers_encrypted IS NULL THEN RETURN NEW; END IF;
 IF (OLD.whole_answers_encrypted IS DISTINCT FROM NEW.whole_answers_encrypted
     OR OLD.whole_payload_hash IS DISTINCT FROM NEW.whole_payload_hash
     OR OLD.whole_submission_id IS DISTINCT FROM NEW.whole_submission_id
     OR OLD.whole_accepted_at IS DISTINCT FROM NEW.whole_accepted_at)
    AND EXISTS (SELECT 1 FROM assessment_result_facts WHERE raw_receipt_attempt_id=OLD.attempt_id AND attempt_epoch=OLD.attempt_epoch)
 THEN RAISE EXCEPTION 'retained whole raw facts are immutable while referenced' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
