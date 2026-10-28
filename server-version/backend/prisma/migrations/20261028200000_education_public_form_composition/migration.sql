-- Extend the existing once-only seal to exact immutable public Form origins.
-- No private Form copies, new lifecycle table, data rewrite or approval step.
BEGIN;
CREATE OR REPLACE FUNCTION protect_education_composition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v education_private_tool_versions%ROWTYPE; source education_private_tool_versions%ROWTYPE;
 public_form survey_governed_tools%ROWTYPE; source_definition jsonb; source_kind text; expected_mapping jsonb;
 binding jsonb; origin jsonb; block jsonb; mapping jsonb; expected_origin jsonb; expected_units jsonb:='[]'; unit jsonb;
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
  AND (binding-ARRAY['schemaVersion','origin','sealed','manifest'])='{}'::jsonb
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
