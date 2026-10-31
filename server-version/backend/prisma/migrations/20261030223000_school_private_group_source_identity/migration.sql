-- Extend only the immutable School SELF namespace. Existing private V1 rows,
-- UPDATE/DELETE refusal, source/owner/release and exact one-slot checks remain.
DO $migration$
DECLARE source text; old_header text; new_header text; old_owner text; new_owner text;
BEGIN
 source:=pg_get_functiondef('protect_education_private_registered_identity()'::regprocedure);
 old_header:=$old$origin->>'kind'='AUTHOR_PRIVATE' AND origin->>'schemaVersion'='1'
   AND origin->>'adapterVersion'='1.0.0' AND NEW.resource_version='1.0.0'
   AND NEW.resource_key='private-scale:'||(origin->>'entry')||':'||(origin->>'versionId')||':'||(origin->>'variantKey')
   AND NEW.entry#>>'{applicability,resourceKey}'=NEW.resource_key AND NEW.entry#>>'{applicability,resourceVersion}'='1.0.0'$old$;
 new_header:=$new$origin->>'kind'='AUTHOR_PRIVATE'
   AND ((origin->>'schemaVersion'='1' AND origin->>'adapterVersion'='1.0.0' AND NEW.resource_version='1.0.0'
     AND NEW.resource_key='private-scale:'||(origin->>'entry')||':'||(origin->>'versionId')||':'||(origin->>'variantKey'))
    OR (origin->>'schemaVersion'='2' AND origin->>'adapterVersion'='2.0.0' AND NEW.resource_version='2.0.0'
     AND origin->>'entry'='SCHOOL' AND origin->>'variantKey'='STUDENT:SELF'
     AND NEW.resource_key='private-scale:SCHOOL:'||(origin->>'versionId')||':STUDENT:SELF:GROUP:'||education_composition_binding_hash(origin->'groupReporting')
     AND origin#>>'{groupReporting,schemaVersion}'='1' AND (origin#>>'{groupReporting,minimumRespondents}')::integer>=10
     AND jsonb_array_length(origin#>'{groupReporting,leaves}')=1
     AND NOT (origin#>'{groupReporting,leaves,0}')?'blockId'
     AND origin#>>'{groupReporting,leaves,0,versionId}'=origin->>'versionId'
     AND origin#>>'{groupReporting,leaves,0,contentHash}'=origin->>'contentHash'
     AND NEW.entry#>>'{applicability,analysisMode}'='COHORT_AGGREGATE'
     AND NEW.entry#>'{applicability,subjectRoles}'='["STUDENT"]'::jsonb
     AND NEW.entry#>'{applicability,respondentRoles}'='["STUDENT"]'::jsonb
     AND NEW.entry#>'{applicability,relationshipKinds}'='["SELF"]'::jsonb
     AND NEW.entry#>'{applicability,perspectives}'='["SELF_REPORT"]'::jsonb
     AND NEW.entry#>>'{resultDisclosure,policyKey}'='EDUCATION_SELF_GROUP_V2'
     AND NEW.entry#>>'{cohortAnalysisPolicy,policyKey}'='EDUCATION_SELF_GROUP_V2'
     AND NEW.entry#>>'{cohortAnalysisPolicy,policyVersion}'='2.0.0'
     AND NEW.entry#>'{applicability,minimumRespondents}'=origin#>'{groupReporting,minimumRespondents}'
     AND NEW.entry#>'{resultDisclosure,minimumRespondents}'=origin#>'{groupReporting,minimumRespondents}'
     AND NEW.entry#>'{cohortAnalysisPolicy,minimumRespondents}'=origin#>'{groupReporting,minimumRespondents}'))
   AND NEW.entry#>>'{applicability,resourceKey}'=NEW.resource_key AND NEW.entry#>>'{applicability,resourceVersion}'=NEW.resource_version$new$;
 old_owner:=$old$AND v.tool_id=origin->>'toolId' AND v.content_hash=origin->>'contentHash'$old$;
 new_owner:=$new$AND v.tool_id=origin->>'toolId' AND v.content_hash=origin->>'contentHash'
    AND (NEW.resource_version<>'2.0.0' OR (v.definition#>>'{license,status}'='self_authored' AND v.definition#>>'{license,redistribution}'='allowed'))$new$;
 IF position(old_header IN source)=0 OR position(old_owner IN source)=0 THEN
  RAISE EXCEPTION 'PRIVATE_SCALE_GROUP_GUARD_SOURCE_DRIFT';
 END IF;
 EXECUTE replace(replace(source,old_header,new_header),old_owner,new_owner);
END
$migration$;
