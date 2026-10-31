-- Extend the same once-only seal to exact approved Standard C/P/R sources.
-- No private Form copies, new lifecycle table, data rewrite or approval step.
BEGIN;
CREATE OR REPLACE FUNCTION protect_education_composition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v education_private_tool_versions%ROWTYPE; source education_private_tool_versions%ROWTYPE;
 standard_source survey_standard_releases%ROWTYPE; derived measurement_content_releases%ROWTYPE;
 actual_unit jsonb; expected_policy jsonb; expected_choices jsonb; source_set jsonb; reference_entry jsonb; normalized_entry jsonb;
 expected_reference_entries jsonb; report_audience text; expected_report jsonb;
 public_form survey_governed_tools%ROWTYPE; source_definition jsonb; source_kind text; expected_mapping jsonb;
 binding jsonb; origin jsonb; block jsonb; mapping jsonb; expected_origin jsonb; expected_units jsonb:='[]'; unit jsonb;
 context_field jsonb; context_item_ids jsonb;
 page jsonb; question jsonb; expected_options jsonb; expected_item_ids jsonb; expected_section_ids jsonb;
 item composite_assessment_items%ROWTYPE; section composite_form_sections%ROWTYPE;
 scale_source scales%ROWTYPE; release measurement_content_releases%ROWTYPE;
 block_position integer:=0; item_position integer:=0; section_position integer:=0; page_item_position integer;
 variant text; expected_key text; source_item_id text;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.creation_key LIKE 'education-composition:%' THEN
  IF TG_OP='UPDATE' AND OLD.status='DRAFT' AND NEW.status='PUBLISHED' AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
   AND (to_jsonb(OLD)-ARRAY['revision','updated_at','status','published_at']) IS NOT DISTINCT FROM
       (to_jsonb(NEW)-ARRAY['revision','updated_at','status','published_at']) THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-ARRAY['revision','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['revision','updated_at'])
   THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (NEW.creation_key LIKE 'education-composition:%' OR NEW.code LIKE 'education-composition:%'
  OR NEW.training_content_snapshot ? 'educationBinding') IS NOT TRUE THEN RETURN NEW; END IF;
 binding:=NEW.training_content_snapshot->'educationBinding';origin:=binding->'origin';
 SELECT * INTO v FROM education_private_tool_versions WHERE id=origin->>'versionId' AND kind='COMPOSITION';
 IF NOT FOUND THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_SOURCE_INVALID'; END IF;
 variant:=CASE v.entry WHEN 'SCHOOL' THEN 'STUDENT:SELF' WHEN 'TEACHER' THEN 'TEACHER:SELF' END;
 expected_origin:=jsonb_build_object('schemaVersion',1,'adapterVersion','1.0.0','mode','COMPOSITION','entry',v.entry,
  'organizationId',v.organization_id,'ownerUserId',v.owner_user_id,'toolId',v.tool_id,'versionId',v.id,
  'contentHash',v.content_hash,'variantKey',variant);
 expected_key:='education-composition:'||v.entry||':'||v.id||':'||variant||':1.0.0';
 IF (origin=expected_origin AND binding->'schemaVersion'='1'::jsonb AND binding->'sealed'='true'::jsonb
  AND (binding-ARRAY['schemaVersion','origin','sealed','manifest','context'])='{}'::jsonb
  AND NEW.creation_key=expected_key AND NEW.code=expected_key AND NEW.creation_hash=education_composition_binding_hash(expected_origin)
  AND NEW.name=v.title AND NEW.instruction=v.definition->>'instruction' AND NEW.created_by=v.owner_user_id
  AND NEW.product_kind='ORGANIZATION_RESOURCE' AND NEW.status='DRAFT' AND NEW.published_at IS NULL AND NOT NEW.public_enabled AND NOT NEW.copyable
  AND NEW.course_id IS NULL AND NEW.copied_from_id IS NULL AND NEW.opens_at IS NULL AND NEW.expires_at IS NULL AND NEW.max_attempts=1
  AND NEW.report_package_key IS NULL AND NEW.report_package_version IS NULL AND NEW.report_package_profile IS NULL AND NEW.report_package_snapshot_encrypted IS NULL
  AND NEW.analysis_protocol_key IS NULL AND NEW.analysis_protocol_version IS NULL AND NEW.analysis_protocol_snapshot_encrypted IS NULL
  AND NEW.training_flow_draft IS NULL AND NEW.training_flow_frozen IS NULL AND NEW.training_flow_digest IS NULL
  AND NEW.training_variant_draft IS NULL AND NEW.training_variant_frozen IS NULL AND NEW.training_variant_digest IS NULL
  AND v.definition->>'schemaVersion'='1' AND v.definition->>'adapterVersion'='1.0.0'
  AND v.definition#>>'{administration,population}'=split_part(variant,':',1) AND v.definition#>>'{administration,responseMode}'='SELF'
  AND jsonb_typeof(v.definition->'blocks')='array' AND jsonb_array_length(v.definition->'blocks') BETWEEN 1 AND 50
  AND jsonb_typeof(binding->'manifest')='array' AND jsonb_array_length(binding->'manifest')=jsonb_array_length(v.definition->'blocks')
  AND NEW.training_content_snapshot_hash=education_composition_binding_hash(NEW.training_content_snapshot)
  AND NEW.training_content_snapshot->'schemaVersion'='1'::jsonb AND NEW.training_content_snapshot->>'compositeId'=NEW.id
  AND (NEW.training_content_snapshot-ARRAY['schemaVersion','compositeId','units','educationBinding'])='{}'::jsonb) IS NOT TRUE
  THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_BINDING_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM composite_assessment_attempts WHERE composite_assessment_id=NEW.id)
  THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_ALREADY_STARTED'; END IF;
 IF (SELECT count(DISTINCT b->>'blockId') FROM jsonb_array_elements(v.definition->'blocks') b)<>jsonb_array_length(v.definition->'blocks')
  THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_BLOCK_ID_INVALID'; END IF;
 IF v.definition ? 'contextFields' THEN
  IF jsonb_typeof(v.definition->'contextFields')<>'array' OR jsonb_array_length(v.definition->'contextFields') NOT BETWEEN 1 AND 5
   THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CONTEXT_INVALID'; END IF;
  SELECT * INTO section FROM composite_form_sections WHERE composite_assessment_id=NEW.id AND position=0;
  IF NOT FOUND OR section.id IS DISTINCT FROM binding#>>'{context,sectionId}' OR NOT section.context_section
   OR section.title<>'背景信息' OR section.description IS NOT NULL THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CONTEXT_INVALID'; END IF;
  context_item_ids:='[]';
  FOR context_field IN SELECT value FROM jsonb_array_elements(v.definition->'contextFields') LOOP
   SELECT * INTO item FROM composite_assessment_items WHERE composite_assessment_id=NEW.id AND position=item_position;
   IF NOT FOUND OR (item.type='FORM' AND item.required AND item.form_section_id=section.id AND item.form_section_position=item_position
    AND item.context_key=context_field->>'contextKey' AND item.context_key IN ('birthYearMonth','sexAtBirth','gradeLevel','primaryLanguage','countryOrRegion')
    AND item.form_type=context_field->>'formType' AND item.form_label=context_field->>'formLabel' AND item.form_options=context_field->'formOptions'
    AND item.form_definition IS NULL AND item.form_policy IS NULL AND item.form_placeholder IS NULL AND item.scale_id IS NULL
    AND item.cognitive_assignment_id IS NULL AND item.situational_instrument_key IS NULL AND item.situational_instrument_version IS NULL
    AND item.standard_combination_source IS NULL) IS NOT TRUE THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CONTEXT_INVALID'; END IF;
   context_item_ids:=context_item_ids||jsonb_build_array(item.id);item_position:=item_position+1;
  END LOOP;
  IF binding->'context' IS DISTINCT FROM jsonb_build_object('sectionId',section.id,'itemIds',context_item_ids)
   THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CONTEXT_INVALID'; END IF;
  section_position:=1;
 ELSIF binding ? 'context' THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CONTEXT_INVALID'; END IF;
 FOR block IN SELECT value FROM jsonb_array_elements(v.definition->'blocks') LOOP
  mapping:=binding->'manifest'->block_position;
  IF block#>>'{source,provider}'='PRIVATE_VERSION' THEN
   SELECT * INTO source FROM education_private_tool_versions WHERE id=block#>>'{source,versionId}'
    AND entry=v.entry AND organization_id=v.organization_id AND owner_user_id=v.owner_user_id
    AND kind=block#>>'{source,kind}' AND kind IN ('SCALE','FORM') AND content_hash=block#>>'{source,contentHash}';
   IF NOT FOUND THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_LEAF_SCOPE_INVALID'; END IF;
   source_definition:=source.definition;source_kind:=source.kind;
   expected_mapping:=jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction',
    'kind',source.kind,'versionId',source.id,'contentHash',source.content_hash,'toolId',source.tool_id,'sourceProvider','PRIVATE_VERSION');
  ELSIF block#>>'{source,provider}'='STANDARD_SCALE' AND block#>>'{source,kind}'='SCALE' THEN
   SELECT * INTO standard_source FROM survey_standard_releases WHERE id=block#>>'{source,versionId}'
    AND combination_hash=block#>>'{source,contentHash}' AND state='ONLINE' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'EDUCATION_STANDARD_SOURCE_INVALID'; END IF;
   source_definition:=standard_source.snapshot->'definition';source_kind:='SCALE';
   expected_mapping:=jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction','kind','SCALE',
    'versionId',standard_source.id,'contentHash',standard_source.combination_hash,'toolId',standard_source.id,'sourceProvider','STANDARD_SCALE');
  ELSIF block#>>'{source,provider}'='PUBLIC_FORM' AND block#>>'{source,kind}'='FORM' THEN
   SELECT * INTO public_form FROM survey_governed_tools WHERE id=block#>>'{source,versionId}' AND family='FORM'
    AND state='ONLINE' AND snapshot_hash=block#>>'{source,contentHash}' FOR SHARE;
   IF NOT FOUND OR public_form.snapshot#>>'{unit,ref,kind}' IS DISTINCT FROM 'FORM' THEN RAISE EXCEPTION 'EDUCATION_PUBLIC_FORM_SOURCE_INVALID'; END IF;
   source_definition:=public_form.snapshot#>'{unit,displayDefinition}';source_kind:='FORM';
   expected_mapping:=jsonb_build_object('blockId',block->>'blockId','instruction',block->>'instruction','kind','FORM',
    'versionId',public_form.id,'contentHash',public_form.snapshot_hash,'toolId',public_form.id,'sourceProvider','PUBLIC_FORM');
   IF COALESCE(public_form.snapshot#>>'{unit,instruction}','')<>'' THEN
    expected_mapping:=expected_mapping||jsonb_build_object('sourceInstruction',public_form.snapshot#>>'{unit,instruction}');
   END IF;
  ELSE RAISE EXCEPTION 'EDUCATION_COMPOSITION_SOURCE_PROVIDER_INVALID'; END IF;
  IF (mapping-ARRAY['itemIds','sectionIds']) IS DISTINCT FROM expected_mapping
   THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_LEAF_SCOPE_INVALID'; END IF;
  expected_item_ids:='[]';expected_section_ids:='[]';
  IF source_kind='SCALE' THEN
   SELECT * INTO item FROM composite_assessment_items WHERE composite_assessment_id=NEW.id AND position=item_position;
   IF NOT FOUND OR (item.type='SCALE' AND item.required AND item.scale_id IS NOT NULL AND item.cognitive_assignment_id IS NULL
    AND item.situational_instrument_key IS NULL AND item.situational_instrument_version IS NULL AND item.standard_combination_source IS NULL
    AND item.form_type IS NULL AND item.form_label IS NULL AND item.form_placeholder IS NULL AND item.form_options IS NULL
    AND item.form_policy IS NULL AND item.form_definition IS NULL AND item.context_key IS NULL AND item.form_section_id IS NULL
    AND item.form_section_position IS NULL) IS NOT TRUE THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_SCALE_ITEM_INVALID'; END IF;
   SELECT * INTO scale_source FROM scales WHERE id=item.scale_id FOR SHARE;
   IF block#>>'{source,provider}'='STANDARD_SCALE' THEN
    SELECT * INTO release FROM measurement_content_releases WHERE id=standard_source.measurement_release->>'releaseId' FOR SHARE;
    IF (scale_source.code=standard_source.snapshot->>'toolKey' AND scale_source.instrument_version=standard_source.snapshot->>'instrumentVersion'
     AND scale_source.status='PUBLISHED' AND scale_source.instrument_class='STANDARD' AND scale_source.library_entry_id IS NULL
     AND (scale_source.definition-ARRAY['source','license','report','referencePolicy'])=standard_source.snapshot#>'{parts,CONTENT,payload}'
     AND release.layer='MEASUREMENT' AND release.family='SCALE' AND release.status='PUBLISHED'
     AND release.content_hash=standard_source.measurement_release->>'contentHash') IS NOT TRUE
     THEN RAISE EXCEPTION 'EDUCATION_STANDARD_MEASUREMENT_INVALID'; END IF;
    report_audience:=COALESCE(source_definition#>>'{report,audienceContract,audience}','teacher');
    unit:=jsonb_build_object('itemId',item.id,'family','SCALE','source',jsonb_build_object('kind','SCALE','id',scale_source.id,
     'ownerId',scale_source.creator_id,'educationStandard',jsonb_build_object('releaseId',standard_source.id,
      'combinationHash',standard_source.combination_hash,'toolKey',standard_source.snapshot->>'toolKey',
      'instrumentVersion',standard_source.snapshot->>'instrumentVersion','nativeDefinitionHash',education_composition_binding_hash(source_definition),
      'parametersAxisHash',standard_source.snapshot#>>'{parts,PARAMETERS,hash}','reportAxisHash',standard_source.snapshot#>>'{parts,REPORT,hash}',
      'reportAudience',report_audience,'respondentDisclosure',jsonb_build_object('numericScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,numericScores}')::boolean,false),'references',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,references}')::boolean,false),'individualInterpretations',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,individualInterpretations}')::boolean,false),'scoreDerivedLabels',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,scoreDerivedLabels}')::boolean,false),'resultQualityDetails',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,resultQualityDetails}')::boolean,false),'rawAnswers',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,rawAnswers}')::boolean,false),'itemScores',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,itemScores}')::boolean,false),'methods',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,methods}')::boolean,false),'educationalContent',COALESCE((standard_source.snapshot#>>'{parts,CONTENT,reference,metadata,disclosure,audiences,respondent,educationalContent}')::boolean,false)))),
     'measurement',jsonb_build_object('releaseId',release.id,'contentHash',release.content_hash,'measurementHash',release.content->>'measurementHash'));
    expected_choices:='[]';
    FOR source_set IN SELECT value FROM jsonb_array_elements(standard_source.snapshot->'references') LOOP
     SELECT * INTO derived FROM measurement_content_releases
      WHERE layer='REFERENCE' AND family='SCALE' AND content_key='standard-combination-parameters:'||standard_source.id||':'||substr(education_composition_binding_hash(source_set->'referenceVersion'),1,16)
       AND version=standard_source.snapshot#>>'{parts,PARAMETERS,hash}' FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'EDUCATION_STANDARD_PARAMETERS_MISSING'; END IF;
     expected_reference_entries:='[]';
     FOR reference_entry IN SELECT value FROM jsonb_array_elements(source_set->'entries') LOOP
      normalized_entry:=reference_entry;
      IF reference_entry ? 'governance' THEN normalized_entry:=reference_entry||jsonb_build_object('governance',
       (reference_entry->'governance')||jsonb_build_object('measurementHash',release.content->>'measurementHash')); END IF;
      expected_reference_entries:=expected_reference_entries||jsonb_build_array(jsonb_build_object('metricKey',reference_entry->>'scoreKey',
       'referenceKind',reference_entry->>'referenceKind','definition',normalized_entry));
      IF source_definition#>>'{referencePolicy,type}'='declared' AND EXISTS(SELECT 1 FROM jsonb_array_elements(source_definition#>'{referencePolicy,selections}') choice
       WHERE choice->>'referenceVersion'=source_set->>'referenceVersion' AND choice->>'scoreKey'=reference_entry->>'scoreKey'
        AND choice->>'referenceKind'=reference_entry->>'referenceKind') THEN
       expected_choices:=expected_choices||jsonb_build_array(jsonb_build_object('releaseId',derived.id,'contentHash',derived.content_hash,
        'entryKey',education_composition_binding_hash(jsonb_build_object('scoreKey',reference_entry->>'scoreKey','referenceKind',reference_entry->>'referenceKind',
         'population',reference_entry->'population','instrumentVersion',reference_entry->>'instrumentVersion','scoringVersion',reference_entry->>'scoringVersion')),
        'metricKey',reference_entry->>'scoreKey','referenceKind',reference_entry->>'referenceKind','priority',0));
      END IF;
     END LOOP;
     IF (derived.status='PUBLISHED' AND derived.scope=release.scope AND derived.source_release_id IS NULL AND derived.asset_refs='[]'::jsonb
      AND derived.provenance=jsonb_build_object('standardCombinationId',standard_source.id,'combinationHash',standard_source.combination_hash,
       'parametersAxisHash',standard_source.snapshot#>>'{parts,PARAMETERS,hash}','reportAxisHash',standard_source.snapshot#>>'{parts,REPORT,hash}',
       'sourceReferenceVersion',source_set->>'referenceVersion')
      AND derived.content=jsonb_build_object('projectionVersion',1,'measurement',jsonb_build_object('releaseId',release.id,'contentHash',release.content_hash),
       'entries',expected_reference_entries,'evidence',jsonb_build_object('sourceVersion',source_set->>'referenceVersion',
        'parameterVersion',standard_source.snapshot#>>'{parts,PARAMETERS,version}'))) IS NOT TRUE
      THEN RAISE EXCEPTION 'EDUCATION_STANDARD_PARAMETERS_INVALID'; END IF;
    END LOOP;
    unit:=unit||jsonb_build_object('referencePolicy',jsonb_build_object('policyVersion','EXACT_POPULATION_PRIORITY_V1',
     'measurementReleaseId',release.id,'choices',expected_choices));
    IF standard_source.snapshot->'template'<>'null'::jsonb THEN
     SELECT * INTO derived FROM measurement_content_releases WHERE layer='REPORT' AND family='SCALE'
      AND content_key='standard-combination-report:'||standard_source.id||CASE WHEN report_audience='teacher' THEN '' ELSE ':'||report_audience END
      AND version=education_composition_binding_hash(jsonb_build_object('parameters',standard_source.snapshot#>>'{parts,PARAMETERS,hash}',
       'report',standard_source.snapshot#>>'{parts,REPORT,hash}')) FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'EDUCATION_STANDARD_REPORT_MISSING'; END IF;
     expected_report:=jsonb_build_object('projectionVersion',1,'measurements',jsonb_build_array(jsonb_build_object('releaseId',release.id,'contentHash',release.content_hash)),
      'metricKeys',(SELECT jsonb_agg(score->>'key') FROM jsonb_array_elements(source_definition#>'{scoring,scores}') score),
      'audience',report_audience,'language',COALESCE(source_definition#>>'{versionAxes,locale}','und'),
      'generatorVersion','DECLARATIVE_REPORT_V1','template',standard_source.snapshot->'template');
     IF (derived.status='PUBLISHED' AND derived.scope=release.scope AND derived.source_release_id IS NULL AND derived.asset_refs='[]'::jsonb
      AND derived.provenance=jsonb_build_object('standardCombinationId',standard_source.id,'combinationHash',standard_source.combination_hash,
       'parametersAxisHash',standard_source.snapshot#>>'{parts,PARAMETERS,hash}','reportAxisHash',standard_source.snapshot#>>'{parts,REPORT,hash}')
      AND derived.content=expected_report) IS NOT TRUE THEN RAISE EXCEPTION 'EDUCATION_STANDARD_REPORT_INVALID'; END IF;
     unit:=unit||jsonb_build_object('report',jsonb_build_object('releaseId',derived.id,'contentHash',derived.content_hash));
    END IF;
   ELSE
   SELECT * INTO release FROM measurement_content_releases WHERE id=scale_source.measurement_release_id FOR SHARE;
   IF (scale_source.code='education-private-scale:'||source.id AND scale_source.creator_id=source.owner_user_id
    AND scale_source.library_entry_id IS NULL AND scale_source.definition=source.definition AND scale_source.definition_hash IS NOT NULL
    AND scale_source.status='PUBLISHED' AND scale_source.visibility='COURSE' AND scale_source.instrument_class='CUSTOM_DESCRIPTIVE' AND scale_source.instrument_version='1.0.0'
    AND release.layer='MEASUREMENT' AND release.family='SCALE' AND release.status='PUBLISHED'
    AND release.scope=jsonb_build_object('kind','PRIVATE','product',v.entry,'ownerId',v.owner_user_id,'resourceId',source.id)
    AND release.provenance->>'sourceKind'='EDUCATION_PRIVATE_TOOL_VERSION' AND release.provenance->>'versionId'=source.id
    AND release.provenance->>'privateContentHash'=source.content_hash AND release.provenance->>'organizationId'=v.organization_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_SCALE_SOURCE_INVALID'; END IF;
   unit:=jsonb_build_object('itemId',item.id,'family','SCALE','source',jsonb_build_object('kind','SCALE','id',scale_source.id,
    'ownerId',source.owner_user_id,'privateVersionId',source.id),'measurement',jsonb_build_object('releaseId',release.id,
    'contentHash',release.content_hash,'measurementHash',release.content->>'measurementHash'));
   END IF;
   expected_units:=expected_units||jsonb_build_array(unit);expected_item_ids:=jsonb_build_array(item.id);item_position:=item_position+1;
  ELSE
   FOR page IN SELECT value FROM jsonb_array_elements(source_definition->'pages') LOOP
    SELECT * INTO section FROM composite_form_sections WHERE composite_assessment_id=NEW.id AND position=section_position;
    IF NOT FOUND OR section.title IS DISTINCT FROM page->>'title' OR section.description IS DISTINCT FROM page->>'description'
     OR section.context_section OR jsonb_array_length(page->'questions')=0 THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_FORM_SECTION_INVALID'; END IF;
    expected_section_ids:=expected_section_ids||jsonb_build_array(section.id);page_item_position:=0;
    FOR question IN SELECT value FROM jsonb_array_elements(page->'questions') LOOP
     SELECT * INTO item FROM composite_assessment_items WHERE composite_assessment_id=NEW.id AND position=item_position;
     SELECT COALESCE(jsonb_agg(jsonb_build_object('value',option->>'optionKey','label',option->>'label') ORDER BY ordinal),'[]')
      INTO expected_options FROM jsonb_array_elements(question->'options') WITH ORDINALITY options(option,ordinal);
     IF (item.type='FORM' AND item.form_section_id=section.id AND item.form_section_position=page_item_position
      AND item.form_type=question->>'type' AND item.form_label=question->>'prompt' AND item.required=(question->>'required')::boolean
      AND item.form_definition=education_private_form_runtime_question(question) AND item.form_options=expected_options
      AND item.form_policy='{"version":3,"requiredRefusal":"ALLOW_SUBMIT","hiddenRequired":"EXEMPT"}'::jsonb
      AND item.scale_id IS NULL AND item.cognitive_assignment_id IS NULL AND item.situational_instrument_key IS NULL
      AND item.situational_instrument_version IS NULL AND item.form_placeholder IS NULL AND item.context_key IS NULL
      AND item.standard_combination_source IS NULL) IS NOT TRUE THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_FORM_ITEM_INVALID'; END IF;
     expected_item_ids:=expected_item_ids||jsonb_build_array(item.id);item_position:=item_position+1;page_item_position:=page_item_position+1;
    END LOOP;
    section_position:=section_position+1;
   END LOOP;
  END IF;
  IF mapping->'itemIds' IS DISTINCT FROM expected_item_ids OR mapping->'sectionIds' IS DISTINCT FROM expected_section_ids
   THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_MAPPING_INVALID'; END IF;
  block_position:=block_position+1;
 END LOOP;
 IF item_position NOT BETWEEN 1 AND 1000 OR item_position<>(SELECT count(*) FROM composite_assessment_items WHERE composite_assessment_id=NEW.id)
  OR section_position<>(SELECT count(*) FROM composite_form_sections WHERE composite_assessment_id=NEW.id)
  OR NEW.training_content_snapshot->'units' IS DISTINCT FROM expected_units
  THEN RAISE EXCEPTION 'EDUCATION_COMPOSITION_CHILDREN_INVALID'; END IF;
 RETURN NEW;
END $$;
COMMIT;
