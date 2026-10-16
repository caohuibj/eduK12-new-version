-- Public plans contain definitions only. Personal frozen facts are isolated below.
ALTER TABLE assessment_public_templates DROP CONSTRAINT assessment_public_templates_template_kind_check;
ALTER TABLE assessment_public_templates ADD CONSTRAINT assessment_public_templates_template_kind_check CHECK (template_kind IN
 ('SCALE_RESULT_BASE','SCALE_REFERENCE','SCALE_INTERPRETATION','SCALE_CAVEATS','SCALE_CANONICAL_LAYOUT','COMPOSITE_REPORT_LAYOUT','UNIT_ADMISSION_PLAN','FROZEN_SLOT_PLAN','WHOLE_VALIDATION_PLAN'));
CREATE TABLE assessment_frozen_bindings (
 id BIGSERIAL PRIMARY KEY,
 binding_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(binding_hash)=32),
 composite_attempt_id TEXT REFERENCES composite_assessment_attempts(id) ON DELETE CASCADE ON UPDATE CASCADE,
 questionnaire_assessment_id TEXT REFERENCES questionnaire_assessments(id) ON DELETE CASCADE ON UPDATE CASCADE,
 plaintext_bytes INTEGER NOT NULL CHECK (plaintext_bytes BETWEEN 1 AND 262144),
 payload_encrypted TEXT NOT NULL CHECK (octet_length(payload_encrypted) BETWEEN 1 AND 524288),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (num_nonnulls(composite_attempt_id,questionnaire_assessment_id)=1)
);
CREATE INDEX assessment_frozen_bindings_composite_idx ON assessment_frozen_bindings(composite_attempt_id);
CREATE INDEX assessment_frozen_bindings_questionnaire_idx ON assessment_frozen_bindings(questionnaire_assessment_id);
CREATE FUNCTION protect_assessment_frozen_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'frozen bindings are immutable; create a new version' USING ERRCODE='55000'; END IF;
 IF (OLD.composite_attempt_id IS NOT NULL AND EXISTS(SELECT 1 FROM composite_assessment_attempts WHERE id=OLD.composite_attempt_id))
 OR (OLD.questionnaire_assessment_id IS NOT NULL AND EXISTS(SELECT 1 FROM questionnaire_assessments WHERE id=OLD.questionnaire_assessment_id))
 THEN RAISE EXCEPTION 'frozen binding is still owned by a retained attempt' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER assessment_frozen_bindings_immutable BEFORE UPDATE OR DELETE ON assessment_frozen_bindings
 FOR EACH ROW EXECUTE FUNCTION protect_assessment_frozen_binding();
