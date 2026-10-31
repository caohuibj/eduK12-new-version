import {Prisma} from '@prisma/client'

/** Server-owned SQL expressions only. This narrows registered private resources
 * to their immutable version and actual tenant; it is NOT actor authorization.
 * Execution loaders also verify full canonical definition/policy/slot hashes. */
export function privateScaleRegistryIdentitySql(input:{registered:Prisma.Sql;organizationId:Prisma.Sql;product:'SCHOOL'|'TEACHER'}){
 const r=input.registered
 return Prisma.sql`(
  ${r}.status='PUBLISHED'
  AND ((${r}.resource_version='1.0.0' AND ${r}.entry->'privateOrigin'->>'schemaVersion'='1'
        AND ${r}.entry->'privateOrigin'->>'adapterVersion'='1.0.0')
    OR (${input.product}='SCHOOL' AND ${r}.resource_version='2.0.0'
        AND ${r}.entry->'privateOrigin'->>'schemaVersion'='2' AND ${r}.entry->'privateOrigin'->>'adapterVersion'='2.0.0'
        AND ${r}.entry->'privateOrigin'->>'variantKey'='STUDENT:SELF'
        AND ${r}.entry#>>'{applicability,analysisMode}'='COHORT_AGGREGATE'
        AND ${r}.entry#>>'{resultDisclosure,policyKey}'='EDUCATION_SELF_GROUP_V2'
        AND ${r}.entry#>>'{cohortAnalysisPolicy,policyKey}'='EDUCATION_SELF_GROUP_V2'
        AND ${r}.entry#>>'{cohortAnalysisPolicy,policyVersion}'='2.0.0'))
  AND ${r}.entry->'privateOrigin'->>'kind'='AUTHOR_PRIVATE'
  AND ${r}.entry->'privateOrigin'->>'entry'=${input.product}
  AND ${r}.entry->'privateOrigin'->>'organizationId'=${input.organizationId}
  AND ${r}.resource_key='private-scale:'||${input.product}||':'||(${r}.entry->'privateOrigin'->>'versionId')||':'||(${r}.entry->'privateOrigin'->>'variantKey')
   ||CASE WHEN ${r}.resource_version='2.0.0' THEN ':GROUP:'||education_composition_binding_hash(${r}.entry#>'{privateOrigin,groupReporting}') ELSE '' END
  AND ${r}.entry->'privateOrigin'->>'variantKey' IN (${Prisma.join(input.product==='SCHOOL'?['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT']:['TEACHER:SELF'])})
  AND EXISTS(SELECT 1 FROM education_private_tool_versions private_version
   JOIN scales private_scale ON private_scale.id=${r}.scale_id
   JOIN measurement_content_releases private_release ON private_release.id=private_scale.measurement_release_id
   WHERE private_version.id=${r}.entry->'privateOrigin'->>'versionId'
    AND private_version.entry=${input.product} AND private_version.kind='SCALE'
    AND private_version.organization_id=${input.organizationId}
    AND private_version.owner_user_id=${r}.entry->'privateOrigin'->>'ownerUserId'
    AND private_version.tool_id=${r}.entry->'privateOrigin'->>'toolId'
    AND private_version.content_hash=${r}.entry->'privateOrigin'->>'contentHash'
    AND private_scale.code='education-private-scale:'||private_version.id
    AND private_scale.creator_id=private_version.owner_user_id AND private_scale.library_entry_id IS NULL
    AND private_scale.definition_hash=${r}.definition_hash
    AND private_scale.definition_hash=${r}.entry->'privateOrigin'->>'definitionHash'
    AND private_release.id=${r}.entry->'privateOrigin'->>'releaseId'
    AND private_release.content_hash=${r}.entry->'privateOrigin'->>'releaseHash')
 )`
}
