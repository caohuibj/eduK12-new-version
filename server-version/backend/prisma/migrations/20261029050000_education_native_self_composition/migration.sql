-- Add native SELF leaves to the existing ordinary root seal. This does not
-- reinterpret V1 observer identities or change any original scientific source.
BEGIN;
CREATE FUNCTION education_native_composition_unit(parent_id text,entry_kind text,owner_id text,variant text,block jsonb,item_position integer,snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE item composite_assessment_items%ROWTYPE; config cognitive_test_configs%ROWTYPE; assignment cognitive_assignments%ROWTYPE;
 original measurement_content_releases%ROWTYPE; measured measurement_content_releases%ROWTYPE; author sjt_author_releases%ROWTYPE;
 mapping static_sjt_measurement_mappings%ROWTYPE; unit jsonb; source jsonb; descriptor jsonb; expected_source jsonb; expected_config jsonb;
BEGIN
 IF variant NOT IN ('STUDENT:SELF','TEACHER:SELF') THEN RAISE EXCEPTION 'EDUCATION_NATIVE_SELF_REQUIRED'; END IF;
 SELECT * INTO item FROM composite_assessment_items WHERE composite_assessment_id=parent_id AND position=item_position;
 IF NOT FOUND OR (item.required AND item.scale_id IS NULL AND item.form_section_id IS NULL AND item.form_section_position IS NULL
  AND item.form_type IS NULL AND item.form_label IS NULL AND item.form_options IS NULL AND item.form_definition IS NULL
  AND item.form_policy IS NULL AND item.form_placeholder IS NULL AND item.context_key IS NULL AND item.standard_combination_source IS NULL) IS NOT TRUE
  THEN RAISE EXCEPTION 'EDUCATION_NATIVE_ITEM_INVALID'; END IF;
 SELECT value INTO unit FROM jsonb_array_elements(snapshot->'units') WHERE value->>'itemId'=item.id;
 IF unit IS NULL THEN RAISE EXCEPTION 'EDUCATION_NATIVE_UNIT_REQUIRED'; END IF;
 source:=unit->'source';descriptor:=source->'educationNative';
 IF (descriptor->>'provider'=block#>>'{source,provider}' AND descriptor->>'sourceId'=block#>>'{source,versionId}'
  AND descriptor->>'contentHash'=block#>>'{source,contentHash}') IS NOT TRUE THEN RAISE EXCEPTION 'EDUCATION_NATIVE_SOURCE_INVALID'; END IF;
 IF block#>>'{source,provider}'='COGNITIVE_CONFIG' AND block#>>'{source,kind}'='COGNITIVE' THEN
  SELECT * INTO assignment FROM cognitive_assignments WHERE id=item.cognitive_assignment_id FOR SHARE;
  SELECT * INTO config FROM cognitive_test_configs WHERE id=assignment.config_id FOR SHARE;
  SELECT * INTO original FROM measurement_content_releases WHERE id=config.measurement_release_id FOR SHARE;
  SELECT * INTO measured FROM measurement_content_releases WHERE id=assignment.measurement_release_id FOR SHARE;
  IF (item.type='COGNITIVE' AND item.situational_instrument_key IS NULL AND item.situational_instrument_version IS NULL
   AND config.id=block#>>'{source,versionId}' AND config.status='PUBLISHED' AND original.layer='MEASUREMENT' AND original.family='COGNITIVE'
   AND original.status='PUBLISHED' AND original.scope->>'kind'='PLATFORM' AND original.content_hash=block#>>'{source,contentHash}' AND descriptor->>'sourceMeasurementReleaseId'=original.id
   AND assignment.created_by=owner_id AND assignment.course_id IS NULL AND NOT assignment.listed_standalone
   AND assignment.quota_source_assignment_id IS NULL AND assignment.status='PUBLISHED' AND assignment.published_at IS NOT NULL
   AND assignment.opens_at IS NULL AND assignment.due_at IS NULL AND assignment.max_attempts=1
   AND assignment.profile=block#>>'{source,profile}' AND assignment.profile IN ('experience','standard','research')
   AND descriptor->>'profile'=assignment.profile AND descriptor->>'profileDefinitionVersion'=assignment.profile_definition_version
   AND descriptor->>'resolvedConfigHash'=assignment.resolved_config_hash AND descriptor->>'reportHash' ~ '^[0-9a-f]{64}$'
   AND assignment.resolved_config_snapshot_encrypted IS NOT NULL AND assignment.resolved_report_snapshot_encrypted IS NOT NULL
   AND assignment.profile_definition_version<>'' AND assignment.resolved_config_hash ~ '^[0-9a-f]{64}$'
   AND (descriptor-ARRAY['provider','sourceId','contentHash','sourceMeasurementReleaseId','profile','profileDefinitionVersion','resolvedConfigHash','reportHash'])='{}'::jsonb
   AND measured.layer='MEASUREMENT' AND measured.family='COGNITIVE' AND measured.status='PUBLISHED'
   AND measured.scope=jsonb_build_object('kind','PRIVATE','product',entry_kind,'ownerId',owner_id,'resourceId',assignment.id)
   AND measured.provenance=jsonb_build_object('educationNative',descriptor,'configId',config.id,'assignmentId',assignment.id)
   AND measured.content->>'runnerKey'=config.test_type AND measured.content->>'runnerVersion'=config.engine_version
   AND measured.content->>'scoringVersion'=config.scoring_version AND measured.content->>'instrumentVersion'=config.config_version) IS NOT TRUE
   THEN RAISE EXCEPTION 'EDUCATION_COGNITIVE_BINDING_INVALID'; END IF;
  expected_config:=(original.content#>'{executable,config}')||(original.content#>ARRAY['executable','profiles',assignment.profile]);
  IF expected_config IS NULL OR measured.content#>'{executable,config}' IS DISTINCT FROM expected_config
   THEN RAISE EXCEPTION 'EDUCATION_COGNITIVE_PROFILE_CONFIG_INVALID'; END IF;
  expected_source:=jsonb_build_object('kind','COGNITIVE_CONFIG','id',config.id,'ownerId',owner_id,'assignmentId',assignment.id,'educationNative',descriptor);
 ELSIF block#>>'{source,provider}'='SJT_RELEASE' AND block#>>'{source,kind}'='SJT' THEN
  IF item.type<>'SITUATIONAL' OR item.cognitive_assignment_id IS NOT NULL OR (descriptor-ARRAY['provider','sourceId','contentHash'])<>'{}'::jsonb
   THEN RAISE EXCEPTION 'EDUCATION_SJT_ITEM_INVALID'; END IF;
  IF source->>'kind'='SJT_AUTHOR_RELEASE' THEN
   SELECT * INTO author FROM sjt_author_releases WHERE id=descriptor->>'sourceId' FOR SHARE;
   SELECT * INTO measured FROM measurement_content_releases WHERE id=author.measurement_release_id FOR SHARE;
   IF (author.status='PUBLISHED' AND author.instrument_key=item.situational_instrument_key AND author.instrument_version=item.situational_instrument_version
    AND author.package#>>'{definition,respondentType}' IN ('participant_self_report',CASE entry_kind WHEN 'SCHOOL' THEN 'student_self_report' ELSE 'teacher_self_report' END)
    AND measured.scope=jsonb_build_object('kind','PLATFORM','ownerId',author.author_id) AND measured.provenance->>'authorReleaseId'=author.id) IS NOT TRUE
    THEN RAISE EXCEPTION 'EDUCATION_SJT_AUTHOR_SOURCE_INVALID'; END IF;
   expected_source:=jsonb_build_object('kind','SJT_AUTHOR_RELEASE','id',author.id,'ownerId',author.author_id,'instrumentKey',author.instrument_key,'instrumentVersion',author.instrument_version,'educationNative',descriptor);
  ELSIF source->>'kind'='STATIC_SJT_REGISTRY' THEN
   SELECT * INTO mapping FROM static_sjt_measurement_mappings WHERE id=descriptor->>'sourceId' FOR SHARE;
   SELECT * INTO measured FROM measurement_content_releases WHERE id=mapping.measurement_release_id FOR SHARE;
   IF (mapping.instrument_key=item.situational_instrument_key AND mapping.instrument_version=item.situational_instrument_version
    AND mapping.deployment IS NOT NULL AND mapping.deployment_hash IS NOT NULL AND measured.scope='{"kind":"PLATFORM"}'::jsonb
    AND measured.provenance->>'mappingId'=mapping.id AND measured.provenance->>'contentDigest'=mapping.content_digest) IS NOT TRUE
    THEN RAISE EXCEPTION 'EDUCATION_SJT_STATIC_SOURCE_INVALID'; END IF;
   expected_source:=jsonb_build_object('kind','STATIC_SJT_REGISTRY','id',mapping.id,'instrumentKey',mapping.instrument_key,'instrumentVersion',mapping.instrument_version,'educationNative',descriptor);
  ELSE RAISE EXCEPTION 'EDUCATION_SJT_SOURCE_REQUIRED'; END IF;
  IF (measured.layer='MEASUREMENT' AND measured.family='SJT' AND measured.status='PUBLISHED' AND measured.content_hash=descriptor->>'contentHash') IS NOT TRUE
   THEN RAISE EXCEPTION 'EDUCATION_SJT_MEASUREMENT_INVALID'; END IF;
 ELSE RAISE EXCEPTION 'EDUCATION_NATIVE_PROVIDER_INVALID'; END IF;
 IF unit IS DISTINCT FROM jsonb_build_object('itemId',item.id,'family',CASE item.type WHEN 'COGNITIVE' THEN 'COGNITIVE' ELSE 'SJT' END,
  'source',expected_source,'measurement',jsonb_build_object('releaseId',measured.id,'contentHash',measured.content_hash,'measurementHash',measured.content->>'measurementHash'))
  THEN RAISE EXCEPTION 'EDUCATION_NATIVE_UNIT_INVALID'; END IF;
 RETURN unit;
END $$;

DO $migration$
DECLARE body text;old_text text;new_text text;
BEGIN
 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 old_text:=$old$  mapping:=binding->'manifest'->block_position;$old$;
 new_text:=$new$  mapping:=binding->'manifest'->block_position;
  IF block#>>'{source,provider}' IN ('COGNITIVE_CONFIG','SJT_RELEASE') THEN
   unit:=education_native_composition_unit(NEW.id,v.entry,v.owner_user_id,variant,block,item_position,NEW.training_content_snapshot);
   IF mapping IS DISTINCT FROM jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction',
    'kind',block#>>'{source,kind}','sourceProvider',block#>>'{source,provider}','versionId',block#>>'{source,versionId}',
    'contentHash',block#>>'{source,contentHash}','toolId',block#>>'{source,versionId}',
    'itemIds',jsonb_build_array(unit->>'itemId'),'sectionIds','[]'::jsonb) THEN RAISE EXCEPTION 'EDUCATION_NATIVE_MAPPING_INVALID'; END IF;
   expected_units:=expected_units||jsonb_build_array(unit);item_position:=item_position+1;block_position:=block_position+1;
   CONTINUE;
  END IF;$new$;
 IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected native composition seal predecessor'; END IF;
 EXECUTE replace(body,old_text,new_text);
END $migration$;

CREATE FUNCTION protect_education_composition_cognitive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM composite_assessment_items item JOIN composite_assessments c ON c.id=item.composite_assessment_id
  WHERE item.cognitive_assignment_id=OLD.id AND c.creation_key LIKE 'education-composition:%')
  AND (TG_OP='DELETE' OR (to_jsonb(OLD)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','updated_at']))
  THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_COGNITIVE_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER education_composition_cognitive_guard BEFORE UPDATE OR DELETE ON cognitive_assignments
 FOR EACH ROW EXECUTE FUNCTION protect_education_composition_cognitive();
COMMIT;
