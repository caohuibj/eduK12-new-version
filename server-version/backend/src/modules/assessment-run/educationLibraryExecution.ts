import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { readEducationScaleExecutionSource } from './educationScaleExecutionSource'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { relationalEntryToRunPolicy, type RunResourcePolicy } from './resourceAuthority'

/** Called under the runtime transaction, after actual execution/current actor
 * authority. Content identity is not a participant library-use grant. */
export async function assertEducationLibraryExecutionSource(tx: Prisma.TransactionClient, input: {
  executionId: string; compositeId: string;
}) {
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
    resourceKey:row.key,resourceVersion:row.version,purpose:'EXISTING_EXECUTION'})
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
}
