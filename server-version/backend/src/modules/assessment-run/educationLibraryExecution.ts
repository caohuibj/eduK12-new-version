import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { readEducationScaleExecutionSource } from './educationScaleExecutionSource'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { relationalEntryToRunPolicy, type RunResourcePolicy } from './resourceAuthority'

/** Called under the runtime transaction, after actual execution/current actor
 * authority. Content identity is not a participant library-use grant. */
async function readBoundEducationSource(tx: Prisma.TransactionClient, input: {
  executionId: string; compositeId: string;
}, purpose: 'EXISTING_EXECUTION'|'HISTORY') {
  const rows = await tx.$queryRaw<Array<{key:string;version:string;policy:RunResourcePolicy;policyHash:string;
    organizationId:string;school:boolean;teacher:boolean;subjectRole:string;respondentRole:string;relationship:string}>>(Prisma.sql`
    SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",
      EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id) AS school,
      EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id) AS teacher,
      a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",a.relationship_kind AS relationship
    FROM assessment_run_executions e JOIN assessment_run_tracks t
      ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
      AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
    WHERE e.id=${input.executionId} AND t.resource_family='SCALE' AND (t.resource_key LIKE 'library-scale:%' OR t.resource_key LIKE 'private-scale:%')
  `)
  const row=rows[0]
  if(!row || row.school===row.teacher) throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_EXECUTION_CONTEXT_MISMATCH')
  const source=await readEducationScaleExecutionSource(tx,{organizationId:row.organizationId,product:row.school?'SCHOOL':'TEACHER',
    resourceKey:row.key,resourceVersion:row.version,purpose})
  const policy=row.policy, applicability=source.resourceEntry.applicability
  const sourcePolicy=relationalEntryToRunPolicy(source.resourceEntry)
  if(source.compositeId!==input.compositeId || !policy || canonicalHash(policy)!==row.policyHash
    || policy.family!=='SCALE' || policy.key!==row.key || policy.version!==row.version
    || policy.applicabilityHash!==sourcePolicy.applicabilityHash
    || policy.runtimeLaunchTarget?.kind!=='COMPOSITE' || policy.runtimeLaunchTarget.ref!==source.compositeId
    || !applicability.subjectRoles.some(role=>role===row.subjectRole)
    || !applicability.respondentRoles.some(role=>role===row.respondentRole)
    || !applicability.relationshipKinds.some(kind=>kind===row.relationship)) {
    throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_EXECUTION_BINDING_MISMATCH')
  }
  return source
}

export async function assertEducationLibraryExecutionSource(tx: Prisma.TransactionClient, input: {
 executionId:string;compositeId:string;
}) {
 await readBoundEducationSource(tx,input,'EXISTING_EXECUTION')
}

/** Already materialized exact education resources keep their frozen completion
 * contract, like exact STANDARD Training sources. This is not new admission or
 * actor authorization. Only the persisted Run/assignment/current child binding
 * can qualify; callers cannot opt in with an entry or skip-stop flag. */
export type PreparedEducationFrozenScaleEvidence={
 executionId:string
 compositeId:string
 scaleId:string
 itemId:string
 key:string
 version:string
 policyHash:string
}

/** Request-local HISTORY source read for education frozen scale completion.
 * The UNIT-gated path still FOR SHARE locks the parent/execution/child and
 * rechecks key/version/policyHash before skipping readBoundEducationSource. */
export async function prepareEducationFrozenScaleEvidence(parentId:string,scaleIds:readonly string[],itemIds:readonly string[],db:Prisma.TransactionClient|typeof prisma=prisma):Promise<PreparedEducationFrozenScaleEvidence[]>{
 if(!itemIds.length)return []
 const rows=await db.$queryRaw<Array<{executionId:string;compositeId:string;scaleId:string;itemId:string}>>(Prisma.sql`
  SELECT e.id AS "executionId",p.composite_assessment_id AS "compositeId",c.scale_id AS "scaleId",c.composite_item_id AS "itemId"
  FROM composite_assessment_attempts p
  JOIN composite_assessments definition ON definition.id=p.composite_assessment_id AND definition.product_kind='ORGANIZATION_RESOURCE'
  JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=p.id
   AND e.relational_assignment_id=p.assignment_ref AND e.status='STARTED' AND e.started_at IS NOT NULL
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
   AND t.resource_family='SCALE' AND (t.resource_key LIKE 'library-scale:%' OR t.resource_key LIKE 'private-scale:%')
  JOIN assessments c ON c.composite_attempt_id=p.id AND c.attempt_epoch=p.attempt_epoch
  WHERE p.id=${parentId} AND p.status='IN_PROGRESS' AND p.delivery_mode='FINAL_ONLY'
   AND c.delivery_mode='FINAL_ONLY' AND c.runtime_generation='UNIFIED_V1'
   AND c.status='IN_PROGRESS' AND c.runtime_snapshot_encrypted IS NOT NULL
   AND c.scale_id=ANY(${[...scaleIds]}::text[]) AND c.composite_item_id=ANY(${[...itemIds]}::text[])
 `)
 const prepared:PreparedEducationFrozenScaleEvidence[]=[]
 for(const row of rows){
  const source=await readBoundEducationSource(db,{executionId:row.executionId,compositeId:row.compositeId},'HISTORY')
  if(source.scaleId!==row.scaleId||source.compositeItemId!==row.itemId)
   throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_COMPLETION_BINDING_MISMATCH')
  const [track]=await db.$queryRaw<Array<{key:string;version:string;policyHash:string}>>(Prisma.sql`
   SELECT t.resource_key AS key,t.resource_version AS version,t.resource_policy_hash AS "policyHash"
   FROM assessment_run_executions e JOIN assessment_run_tracks t
    ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
   WHERE e.id=${row.executionId}`)
  if(!track) throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_COMPLETION_BINDING_MISMATCH')
  prepared.push({executionId:row.executionId,compositeId:row.compositeId,scaleId:row.scaleId,itemId:row.itemId,
   key:track.key,version:track.version,policyHash:track.policyHash})
 }
 return prepared
}

export async function educationFrozenScaleCompletionIds(tx:Prisma.TransactionClient,parentId:string,scaleIds:readonly string[],itemIds:readonly string[],prepared?:PreparedEducationFrozenScaleEvidence[]|null){
 if(!itemIds.length)return new Set<string>()
 const rows=await tx.$queryRaw<Array<{executionId:string;compositeId:string;scaleId:string;itemId:string}>>(Prisma.sql`
  SELECT e.id AS "executionId",p.composite_assessment_id AS "compositeId",c.scale_id AS "scaleId",c.composite_item_id AS "itemId"
  FROM composite_assessment_attempts p
  JOIN composite_assessments definition ON definition.id=p.composite_assessment_id AND definition.product_kind='ORGANIZATION_RESOURCE'
  JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=p.id
   AND e.relational_assignment_id=p.assignment_ref AND e.status='STARTED' AND e.started_at IS NOT NULL
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
   AND t.resource_family='SCALE' AND (t.resource_key LIKE 'library-scale:%' OR t.resource_key LIKE 'private-scale:%')
  JOIN assessments c ON c.composite_attempt_id=p.id AND c.attempt_epoch=p.attempt_epoch
  WHERE p.id=${parentId} AND p.status='IN_PROGRESS' AND p.delivery_mode='FINAL_ONLY'
   AND c.delivery_mode='FINAL_ONLY' AND c.runtime_generation='UNIFIED_V1'
   AND c.status='IN_PROGRESS' AND c.runtime_snapshot_encrypted IS NOT NULL
   AND c.scale_id=ANY(${[...scaleIds]}::text[]) AND c.composite_item_id=ANY(${[...itemIds]}::text[])
  FOR SHARE OF p,e,c
 `)
 const ids=new Set<string>()
 for(const row of rows){
  const match=prepared?.find(item=>item.executionId===row.executionId&&item.compositeId===row.compositeId&&item.scaleId===row.scaleId&&item.itemId===row.itemId)
  if(match){
   const [locked]=await tx.$queryRaw<Array<{key:string;version:string;policyHash:string}>>(Prisma.sql`
    SELECT t.resource_key AS key,t.resource_version AS version,t.resource_policy_hash AS "policyHash"
    FROM assessment_run_executions e JOIN assessment_run_tracks t
     ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
    WHERE e.id=${row.executionId}`)
   if(!locked||locked.key!==match.key||locked.version!==match.version||locked.policyHash!==match.policyHash)
    throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_COMPLETION_BINDING_MISMATCH')
   ids.add(row.scaleId)
   continue
  }
  // HISTORY here reads immutable identity only. Completion eligibility comes
  // from the locked persisted execution above, not from this read purpose.
  const source=await readBoundEducationSource(tx,{executionId:row.executionId,compositeId:row.compositeId},'HISTORY')
  if(source.scaleId!==row.scaleId||source.compositeItemId!==row.itemId)
   throw new ScaleLibraryError(409,'EDUCATION_LIBRARY_COMPLETION_BINDING_MISMATCH')
  ids.add(row.scaleId)
 }
 return ids
}
