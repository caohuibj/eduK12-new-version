-- The public adapter remains gated. Only new library namespace records receive
-- these protections; old descriptive/Teacher license resources are unchanged.
CREATE FUNCTION protect_education_library_registered_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin jsonb; source_record record;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND
   (OLD.resource_key LIKE 'library-scale:%' OR OLD.entry ? 'libraryOrigin') THEN
   RAISE EXCEPTION 'Education library resource identity is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.resource_key LIKE 'library-scale:%' OR NEW.entry ? 'libraryOrigin' THEN
   IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Existing resources cannot become library resources'; END IF;
   origin:=NEW.entry->'libraryOrigin';
   IF (jsonb_typeof(origin)='object' AND origin->>'schemaVersion'='1' AND origin->>'adapterVersion'='1.0.0'
       AND origin->>'product' IN ('SCHOOL','TEACHER')
       AND NEW.resource_key='library-scale:'||(origin->>'entryId')||':'||(origin->>'product')||':'||(origin->>'variantKey')
       AND NEW.resource_version=origin->>'adapterVersion'
       AND NEW.entry#>>'{applicability,resourceKey}'=NEW.resource_key
       AND NEW.entry#>>'{applicability,resourceVersion}'=NEW.resource_version
       AND NEW.entry#>>'{launchTarget,compositeAssessmentId}'=NEW.composite_id
       AND NEW.status='PUBLISHED'
       AND origin->>'sourceDefinitionHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN
     RAISE EXCEPTION 'Education library resource namespace or origin mismatch';
   END IF;
   SELECT e.release_id,s.snapshot,s.snapshot_hash,s.dependency_release_ids,r.content_hash,
      w.library_entry_id,w.measurement_release_id,w.definition,w.definition_hash,
      c.product_kind,c.public_enabled,c.status AS composite_status,c.training_content_snapshot
     INTO source_record FROM scale_library_entries e
     JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
     JOIN measurement_content_releases r ON r.id=e.release_id
     JOIN scales w ON w.id=NEW.scale_id AND w.library_entry_id=e.id
     JOIN composite_assessments c ON c.id=NEW.composite_id
     WHERE e.id=origin->>'entryId';
   IF NOT FOUND OR (source_record.release_id=origin->>'releaseId'
       AND source_record.measurement_release_id=source_record.release_id
       AND source_record.content_hash=origin->>'contentHash'
       AND source_record.snapshot_hash=origin->>'approvedSnapshotHash'
       AND source_record.snapshot->>'educationApplicabilityHash'=origin->>'applicabilityHash'
       AND source_record.snapshot#>'{educationApplicability,administrations}' @>
         jsonb_build_array(jsonb_build_object('population',split_part(origin->>'variantKey',':',1),'responseMode',split_part(origin->>'variantKey',':',2)))
       AND source_record.definition=source_record.snapshot->'compiledDefinition'
       AND source_record.definition_hash=NEW.definition_hash
       AND source_record.product_kind='ORGANIZATION_RESOURCE' AND source_record.public_enabled=FALSE
       AND source_record.composite_status='PUBLISHED'
       AND source_record.training_content_snapshot->>'compositeId'=NEW.composite_id
       AND jsonb_array_length(source_record.training_content_snapshot->'units')=1
       AND source_record.training_content_snapshot#>>'{units,0,source,id}'=NEW.scale_id
       AND source_record.training_content_snapshot#>>'{units,0,source,libraryEntryId}'=origin->>'entryId'
       AND source_record.training_content_snapshot#>>'{units,0,measurement,releaseId}'=origin->>'releaseId'
       AND source_record.training_content_snapshot#>>'{units,0,measurement,contentHash}'=origin->>'contentHash'
       AND (SELECT count(*) FROM composite_assessment_items item WHERE item.composite_assessment_id=NEW.composite_id)=1
       AND EXISTS(SELECT 1 FROM composite_assessment_items item WHERE item.composite_assessment_id=NEW.composite_id
         AND item.id=source_record.training_content_snapshot#>>'{units,0,itemId}'
         AND item.type='SCALE' AND item.scale_id=NEW.scale_id AND item.required=TRUE AND item.position=0)
       -- This adapter version has no independent dependency consumer yet.
       AND cardinality(source_record.dependency_release_ids)=0 AND origin->'dependencies'='[]'::jsonb) IS NOT TRUE THEN
     RAISE EXCEPTION 'Education library resource source linkage mismatch';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_library_registered_identity_guard BEFORE INSERT OR UPDATE OR DELETE
 ON registered_assessment_resources FOR EACH ROW EXECUTE FUNCTION protect_education_library_registered_identity();

CREATE FUNCTION protect_education_library_composite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.composite_id=OLD.id AND r.resource_key LIKE 'library-scale:%') THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Education library runtime target is retained'; END IF;
   -- FINAL may increment the existing aggregate revision, but never rewrite the
   -- content, presentation, disclosure or runtime target of a registered version.
   IF (to_jsonb(OLD)-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'revision'-'updated_at') THEN
     RAISE EXCEPTION 'Education library runtime target is immutable';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_library_composite_guard BEFORE UPDATE OR DELETE ON composite_assessments
 FOR EACH ROW EXECUTE FUNCTION protect_education_library_composite();

CREATE FUNCTION protect_education_library_composite_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM registered_assessment_resources r WHERE r.resource_key LIKE 'library-scale:%'
    AND ((TG_OP<>'INSERT' AND r.composite_id=OLD.composite_assessment_id)
      OR (TG_OP<>'DELETE' AND r.composite_id=NEW.composite_assessment_id))) THEN
   RAISE EXCEPTION 'Education library runtime items are immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER education_library_composite_item_guard BEFORE INSERT OR UPDATE OR DELETE ON composite_assessment_items
 FOR EACH ROW EXECUTE FUNCTION protect_education_library_composite_item();
