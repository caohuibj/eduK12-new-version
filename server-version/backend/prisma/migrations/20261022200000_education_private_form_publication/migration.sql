-- No data rewrite. Preserve immutable source/children; permit one-way publication.
CREATE OR REPLACE FUNCTION protect_education_private_form_composite() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v education_private_tool_versions%ROWTYPE; parts text[]; identity jsonb; page jsonb; question jsonb;
 section composite_form_sections%ROWTYPE; item composite_assessment_items%ROWTYPE;
 page_position integer:=0; item_position integer:=0; section_position integer; expected_options jsonb;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND (OLD.creation_key LIKE 'private-form:%' OR OLD.code LIKE 'education-private-form:%') THEN
  -- The only lifecycle transition permitted for a sealed private FORM.
  -- Application code must independently authorize the enclosing Run publish.
  IF TG_OP='UPDATE' AND OLD.status='DRAFT' AND NEW.status='PUBLISHED'
   AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL
   AND (to_jsonb(OLD)-'revision'-'updated_at'-'status'-'published_at') IS NOT DISTINCT FROM
       (to_jsonb(NEW)-'revision'-'updated_at'-'status'-'published_at') THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'revision'-'updated_at') THEN
   RAISE EXCEPTION 'PRIVATE_FORM_COMPOSITE_IMMUTABLE';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (NEW.creation_key LIKE 'private-form:%' OR NEW.code LIKE 'education-private-form:%') IS NOT TRUE THEN RETURN NEW; END IF;
 IF (NEW.creation_key ~ '^private-form:(SCHOOL|TEACHER):[a-f0-9-]{36}:(STUDENT:(SELF|PARENT_REPORT|TEACHER_REPORT)|TEACHER:SELF)$'
  AND NEW.code='education-'||NEW.creation_key) IS NOT TRUE THEN RAISE EXCEPTION 'PRIVATE_FORM_SOURCE_INVALID'; END IF;
 parts:=string_to_array(NEW.creation_key,':');
 SELECT * INTO v FROM education_private_tool_versions WHERE id=parts[3] AND kind='FORM' AND entry=parts[2];
 IF NOT FOUND OR NOT ((v.entry='SCHOOL' AND parts[4]='STUDENT' AND parts[5] IN ('SELF','PARENT_REPORT','TEACHER_REPORT'))
  OR (v.entry='TEACHER' AND parts[4]='TEACHER' AND parts[5]='SELF')) THEN RAISE EXCEPTION 'PRIVATE_FORM_SOURCE_INVALID'; END IF;
 identity:=jsonb_build_object('schemaVersion',1,'adapterVersion','1.0.0','kind','AUTHOR_PRIVATE_FORM','entry',v.entry,
  'organizationId',v.organization_id,'ownerUserId',v.owner_user_id,'toolId',v.tool_id,'versionId',v.id,'contentHash',v.content_hash,
  'variantKey',parts[4]||':'||parts[5]);
 IF (NEW.created_by=v.owner_user_id AND NEW.name=v.title AND NEW.creation_hash=education_private_form_identity_hash(identity)
  AND NEW.product_kind='ORGANIZATION_RESOURCE' AND NEW.status='DRAFT' AND NOT NEW.public_enabled AND NOT NEW.copyable
  AND NEW.published_at IS NULL AND NEW.report_package_key IS NULL AND NEW.analysis_protocol_key IS NULL
  AND NEW.training_content_snapshot=jsonb_build_object('schemaVersion',1,'compositeId',NEW.id,'units','[]'::jsonb)
  AND NEW.training_content_snapshot_hash=education_private_form_identity_hash(NEW.training_content_snapshot)) IS NOT TRUE
  THEN RAISE EXCEPTION 'PRIVATE_FORM_SOURCE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM composite_assessment_attempts WHERE composite_assessment_id=NEW.id) THEN RAISE EXCEPTION 'PRIVATE_FORM_SOURCE_INVALID'; END IF;
 FOR page IN SELECT value FROM jsonb_array_elements(v.definition->'pages') LOOP
  SELECT * INTO section FROM composite_form_sections WHERE composite_assessment_id=NEW.id AND position=page_position;
  IF NOT FOUND OR section.title IS DISTINCT FROM page->>'title' OR section.description IS DISTINCT FROM page->>'description'
   OR section.context_section OR jsonb_array_length(page->'questions')=0 THEN RAISE EXCEPTION 'PRIVATE_FORM_SECTION_SOURCE_MISMATCH'; END IF;
  section_position:=0;
  FOR question IN SELECT value FROM jsonb_array_elements(page->'questions') LOOP
   SELECT * INTO item FROM composite_assessment_items WHERE composite_assessment_id=NEW.id AND position=item_position;
   SELECT COALESCE(jsonb_agg(jsonb_build_object('value',option->>'optionKey','label',option->>'label') ORDER BY ordinal),'[]'::jsonb)
    INTO expected_options FROM jsonb_array_elements(question->'options') WITH ORDINALITY AS options(option,ordinal);
   IF NOT FOUND OR (item.type='FORM' AND item.form_section_id=section.id AND item.form_section_position=section_position
    AND item.form_type=question->>'type' AND item.form_label=question->>'prompt' AND item.required=(question->>'required')::boolean
    AND item.form_definition=question AND item.form_options=expected_options
    AND item.form_policy='{"version":3,"requiredRefusal":"ALLOW_SUBMIT","hiddenRequired":"EXEMPT"}'::jsonb
    AND item.scale_id IS NULL AND item.cognitive_assignment_id IS NULL AND item.situational_instrument_key IS NULL
    AND item.situational_instrument_version IS NULL AND item.form_placeholder IS NULL AND item.context_key IS NULL
    AND NOT (question ? 'image')) IS NOT TRUE THEN RAISE EXCEPTION 'PRIVATE_FORM_ITEM_SOURCE_MISMATCH'; END IF;
   IF question ? 'displayIf' AND NOT EXISTS(SELECT 1 FROM composite_assessment_items prior
    WHERE prior.composite_assessment_id=NEW.id AND prior.form_section_id=section.id AND prior.position<item_position
     AND prior.form_definition->>'itemKey'=question#>>'{displayIf,itemKey}' AND prior.form_type IN ('SINGLE','MULTIPLE'))
    THEN RAISE EXCEPTION 'PRIVATE_FORM_CONDITION_UNSUPPORTED'; END IF;
   item_position:=item_position+1;section_position:=section_position+1;
  END LOOP;
  page_position:=page_position+1;
 END LOOP;
 IF page_position=0 OR (SELECT count(*) FROM composite_form_sections WHERE composite_assessment_id=NEW.id)<>page_position
  OR (SELECT count(*) FROM composite_assessment_items WHERE composite_assessment_id=NEW.id)<>item_position
  THEN RAISE EXCEPTION 'PRIVATE_FORM_CHILDREN_SOURCE_MISMATCH'; END IF;
 RETURN NEW;
END $$;
