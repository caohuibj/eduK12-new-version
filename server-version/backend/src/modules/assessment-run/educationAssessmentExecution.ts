import {issueVerifiedEducationStart} from './education-start-context'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readEducationAssessmentDeliveryIdentity,EducationAssessmentSourceError} from '../education-tools/assessment-resource.repository'
import {assertEducationDeliveryIssuerCurrent} from '../education-tools/assessment-resource.authority'
import {assertEducationAssessmentDistributionCurrent} from '../education-tools/assessment-resource.distribution'
import {relationalEntryToRunPolicy} from './resourceAuthority'

/** Caller already holds the execution envelope and has checked the actual
 * respondent/current product authority. This verifies the source binding, not
 * a manager permission and not a client-provided continuation flag.
 */
export async function assertEducationAssessmentExecutionSource(tx:Prisma.TransactionClient,input:{
 executionId:string;compositeId:string;purpose:'NEW_START'|'FROZEN'
}){
 function fail():never{throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_EXECUTION_BINDING')}
 const [row]=await tx.$queryRaw<Array<{organizationId:string;key:string;version:string;family:string;policy:unknown;policyHash:string;
  school:boolean;teacher:boolean;subjectRole:string;respondentRole:string;relationship:string;perspective:string;
  assignmentRef:string;subjectId:string;respondentId:string;binding:string|null;boundComposite:string|null;longitudinal:boolean;trackingEntry:string|null}>>(Prisma.sql`
  SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,t.resource_family AS family,
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",
   EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id) AS school,
   EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id) AS teacher,
   a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",a.relationship_kind AS relationship,a.perspective,
   a.id AS "assignmentRef",a.subject_user_id AS "subjectId",a.respondent_user_id AS "respondentId",e.runtime_binding_ref AS binding,
   parent.composite_assessment_id AS "boundComposite",run.personal_tracking->>'entry' AS "trackingEntry",
   (run.personal_tracking_baseline_id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(run.personal_tracking->'bindings','[]'::jsonb)) chosen WHERE chosen->>'trackId'=t.id)) AS longitudinal
  FROM assessment_run_executions e JOIN assessment_run_tracks t
   ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
  JOIN assessment_runs run ON run.id=e.run_id AND run.organization_id=e.organization_id
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
  LEFT JOIN composite_assessment_attempts parent ON e.runtime_binding_kind='COMPOSITE' AND parent.id=e.runtime_binding_ref
   AND parent.assignment_ref=a.id AND parent.subject_user_id=a.subject_user_id AND parent.respondent_user_id=a.respondent_user_id
  WHERE e.id=${input.executionId} AND t.resource_key LIKE 'education-assessment:%'`)
 if(!row||row.school===row.teacher||row.subjectId!==row.respondentId||row.relationship!=='SELF'||row.perspective!=='SELF_REPORT')fail()
 const product=row.teacher?'TEACHER':'SCHOOL',role=row.teacher?'TEACHER':'STUDENT'
 if(row.subjectRole!==role||row.respondentRole!==role||input.purpose==='NEW_START'&&row.binding!==null
  ||input.purpose==='FROZEN'&&(!row.binding||row.boundComposite!==input.compositeId))fail()
 const source=await readEducationAssessmentDeliveryIdentity(tx,{resourceKey:row.key,version:row.version,purpose:'HISTORY'})
 if(source.origin.organizationId!==row.organizationId||source.origin.product!==product||source.origin.family!==row.family
  ||source.runtime.id!==input.compositeId||canonicalHash(row.policy)!==row.policyHash
  ||canonicalHash(relationalEntryToRunPolicy(source.entry))!==row.policyHash)fail()
 if(input.purpose==='NEW_START'){
  // Source row is SHARE-locked by its reader. Parameter/report lifecycle can
  // become unavailable independently; never invent replacement references.
  const [current]=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM education_assessment_deliveries WHERE id=${source.origin.resourceId}`)
  if(current?.status!=='PUBLISHED'||source.origin.units.some(unit=>source.releases.get(unit.measurement.releaseId)?.status!=='PUBLISHED'))fail()
  for(const proof of source.authority)await assertEducationDeliveryIssuerCurrent(tx,{proof,organizationId:row.organizationId,product})
  await assertEducationAssessmentDistributionCurrent(tx,source.origin)
 }
 return {...source,startProof:input.purpose==='NEW_START'?issueVerifiedEducationStart({tx,product,compositeId:input.compositeId,assignmentRef:row.assignmentRef,respondentUserId:row.respondentId,longitudinal:row.longitudinal&&row.trackingEntry===product}):undefined}
}
