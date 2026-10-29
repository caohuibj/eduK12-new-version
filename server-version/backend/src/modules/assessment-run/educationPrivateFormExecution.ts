import {createRelationalRuntimeConsentAuthority} from '../assessment-relational/runtime-consent'
import {createSqlRelationalAssignmentRepository} from '../assessment-relational/repository'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readPrivateFormRuntimeResource} from '../education-tools/private-tool.form-runtime-resources'
import {relationalEntryToRunPolicy,type RunResourcePolicy} from './resourceAuthority'
import {lockExecutionEnvelope} from './startClaim'
import {assertCurrentRunStartAuthority} from './startAuthority'
import {readCompositionExecutionSource,assertCompositionCollection} from './educationCompositionExecution'

export class PrivateFormExecutionError extends Error {
 constructor(public readonly code:string,public readonly statusCode=409){super('私有表单的任务或固定版本不匹配');this.name='PrivateFormExecutionError'}
}
function fail(code='PRIVATE_FORM_EXECUTION_BINDING_INVALID'):never{throw new PrivateFormExecutionError(code)}
/** This source is obtained from actual Run rows, never request-supplied origin,
 * author capabilities, a legacy Form license, or the generic resource registry. */
export async function readPrivateFormExecutionSource(tx:Prisma.TransactionClient,input:{
 executionId?:string;assignmentRef?:string;compositeId?:string;actorUserId?:string;parentAttemptId?:string;
}){
 const [row]=await tx.$queryRaw<Array<{executionId:string;organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;
  school:boolean;teacher:boolean;assignmentRef:string;assignmentStatus:string;respondentUserId:string;subjectUserId:string;subjectRole:string;respondentRole:string;relationship:string;
  bindingKind:string|null;bindingRef:string|null;runStatus:string;executionStatus:string}>>(Prisma.sql`
  SELECT e.id AS "executionId",e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",
   EXISTS(SELECT 1 FROM campus_activity_runs s WHERE s.organization_id=e.organization_id AND s.run_id=e.run_id) AS school,
   EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id) AS teacher,
   a.id AS "assignmentRef",a.status AS "assignmentStatus",a.respondent_user_id AS "respondentUserId",a.subject_user_id AS "subjectUserId",
   a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",a.relationship_kind AS relationship,
   e.runtime_binding_kind AS "bindingKind",e.runtime_binding_ref AS "bindingRef",e.status AS "executionStatus",r.status AS "runStatus"
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
  WHERE ${input.executionId?Prisma.sql`e.id=${input.executionId}`:Prisma.sql`a.id=${input.assignmentRef??''}`}
   AND t.resource_family='FORM' AND t.resource_key LIKE 'private-form:%'`)
 if(!row||row.version!=='1.0.0'||row.school===row.teacher||['REVOKED','EXPIRED'].includes(row.assignmentStatus)
  ||(input.actorUserId!==undefined&&row.respondentUserId!==input.actorUserId))fail()
 if(!['PUBLISHED','CLOSED'].includes(row.runStatus)||!['ASSIGNED','STARTED','COMPLETED'].includes(row.executionStatus))fail('PRIVATE_FORM_TASK_NOT_COLLECTABLE')
 const source=await readPrivateFormRuntimeResource(tx,{key:row.key,version:'1.0.0',purpose:'EXISTING_EXECUTION'})
 const expected=relationalEntryToRunPolicy(source.resourceEntry),a=source.resourceEntry.applicability
 if(source.origin.organizationId!==row.organizationId||source.origin.entry!==(row.school?'SCHOOL':'TEACHER')
  ||(input.compositeId!==undefined&&source.compositeId!==input.compositeId)
  ||canonicalHash(row.policy)!==row.policyHash||canonicalHash(expected)!==row.policyHash
  ||!a.subjectRoles.some(x=>x===row.subjectRole)||!a.respondentRoles.some(x=>x===row.respondentRole)
  ||!a.relationshipKinds.some(x=>x===row.relationship))fail()
 if(input.parentAttemptId!==undefined){
  const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:input.parentAttemptId},select:{id:true,userId:true,compositeAssessmentId:true,assignmentRef:true,subjectUserId:true}})
  if(row.bindingKind!=='COMPOSITE'||row.bindingRef!==input.parentAttemptId||!parent
   ||parent.userId!==row.respondentUserId||parent.subjectUserId!==row.subjectUserId
   ||parent.compositeAssessmentId!==source.compositeId||parent.assignmentRef!==row.assignmentRef)fail()
 }
 return {...source,...row}
}
/** Permits only this exact private Form V3 parent. Does not relax the ordinary
 * Questionnaire or arbitrary relational V3 gate. */
export async function assertPrivateFormParentSource(parentId:string,db:Prisma.TransactionClient=prisma){
 const parent=await db.compositeAssessmentAttempt.findUnique({where:{id:parentId},select:{id:true,userId:true,assignmentRef:true,compositeAssessmentId:true,
  compositeAssessment:{select:{creationKey:true,productKind:true}}}})
 const composition=parent?.compositeAssessment.creationKey?.startsWith('education-composition:')
 if(parent?.compositeAssessment.creationKey?.endsWith(':TEACHER:EXPERT_REPORT:2.0.0')){
  const {currentFieldComposition}=await import('../huiteacher/fieldComposition.authority')
  if(!parent.userId)fail()
  return currentFieldComposition(db,{attemptId:parent.id,actorUserId:parent.userId})
 }
 if(!parent||parent.compositeAssessment.productKind!=='ORGANIZATION_RESOURCE'||!(composition||parent.compositeAssessment.creationKey?.startsWith('private-form:'))
  ||!parent.assignmentRef||!parent.userId)fail()
 if(composition)return readCompositionExecutionSource(db,{assignmentRef:parent.assignmentRef,parentAttemptId:parent.id,actorUserId:parent.userId,compositeId:parent.compositeAssessmentId})
 return readPrivateFormExecutionSource(db,{assignmentRef:parent.assignmentRef,parentAttemptId:parent.id,actorUserId:parent.userId,compositeId:parent.compositeAssessmentId})
}
/** Called BEFORE parent/section locks in the actual FINAL transaction. It uses
 * existing org -> Run -> execution fences and server-verified query-time account
 * checks; it never takes a user SHARE after org or consults author privileges. */
export async function assertPrivateFormFinalCurrent(tx:Prisma.TransactionClient,input:{attemptId:string;actorUserId:string|null|undefined}){
 const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:input.attemptId},select:{id:true,userId:true,assignmentRef:true,compositeAssessmentId:true,
  compositeAssessment:{select:{creationKey:true}}}})
 if(!parent)return
 if(parent.compositeAssessment.creationKey?.endsWith(':TEACHER:EXPERT_REPORT:2.0.0')){
  const {currentFieldComposition}=await import('../huiteacher/fieldComposition.authority')
  if(!input.actorUserId)fail()
  await currentFieldComposition(tx,{attemptId:parent.id,actorUserId:input.actorUserId,lock:true})
  return
 }
 const composition=parent?.compositeAssessment.creationKey?.startsWith('education-composition:')
 if(!composition&&!parent?.compositeAssessment.creationKey?.startsWith('private-form:'))return
 if(!input.actorUserId||parent.userId!==input.actorUserId||!parent.assignmentRef)fail()
 const [execution]=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE relational_assignment_id=${parent.assignmentRef}`
 if(!execution)fail()
 await lockExecutionEnvelope(tx,execution.id)
 if(composition){
  const source=await readCompositionExecutionSource(tx,{executionId:execution.id,parentAttemptId:parent.id,actorUserId:input.actorUserId,compositeId:parent.compositeAssessmentId})
  await assertCompositionCollection(tx,source.identity,'BOUND_COLLECTION')
 }else await readPrivateFormExecutionSource(tx,{executionId:execution.id,parentAttemptId:parent.id,actorUserId:input.actorUserId,compositeId:parent.compositeAssessmentId})
 await assertCurrentRunStartAuthority(tx,execution.id,{accountMode:'DETECT_EDUCATION_LIBRARY',operation:'BOUND_FINAL'})
 await createRelationalRuntimeConsentAuthority({db:tx as any,assignments:createSqlRelationalAssignmentRepository(tx as any)})
  .assertCompositeFinal(input.attemptId,input.actorUserId)
}

/** Exact section ownership before ensureCompositeSectionAttempt can create any
 * child. Parent/source validation remains in admission and the FINAL tx. */
export async function assertPrivateFormSectionOwnership(parentId:string,sectionId:string){
 const found=await prisma.compositeFormSection.findFirst({where:{id:sectionId,compositeAssessment:{attempts:{some:{id:parentId}}}},select:{id:true}})
 if(!found)throw new PrivateFormExecutionError('PRIVATE_FORM_SECTION_NOT_FOUND',404)
}
