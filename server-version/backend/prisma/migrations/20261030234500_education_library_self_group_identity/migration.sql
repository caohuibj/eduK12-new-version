-- Preserve all immutable V1 identities. New explicit SELF GROUP versions reuse
-- the exact approved C and allow only the existing independent review lifecycle.
-- No tables, columns, source snapshots or old permissions are rewritten.
CREATE OR REPLACE FUNCTION protect_education_library_registered_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin jsonb; source_record record; group_version boolean; mutable_columns text[];
BEGIN
 origin:=CASE WHEN TG_OP='DELETE' THEN OLD.entry->'libraryOrigin' ELSE NEW.entry->'libraryOrigin' END;
 group_version:=COALESCE(origin->>'adapterVersion' ~ '^2[.]0[.][0-9]+$',FALSE);
 IF TG_OP IN ('UPDATE','DELETE') AND
   (OLD.resource_key LIKE 'library-scale:%' OR OLD.entry ? 'libraryOrigin') THEN
   IF NOT group_version OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Education library resource identity is immutable'; END IF;
   mutable_columns:=CASE
     WHEN OLD.status='DRAFT' AND NEW.status='REVIEWED' THEN ARRAY['status','reviewed_by_user_id','reviewed_at']
     WHEN OLD.status='REVIEWED' AND NEW.status='PUBLISHED' THEN ARRAY['status','published_by_user_id','published_at']
     WHEN OLD.status='PUBLISHED' AND NEW.status='RETIRED' THEN ARRAY['status','retired_by_user_id','retired_at']
     ELSE NULL END;
   IF mutable_columns IS NULL OR (to_jsonb(OLD)-mutable_columns) IS DISTINCT FROM (to_jsonb(NEW)-mutable_columns) THEN
     RAISE EXCEPTION 'Education library GROUP allows only its independent review lifecycle';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.resource_key LIKE 'library-scale:%' OR NEW.entry ? 'libraryOrigin' THEN
   IF TG_OP='UPDATE' AND (NOT group_version OR NOT (OLD.resource_key LIKE 'library-scale:%' OR OLD.entry ? 'libraryOrigin')) THEN RAISE EXCEPTION 'Existing resources cannot become library resources'; END IF;
   origin:=NEW.entry->'libraryOrigin';
   IF (jsonb_typeof(origin)='object' AND origin->>'schemaVersion'='1' AND (origin->>'adapterVersion'='1.0.0' OR group_version)
       AND origin->>'product' IN ('SCHOOL','TEACHER')
       AND NEW.resource_key='library-scale:'||(origin->>'entryId')||':'||(origin->>'product')||':'||(origin->>'variantKey')||(CASE WHEN group_version THEN ':GROUP' ELSE '' END)
       AND NEW.resource_version=origin->>'adapterVersion'
       AND NEW.entry#>>'{applicability,resourceKey}'=NEW.resource_key
       AND NEW.entry#>>'{applicability,resourceVersion}'=NEW.resource_version
       AND NEW.entry#>>'{launchTarget,compositeAssessmentId}'=NEW.composite_id
       AND (NOT group_version AND NEW.status='PUBLISHED' OR group_version AND NEW.status IN ('DRAFT','REVIEWED','PUBLISHED','RETIRED'))
       AND origin->>'sourceDefinitionHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN
     RAISE EXCEPTION 'Education library resource namespace or origin mismatch';
   END IF;
   IF group_version THEN
     IF (origin->>'variantKey' IN ('STUDENT:SELF','TEACHER:SELF')
       AND NEW.entry#>>'{applicability,analysisMode}'='COHORT_AGGREGATE'
       AND NEW.entry#>'{applicability,relationshipKinds}'='["SELF"]'::jsonb
       AND NEW.entry#>'{applicability,perspectives}'='["SELF_REPORT"]'::jsonb
       AND NEW.entry#>>'{resultDisclosure,policyKey}'='EDUCATION_SELF_GROUP_V2'
       AND NEW.entry#>>'{cohortAnalysisPolicy,policyKey}'='EDUCATION_SELF_GROUP_V2'
       AND NEW.entry#>>'{cohortAnalysisPolicy,policyVersion}'='2.0.0'
       AND (NEW.entry#>>'{applicability,minimumRespondents}')::int>=3
       AND NEW.entry#>'{applicability,minimumRespondents}'=NEW.entry#>'{resultDisclosure,minimumRespondents}'
       AND NEW.entry#>'{applicability,minimumRespondents}'=NEW.entry#>'{cohortAnalysisPolicy,minimumRespondents}') IS NOT TRUE
       OR (TG_OP='INSERT' AND NEW.status<>'DRAFT') THEN
       RAISE EXCEPTION 'Education library GROUP requires a new explicit SELF contract';
     END IF;
   END IF;
   SELECT e.release_id,s.snapshot,s.snapshot_hash,s.dependency_release_ids,r.content_hash,
      w.library_entry_id,w.measurement_release_id,w.definition,w.definition_hash,w.creator_id,
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
   IF group_version AND NEW.status IN ('REVIEWED','PUBLISHED','RETIRED') AND (
     NEW.reviewed_by_user_id IS NULL OR NEW.reviewed_at IS NULL
     OR NEW.reviewed_by_user_id IN (NEW.created_by_user_id,source_record.creator_id)
     OR NEW.status IN ('PUBLISHED','RETIRED') AND (NEW.published_by_user_id IS NULL OR NEW.published_at IS NULL)
     OR NEW.status='RETIRED' AND (NEW.retired_by_user_id IS NULL OR NEW.retired_at IS NULL)
   ) THEN RAISE EXCEPTION 'Education library GROUP requires independent review and publication'; END IF;
 END IF;
 RETURN NEW;
END $$;
