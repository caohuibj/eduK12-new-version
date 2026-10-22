-- New private namespace only: no data rewrite, table, column or authorization.
CREATE FUNCTION protect_education_private_registered_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin jsonb;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND (OLD.resource_key LIKE 'private-scale:%' OR OLD.entry ? 'privateOrigin') THEN
  RAISE EXCEPTION 'PRIVATE_SCALE_REGISTERED_IDENTITY_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.resource_key LIKE 'private-scale:%' OR NEW.entry ? 'privateOrigin' THEN
  origin:=NEW.entry->'privateOrigin';
  IF TG_OP<>'INSERT' OR (origin->>'kind'='AUTHOR_PRIVATE' AND origin->>'schemaVersion'='1'
   AND origin->>'adapterVersion'='1.0.0' AND NEW.resource_version='1.0.0'
   AND NEW.resource_key='private-scale:'||(origin->>'entry')||':'||(origin->>'versionId')||':'||(origin->>'variantKey')
   AND NEW.entry#>>'{applicability,resourceKey}'=NEW.resource_key AND NEW.entry#>>'{applicability,resourceVersion}'='1.0.0'
   AND NEW.entry#>>'{launchTarget,compositeAssessmentId}'=NEW.composite_id AND NEW.status='PUBLISHED'
   AND ((origin->>'entry'='SCHOOL' AND origin->>'variantKey' IN ('STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT'))
    OR (origin->>'entry'='TEACHER' AND origin->>'variantKey'='TEACHER:SELF'))) IS NOT TRUE THEN
   RAISE EXCEPTION 'PRIVATE_SCALE_REGISTERED_IDENTITY_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM education_private_tool_versions v
   JOIN scales s ON s.id=NEW.scale_id
   JOIN measurement_content_releases r ON r.id=s.measurement_release_id
   JOIN composite_assessments c ON c.id=NEW.composite_id
   WHERE v.id=origin->>'versionId' AND v.kind='SCALE' AND v.entry=origin->>'entry'
    AND v.organization_id=origin->>'organizationId' AND v.owner_user_id=origin->>'ownerUserId'
    AND v.tool_id=origin->>'toolId' AND v.content_hash=origin->>'contentHash'
    AND s.code='education-private-scale:'||v.id AND s.creator_id=v.owner_user_id AND s.library_entry_id IS NULL
    AND s.definition=v.definition AND s.definition_hash=NEW.definition_hash AND s.definition_hash=origin->>'definitionHash'
    AND s.status='PUBLISHED' AND s.visibility='COURSE' AND s.instrument_class='CUSTOM_DESCRIPTIVE' AND s.instrument_version='1.0.0'
    AND r.id=origin->>'releaseId' AND r.content_hash=origin->>'releaseHash' AND r.status='PUBLISHED'
    AND r.layer='MEASUREMENT' AND r.family='SCALE' AND r.scope->>'kind'='PRIVATE'
    AND r.scope->>'product'=v.entry AND r.scope->>'ownerId'=v.owner_user_id AND r.scope->>'resourceId'=v.id
    AND r.provenance->>'sourceKind'='EDUCATION_PRIVATE_TOOL_VERSION' AND r.provenance->>'versionId'=v.id
    AND r.provenance->>'organizationId'=v.organization_id AND r.provenance->>'privateContentHash'=v.content_hash
    AND c.product_kind='ORGANIZATION_RESOURCE' AND c.status='PUBLISHED' AND NOT c.public_enabled AND NOT c.copyable
    AND c.created_by=v.owner_user_id AND NEW.created_by_user_id=v.owner_user_id AND NEW.published_by_user_id=v.owner_user_id
    AND c.training_content_snapshot#>>'{units,0,source,privateVersionId}'=v.id
    AND c.training_content_snapshot#>>'{units,0,source,id}'=s.id
    AND c.training_content_snapshot#>>'{units,0,source,ownerId}'=v.owner_user_id
    AND c.training_content_snapshot#>>'{units,0,measurement,releaseId}'=r.id
    AND c.training_content_snapshot#>>'{units,0,measurement,contentHash}'=r.content_hash
    AND jsonb_array_length(c.training_content_snapshot->'units')=1
    AND (SELECT count(*) FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id)=1
    AND EXISTS(SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id
      AND i.type='SCALE' AND i.scale_id=s.id AND i.required AND i.position=0)) THEN
   RAISE EXCEPTION 'PRIVATE_SCALE_REGISTERED_SOURCE_MISMATCH';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_private_registered_identity BEFORE INSERT OR UPDATE OR DELETE ON registered_assessment_resources
 FOR EACH ROW EXECUTE FUNCTION protect_education_private_registered_identity();

CREATE FUNCTION protect_education_private_runtime_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='scales' AND EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.scale_id=OLD.id AND r.resource_key LIKE 'private-scale:%') THEN
  RAISE EXCEPTION 'PRIVATE_SCALE_WRAPPER_IMMUTABLE';
 ELSIF TG_TABLE_NAME='composite_assessments' AND EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.composite_id=OLD.id AND r.resource_key LIKE 'private-scale:%') THEN
  IF TG_OP='DELETE' OR (to_jsonb(OLD)-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'revision'-'updated_at') THEN
   RAISE EXCEPTION 'PRIVATE_SCALE_COMPOSITE_IMMUTABLE';
  END IF;
 ELSIF TG_TABLE_NAME='composite_assessment_items' THEN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.composite_id=OLD.composite_assessment_id AND r.resource_key LIKE 'private-scale:%') THEN
   RAISE EXCEPTION 'PRIVATE_SCALE_ITEM_IMMUTABLE';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.composite_id=NEW.composite_assessment_id AND r.resource_key LIKE 'private-scale:%') THEN
   RAISE EXCEPTION 'PRIVATE_SCALE_ITEM_IMMUTABLE';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_private_scale_immutable BEFORE UPDATE OR DELETE ON scales FOR EACH ROW EXECUTE FUNCTION protect_education_private_runtime_source();
CREATE TRIGGER education_private_composite_immutable BEFORE UPDATE OR DELETE ON composite_assessments FOR EACH ROW EXECUTE FUNCTION protect_education_private_runtime_source();
CREATE TRIGGER education_private_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON composite_assessment_items FOR EACH ROW EXECUTE FUNCTION protect_education_private_runtime_source();
