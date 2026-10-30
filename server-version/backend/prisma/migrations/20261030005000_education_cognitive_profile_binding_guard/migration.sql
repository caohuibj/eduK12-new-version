BEGIN;
-- Add the exact profile format to the existing three strict seals. Each exact
-- predecessor must occur once; an unknown prior implementation stops migration.
-- Legacy native inputs retain their exact old descriptor and manifest shape.
DO $migration$
DECLARE body text;old_text text;new_text text;
BEGIN
 body:=pg_get_functiondef('guard_assignment_measurement_release()'::regprocedure);
 old_text:=$old$'resolvedConfigHash',NEW.resolved_config_hash,'reportHash',r.provenance#>>'{educationNative,reportHash}')))$old$;
 new_text:=$new$'resolvedConfigHash',NEW.resolved_config_hash,'reportHash',r.provenance#>>'{educationNative,reportHash}') ||
       CASE WHEN NEW.course_snapshot?'selectedEducationCognitiveProfile' THEN jsonb_build_object(
        'artifactHash',NEW.course_snapshot#>>'{selectedEducationCognitiveProfile,artifactHash}',
        'selectedBinding',NEW.course_snapshot#>'{selectedEducationCognitiveProfile,selectedBinding}') ELSE '{}'::jsonb END))$new$;
 IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected exact profile assignment guard predecessor'; END IF;
 EXECUTE replace(body,old_text,new_text);

 body:=pg_get_functiondef('education_native_composition_unit(text,text,text,text,jsonb,integer,jsonb)'::regprocedure);
 old_text:=$old$AND (descriptor-ARRAY['provider','sourceId','contentHash','sourceMeasurementReleaseId','profile','profileDefinitionVersion','resolvedConfigHash','reportHash'])='{}'::jsonb$old$;
 new_text:=$new$AND (
    (NOT(block->'source'?'artifactHash') AND NOT(block->'source'?'selectedBinding')
     AND NOT(COALESCE(assignment.course_snapshot,'{}'::jsonb)?'selectedEducationCognitiveProfile')
     AND (descriptor-ARRAY['provider','sourceId','contentHash','sourceMeasurementReleaseId','profile','profileDefinitionVersion','resolvedConfigHash','reportHash'])='{}'::jsonb)
    OR (
     block#>>'{source,artifactHash}' ~ '^[0-9a-f]{64}$'
     AND (descriptor-ARRAY['provider','sourceId','contentHash','sourceMeasurementReleaseId','profile','profileDefinitionVersion','resolvedConfigHash','reportHash','artifactHash','selectedBinding'])='{}'::jsonb
     AND descriptor->>'artifactHash'=block#>>'{source,artifactHash}' AND descriptor->'selectedBinding'=block#>'{source,selectedBinding}'
     AND assignment.course_snapshot=jsonb_build_object('selectedEducationCognitiveProfile',jsonb_build_object(
      'schemaVersion',1,'product',entry_kind,'organizationId',snapshot#>>'{educationBinding,origin,organizationId}',
      'configId',config.id,'artifactHash',descriptor->>'artifactHash','selectedBinding',descriptor->'selectedBinding'))
     AND measured.source_release_id=original.id
     AND EXISTS(SELECT 1 FROM assessment_public_templates artifact WHERE artifact.template_hash=descriptor->>'artifactHash' AND artifact.template_kind='COGNITIVE_PROFILE_CONFIGURATION')
     AND EXISTS(SELECT 1 FROM assessment_management_events granted WHERE granted.id=descriptor#>>'{selectedBinding,authorizationId}'
      AND granted.action='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED' AND granted.resource_id=config.id
      AND granted.metadata->>'artifactHash'=descriptor->>'artifactHash'
      AND granted.metadata#>>'{selectedBinding,bindingHash}'=descriptor#>>'{selectedBinding,bindingHash}'
      AND granted.metadata#>>'{selectedBinding,binding,configurationHash}'=descriptor#>>'{selectedBinding,configurationHash}'
      AND granted.metadata#>>'{selectedBinding,binding,configuration,kind}'='COGNITIVE_PROFILE'
      AND granted.metadata#>>'{selectedBinding,binding,configuration,profile}'=assignment.profile
      AND granted.metadata#>>'{selectedBinding,binding,configuration,reportHash}'=descriptor->>'reportHash'
      AND granted.metadata#>>'{selectedBinding,binding,configuration,resolvedConfigHash}'=assignment.resolved_config_hash
      AND granted.metadata#>>'{selectedBinding,binding,product}'=entry_kind
      AND granted.metadata#>>'{selectedBinding,binding,authorization,recipientId}'=owner_id
      AND granted.metadata#>>'{selectedBinding,binding,authorization,organizationId}'=snapshot#>>'{educationBinding,origin,organizationId}'
      AND granted.metadata#>>'{selectedBinding,binding,authorization,revision}'=descriptor#>>'{selectedBinding,authorizationRevision}')
    ))$new$;
 IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected exact profile native seal predecessor'; END IF;
 EXECUTE replace(body,old_text,new_text);

 body:=pg_get_functiondef('protect_education_composition()'::regprocedure);
 old_text:=$old$IF mapping IS DISTINCT FROM jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction',
    'kind',block#>>'{source,kind}','sourceProvider',block#>>'{source,provider}','versionId',block#>>'{source,versionId}',
    'contentHash',block#>>'{source,contentHash}','toolId',block#>>'{source,versionId}',
    'itemIds',jsonb_build_array(unit->>'itemId'),'sectionIds','[]'::jsonb) THEN RAISE EXCEPTION 'EDUCATION_NATIVE_MAPPING_INVALID'; END IF;$old$;
 new_text:=$new$IF (mapping-'profileArtifactHash') IS DISTINCT FROM jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction',
    'kind',block#>>'{source,kind}','sourceProvider',block#>>'{source,provider}','versionId',block#>>'{source,versionId}',
    'contentHash',block#>>'{source,contentHash}','toolId',block#>>'{source,versionId}',
    'itemIds',jsonb_build_array(unit->>'itemId'),'sectionIds','[]'::jsonb) OR ((mapping->'profileArtifactHash') IS DISTINCT FROM (block#>'{source,artifactHash}'))
    OR (block#>>'{source,provider}'<>'COGNITIVE_CONFIG' AND mapping?'profileArtifactHash')
    THEN RAISE EXCEPTION 'EDUCATION_NATIVE_MAPPING_INVALID'; END IF;$new$;
 IF length(body)-length(replace(body,old_text,''))<>length(old_text) THEN RAISE EXCEPTION 'Unexpected exact profile manifest seal predecessor'; END IF;
 EXECUTE replace(body,old_text,new_text);
END $migration$;
COMMIT;
