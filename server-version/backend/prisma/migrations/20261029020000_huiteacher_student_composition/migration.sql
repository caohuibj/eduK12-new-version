-- Extend the existing immutable student-evaluation configuration with one
-- exact ordinary questionnaire alternative. Existing Form rows are unchanged.
BEGIN;
ALTER TABLE huiteacher_student_eval_configs
 ALTER COLUMN form_id DROP NOT NULL,
 ALTER COLUMN definition_digest DROP NOT NULL,
 ADD COLUMN composition_version_id text,
 ADD COLUMN composition_content_hash text,
 ADD CONSTRAINT huiteacher_student_eval_composition_fk FOREIGN KEY (composition_version_id)
  REFERENCES education_private_tool_versions(id) ON DELETE RESTRICT,
 ADD CONSTRAINT huiteacher_student_eval_source_check CHECK (
  (form_id IS NOT NULL AND definition_digest IS NOT NULL AND composition_version_id IS NULL AND composition_content_hash IS NULL)
  OR (form_id IS NULL AND definition_digest IS NULL AND composition_version_id IS NOT NULL
   AND composition_content_hash IS NOT NULL AND composition_content_hash ~ '^[a-f0-9]{64}$'));
ALTER TABLE huiteacher_student_disclosure_ledgers ADD COLUMN comparable_keys text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE OR REPLACE FUNCTION guard_huiteacher_student_eval_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  RAISE EXCEPTION 'Student evaluation target configuration is immutable' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM huiteacher_evaluation_events e
  JOIN huiteacher_evaluation_targets t ON t.organization_id=e.organization_id AND t.id=e.target_id
   AND t.kind='PERSON' AND t.status='ACTIVE' AND t.subject_user_id IS NOT NULL
  JOIN organization_staff_class_assignments staff ON staff.id=NEW.staff_assignment_id
   AND staff.organization_id=e.organization_id AND staff.class_unit_id=NEW.class_unit_id
   AND staff.staff_role IN ('HOMEROOM','TEACHING') AND staff.valid_from<=statement_timestamp()
   AND (staff.valid_until IS NULL OR staff.valid_until>statement_timestamp())
  JOIN organization_memberships teacher ON teacher.id=staff.membership_id AND teacher.organization_id=staff.organization_id
   AND teacher.user_id=t.subject_user_id AND teacher.valid_from<=statement_timestamp()
   AND (teacher.valid_until IS NULL OR teacher.valid_until>statement_timestamp())
  JOIN organization_persona_grants persona ON persona.organization_id=teacher.organization_id
   AND persona.membership_id=teacher.id AND persona.persona='TEACHER' AND persona.revoked_at IS NULL
  JOIN organization_units unit ON unit.organization_id=e.organization_id AND unit.id=NEW.class_unit_id AND unit.unit_kind='CLASS'
  JOIN education_product_entitlements product ON product.organization_id=e.organization_id AND product.product='HUITEACHER' AND product.status='ACTIVE'
  JOIN organizations org ON org.id=e.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
  WHERE e.organization_id=NEW.organization_id AND e.id=NEW.event_id AND e.kind='ASSESSMENT' AND e.status='DRAFT'
   AND ((NEW.composition_version_id IS NULL AND EXISTS(
    SELECT 1 FROM huiteacher_form_instruments form WHERE form.organization_id=e.organization_id
     AND form.id=NEW.form_id AND form.definition_digest=NEW.definition_digest AND form.status='PUBLISHED'))
    OR (NEW.form_id IS NULL AND EXISTS(
     SELECT 1 FROM education_private_tool_versions v JOIN composite_assessments c
      ON c.creation_key='education-composition:TEACHER:'||v.id||':TEACHER:STUDENT_REPORT:1.0.0'
      AND c.created_by=v.owner_user_id AND c.product_kind='ORGANIZATION_RESOURCE'
      AND c.status IN ('DRAFT','PUBLISHED') AND NOT c.public_enabled AND NOT c.copyable
      AND c.training_content_snapshot#>>'{educationBinding,origin,contentHash}'=v.content_hash
     WHERE v.id=NEW.composition_version_id AND v.content_hash=NEW.composition_content_hash AND v.kind='COMPOSITION'
      AND v.entry='TEACHER' AND v.organization_id=e.organization_id AND v.owner_user_id=NEW.configured_by_user_id
      AND v.definition#>>'{administration,population}'='TEACHER' AND v.definition#>>'{administration,responseMode}'='STUDENT_REPORT')))
 ) THEN
  RAISE EXCEPTION 'Student feedback requires an exact fixed source, verified class teacher and draft Teacher evaluation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- Retain every byte of the existing source/children/scientific-hash guard.
-- Change only its supported Teacher administration. Fail explicitly if the
-- expected predecessor is absent; never install a stale copied trigger body.
DO $$
DECLARE body text; predecessor text:='(v.entry=''TEACHER'' AND variant=''TEACHER:SELF'')';
BEGIN
 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 IF length(body)-length(replace(body,predecessor,''))<>length(predecessor) THEN
  RAISE EXCEPTION 'Unexpected education composition guard predecessor';
 END IF;
 EXECUTE replace(body,predecessor,'(v.entry=''TEACHER'' AND variant IN (''TEACHER:SELF'',''TEACHER:STUDENT_REPORT''))');
END $$;
COMMIT;
