-- Explicit expert source V2 and the existing field-event/evidence records.
-- No relational Run, new relationship role, source copy or binding table.
BEGIN;
ALTER TABLE huiteacher_field_event_forms ALTER COLUMN form_id DROP NOT NULL,
 ALTER COLUMN definition_digest DROP NOT NULL, ADD COLUMN assessment_ref jsonb;
ALTER TABLE huiteacher_field_form_evidence ALTER COLUMN form_id DROP NOT NULL,
 ALTER COLUMN definition_digest DROP NOT NULL, ADD COLUMN attempt_id text REFERENCES composite_assessment_attempts(id) ON DELETE RESTRICT,
 ADD COLUMN attempt_epoch integer, ADD COLUMN final_hash text,
 ADD CONSTRAINT field_evidence_canonical_source CHECK (
  (attempt_id IS NULL AND attempt_epoch IS NULL AND final_hash IS NULL AND form_id IS NOT NULL AND definition_digest IS NOT NULL)
  OR (attempt_id IS NOT NULL AND attempt_epoch IS NOT NULL AND attempt_epoch>0 AND final_hash IS NOT NULL AND final_hash ~ '^[a-f0-9]{64}$' AND answers_hash ~ '^[a-f0-9]{64}$' AND form_id IS NULL AND definition_digest IS NULL));

-- Every replacement is tied to one exact predecessor. Preserve the original
-- scientific hash/child/source checks rather than copying a stale trigger.
DO $migration$
DECLARE body text; old_text text; new_text text;
BEGIN
 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 FOR old_text,new_text IN SELECT * FROM (VALUES
  ($old$variant IN ('TEACHER:SELF','TEACHER:STUDENT_REPORT')$old$,
   $new$variant IN ('TEACHER:SELF','TEACHER:STUDENT_REPORT','TEACHER:EXPERT_REPORT')$new$),
  ($old$'contentHash',v.content_hash,'variantKey',variant);$old$,
   $new$'contentHash',v.content_hash,'variantKey',variant);
 IF variant='TEACHER:EXPERT_REPORT' THEN
  expected_origin:=expected_origin||jsonb_build_object('schemaVersion',2,'adapterVersion','2.0.0','targetKind',v.definition#>>'{administration,targetKind}');
 END IF;$new$),
  ($old$expected_key:='education-composition:'||v.entry||':'||v.id||':'||variant||':1.0.0';$old$,
   $new$expected_key:='education-composition:'||v.entry||':'||v.id||':'||variant||':'||(expected_origin->>'adapterVersion');$new$),
  ($old$AND v.definition->>'schemaVersion'='1' AND v.definition->>'adapterVersion'='1.0.0'$old$,
   $new$AND ((variant<>'TEACHER:EXPERT_REPORT' AND v.definition->>'schemaVersion'='1' AND v.definition->>'adapterVersion'='1.0.0')
    OR (variant='TEACHER:EXPERT_REPORT' AND v.definition->>'schemaVersion'='2' AND v.definition->>'adapterVersion'='2.0.0'
     AND v.definition#>>'{administration,targetKind}' IN ('PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT')
     AND NOT (v.definition ? 'contextFields') AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v.definition->'blocks') expert_block
      LEFT JOIN education_private_tool_versions expert_leaf ON expert_leaf.id=expert_block#>>'{source,versionId}'
      WHERE expert_block#>>'{source,provider}' IS DISTINCT FROM 'PRIVATE_VERSION'
       OR (expert_block#>>'{source,kind}'='SCALE' AND (v.definition#>>'{administration,targetKind}'<>'PERSON'
        OR expert_leaf.definition->>'respondentType' IS DISTINCT FROM 'expert_report')))))$new$)
 ) replacements(old_text,new_text) LOOP
  IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected expert composition seal predecessor'; END IF;
  body:=replace(body,old_text,new_text);
 END LOOP;
 EXECUTE body;
END $migration$;

CREATE FUNCTION huiteacher_field_participant_key(org_id text,event_id text,target_id text,grant_id text,accepted_at timestamptz,ref jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT 'field-v2:'||education_composition_binding_hash(jsonb_build_object('organizationId',org_id,'eventId',event_id,'targetId',target_id,
  'invitationId',grant_id,'acceptedAt',to_char(accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'compositeId',ref->>'compositeId','versionId',ref#>>'{origin,versionId}','contentHash',ref#>>'{origin,contentHash}'))
$$;

CREATE OR REPLACE FUNCTION guard_teacher_field_form_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (OLD.assessment_ref IS NOT NULL OR NEW.assessment_ref IS NULL
  OR (to_jsonb(OLD)-ARRAY['assessment_ref','assigned_by_user_id']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['assessment_ref','assigned_by_user_id'])))
  THEN RAISE EXCEPTION 'Field questionnaire binding is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.assessment_ref IS NULL OR NOT EXISTS(
  SELECT 1 FROM huiteacher_evaluation_events event JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id AND target.status='ACTIVE'
  JOIN organizations org ON org.id=event.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
  JOIN education_product_entitlements entitlement ON entitlement.organization_id=org.id AND entitlement.product='HUITEACHER' AND entitlement.status='ACTIVE'
  JOIN composite_assessments c ON c.id=NEW.assessment_ref->>'compositeId' AND c.creation_key=NEW.assessment_ref->>'resourceKey'
   AND c.training_content_snapshot_hash=NEW.assessment_ref->>'manifestHash' AND c.product_kind='ORGANIZATION_RESOURCE' AND c.status='PUBLISHED' AND NOT c.public_enabled AND NOT c.copyable
  JOIN education_private_tool_versions v ON v.id=NEW.assessment_ref#>>'{origin,versionId}' AND v.kind='COMPOSITION' AND v.entry='TEACHER'
   AND v.organization_id=org.id AND v.owner_user_id=NEW.assigned_by_user_id AND v.content_hash=NEW.assessment_ref#>>'{origin,contentHash}'
   AND v.definition->>'schemaVersion'='2' AND v.definition->>'adapterVersion'='2.0.0' AND v.definition#>>'{administration,responseMode}'='EXPERT_REPORT'
  WHERE event.organization_id=NEW.organization_id AND event.id=NEW.event_id AND event.status='DRAFT' AND event.kind IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
   AND NEW.assessment_ref->>'schemaVersion'='1' AND NEW.assessment_ref->>'kind'='COMPOSITION' AND NEW.assessment_ref->>'resourceVersion'='2.0.0'
   AND (NEW.assessment_ref-ARRAY['schemaVersion','kind','compositeId','resourceKey','resourceVersion','manifestHash','origin'])='{}'::jsonb
   AND NEW.assessment_ref->'origin'=c.training_content_snapshot#>'{educationBinding,origin}'
   AND target.kind=NEW.assessment_ref#>>'{origin,targetKind}'
   AND (target.kind<>'PERSON' AND target.subject_user_id IS NULL OR target.kind='PERSON' AND EXISTS(
    SELECT 1 FROM organization_memberships m JOIN organization_persona_grants p ON p.organization_id=m.organization_id AND p.membership_id=m.id AND p.persona='TEACHER' AND p.revoked_at IS NULL
    JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL' AND u.role IN ('TEACHER','ADMIN') AND u.teacher_approved AND u.is_active AND NOT u.is_frozen
    WHERE m.organization_id=org.id AND m.user_id=target.subject_user_id AND m.valid_from<=clock_timestamp() AND (m.valid_until IS NULL OR m.valid_until>clock_timestamp())))
 ) THEN RAISE EXCEPTION 'Field questionnaire requires an exact expert V2 source and verified draft target' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION protect_huiteacher_field_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.participant_key LIKE 'field-v2:%' THEN
  IF ROW(OLD.participant_key,OLD.composite_assessment_id,OLD.user_id,OLD.subject_user_id,OLD.respondent_user_id,OLD.respondent_type,OLD.assignment_ref,OLD.episode_id,OLD.consent_id,OLD.attempt_no,OLD.attempt_epoch)
    IS DISTINCT FROM ROW(NEW.participant_key,NEW.composite_assessment_id,NEW.user_id,NEW.subject_user_id,NEW.respondent_user_id,NEW.respondent_type,NEW.assignment_ref,NEW.episode_id,NEW.consent_id,NEW.attempt_no,NEW.attempt_epoch)
   THEN RAISE EXCEPTION 'Field parent identity is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.participant_key NOT LIKE 'field-v2:%' OR NEW.participant_key IS NULL THEN
  IF (TG_OP='INSERT' OR NEW.composite_assessment_id IS DISTINCT FROM OLD.composite_assessment_id) AND EXISTS(
   SELECT 1 FROM composite_assessments c WHERE c.id=NEW.composite_assessment_id AND c.creation_key LIKE 'education-composition:TEACHER:%:TEACHER:EXPERT_REPORT:2.0.0')
   THEN RAISE EXCEPTION 'Expert source requires its exact field participant identity' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' OR NEW.assignment_ref IS NOT NULL OR NEW.episode_id IS NOT NULL OR NEW.consent_id IS NOT NULL
  OR NEW.respondent_type IS DISTINCT FROM 'OBSERVER' OR NEW.delivery_mode IS DISTINCT FROM 'FINAL_ONLY' OR NEW.runtime_generation IS DISTINCT FROM 'UNIFIED_V1'
  OR NEW.attempt_no<>1 OR NEW.attempt_epoch<>1 OR NOT EXISTS(
   SELECT 1 FROM huiteacher_field_event_forms binding JOIN huiteacher_evaluation_events event ON event.organization_id=binding.organization_id AND event.id=binding.event_id AND event.status='OPEN'
   JOIN huiteacher_evaluation_targets target ON target.organization_id=event.organization_id AND target.id=event.target_id AND target.status='ACTIVE'
   JOIN huiteacher_observer_grants g ON g.organization_id=event.organization_id AND g.event_id=event.id AND g.observer_user_id=NEW.user_id
    AND g.role='EXPERT' AND g.status='ACCEPTED' AND g.accepted_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
   JOIN users u ON u.id=g.observer_user_id AND u.account_domain='SCHOOL' AND u.role IN ('TEACHER','ADMIN') AND u.teacher_approved AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
    AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
   JOIN organizations org ON org.id=binding.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
   JOIN education_product_entitlements p ON p.organization_id=org.id AND p.product='HUITEACHER' AND p.status='ACTIVE'
   WHERE binding.assessment_ref->>'compositeId'=NEW.composite_assessment_id AND NEW.respondent_user_id=NEW.user_id
    AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=org.id AND d.user_id=u.id AND d.lifted_at IS NULL AND d.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START'))
    AND NEW.subject_user_id IS NOT DISTINCT FROM target.subject_user_id AND NEW.subject_user_id IS DISTINCT FROM NEW.respondent_user_id
    AND target.kind=binding.assessment_ref#>>'{origin,targetKind}'
    AND NEW.participant_key=huiteacher_field_participant_key(binding.organization_id,event.id,target.id,g.id,g.accepted_at,binding.assessment_ref)
  ) THEN RAISE EXCEPTION 'Field parent requires its actual accepted invitation, fixed source and target' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER huiteacher_field_parent_guard BEFORE INSERT OR UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_field_parent();

CREATE FUNCTION huiteacher_field_final_digest(parent_id text,epoch integer) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT education_composition_binding_hash(jsonb_build_object('kind','FIELD_FINAL_RECEIPT_DIGEST_V1','attemptId',p.id,'attemptEpoch',p.attempt_epoch,
  'slotsHash',p.frozen_active_slot_set_hash,'receipts',(SELECT jsonb_agg(jsonb_build_object('slotKey',s.slot_key,'unitType',s.unit_type,'sourceType',s.source_type,
   'sourceAttemptId',s.source_attempt_id,'sourceSubmissionId',s.source_submission_id,'sourceDefinitionHash',s.source_definition_hash,'compiledRuntimeHash',s.compiled_runtime_hash,
   'payloadHash',encode(sha256(convert_to(CASE WHEN s.unit_type='SCALE' THEN s.canonical_result_encrypted ELSE s.collection_facts_encrypted END,'UTF8')),'hex')) ORDER BY s.slot_key)
   FROM assessment_unit_snapshots s WHERE s.composite_attempt_id=p.id AND s.attempt_epoch=p.attempt_epoch AND s.terminal_state='COMPLETED')))
 FROM composite_assessment_attempts p WHERE p.id=parent_id AND p.attempt_epoch=epoch AND p.status='COMPLETED'
$$;

CREATE OR REPLACE FUNCTION protect_huiteacher_field_form_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN RAISE EXCEPTION 'Field evidence cannot be changed' USING ERRCODE='23514'; END IF;
 IF NEW.attempt_id IS NULL OR NEW.attempt_epoch IS NULL OR NEW.final_hash IS NULL OR NOT EXISTS(
  SELECT 1 FROM huiteacher_observation_records note JOIN huiteacher_field_event_forms binding ON binding.organization_id=note.organization_id AND binding.event_id=note.event_id
  JOIN huiteacher_evaluation_events event ON event.organization_id=note.organization_id AND event.id=note.event_id AND event.status='OPEN'
  JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id AND target.status='ACTIVE'
  JOIN huiteacher_observer_grants g ON g.organization_id=event.organization_id AND g.event_id=event.id AND g.observer_user_id=note.observer_user_id
   AND g.role='EXPERT' AND g.status='ACCEPTED' AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
  JOIN users u ON u.id=g.observer_user_id AND u.account_domain='SCHOOL' AND u.role IN ('TEACHER','ADMIN') AND u.teacher_approved AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
   AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
  JOIN organizations org ON org.id=event.organization_id AND org.product_domain='SCHOOL' AND org.status='ACTIVE'
  JOIN education_product_entitlements product ON product.organization_id=org.id AND product.product='HUITEACHER' AND product.status='ACTIVE'
  JOIN composite_assessment_attempts p ON p.id=NEW.attempt_id AND p.composite_assessment_id=binding.assessment_ref->>'compositeId'
   AND p.user_id=note.observer_user_id AND p.respondent_user_id=note.observer_user_id AND p.subject_user_id IS NOT DISTINCT FROM target.subject_user_id
   AND p.assignment_ref IS NULL AND p.status='COMPLETED' AND p.attempt_epoch=NEW.attempt_epoch AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
   AND p.participant_key=huiteacher_field_participant_key(binding.organization_id,event.id,target.id,g.id,g.accepted_at,binding.assessment_ref)
  WHERE note.id=NEW.record_id AND note.organization_id=NEW.organization_id AND note.event_id=NEW.event_id AND note.kind='FORMAL_FEEDBACK' AND note.status='DRAFT'
   AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=org.id AND d.user_id=u.id AND d.lifted_at IS NULL AND d.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START'))
   AND NEW.form_id IS NULL AND NEW.definition_digest IS NULL AND NEW.final_hash=huiteacher_field_final_digest(p.id,p.attempt_epoch)
 ) THEN RAISE EXCEPTION 'Formal evidence requires exact canonical field completion' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
