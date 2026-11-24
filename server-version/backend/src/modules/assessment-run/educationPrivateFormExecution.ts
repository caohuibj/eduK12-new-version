import {createRelationalRuntimeConsentAuthority} from '../assessment-relational/runtime-consent'
import {createSqlRelationalAssignmentRepository} from '../assessment-relational/repository'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readPrivateFormRuntimeResource} from '../education-tools/private-tool.form-runtime-resources'
import {matchesEducationCompositionRespondent} from '../education-tools/private-tool.composition-contracts'
import {relationalEntryToRunPolicy,type RunResourcePolicy} from './resourceAuthority'
import {lockExecutionEnvelope,type ExecutionLockRow,type RunExecutionLockIdentity} from './startClaim'
import {assertCurrentRunStartAuthority,type StartAuthorityKnownEnvelope} from './startAuthority'
import type {RunPopulationProductScope} from './currentPopulationAuthority'
import {readCompositionExecutionSource,assertCompositionCollection,type FrozenCompositionIdentity} from './educationCompositionExecution'

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
export type KnownPrivateFormFinalParent = {
 id:string
 userId:string|null
 subjectUserId:string|null
 respondentUserId:string|null
 assignmentRef:string|null
 consentId:string|null
 compositeAssessmentId:string
 compositeAssessment:{creationKey:string|null}
}

export type KnownPrivateFormExecutionIdentity = RunExecutionLockIdentity & {
 executionId:string
}

function knownEnvelopeFromLockRow(row:Partial<ExecutionLockRow>|undefined):StartAuthorityKnownEnvelope|undefined{
 if(!row||!row.executionId||!row.organizationId||!row.runId||!row.trackId||!row.executionStatus
  ||!row.orgStatus||!row.orgProductDomain||!row.subjectActorSnapshotId||!row.respondentActorSnapshotId
  ||!row.subjectUserId||!row.subjectRole||!row.subjectProvenance||!row.respondentUserId
  ||!row.respondentRole||!row.respondentProvenance||!row.relationshipKind
  ||!row.trackResourceFamily||!row.trackResourceKey||!row.trackResourceVersion){
  return undefined
 }
 return {
  executionId:row.executionId,
  organizationId:row.organizationId,
  runId:row.runId,
  trackId:row.trackId,
  executionStatus:row.executionStatus,
  orgStatus:row.orgStatus,
  orgProductDomain:row.orgProductDomain,
  subjectActorSnapshotId:row.subjectActorSnapshotId,
  respondentActorSnapshotId:row.respondentActorSnapshotId,
  subjectUserId:row.subjectUserId,
  subjectRole:row.subjectRole,
  subjectProvenance:row.subjectProvenance,
  subjectMembershipId:row.subjectMembershipId??null,
  subjectPersonaGrantId:row.subjectPersonaGrantId??null,
  respondentUserId:row.respondentUserId,
  respondentRole:row.respondentRole,
  respondentProvenance:row.respondentProvenance,
  respondentMembershipId:row.respondentMembershipId??null,
  respondentPersonaGrantId:row.respondentPersonaGrantId??null,
  relationshipKind:row.relationshipKind,
  relationshipRef:row.relationshipRef??null,
  relationshipCourseId:row.relationshipCourseId??null,
  relationshipStudentClassAssignmentId:row.relationshipStudentClassAssignmentId??null,
  relationshipStaffClassAssignmentId:row.relationshipStaffClassAssignmentId??null,
  relationshipClassUnitId:row.relationshipClassUnitId??null,
  trackResourceFamily:row.trackResourceFamily,
  trackResourceKey:row.trackResourceKey,
  trackResourceVersion:row.trackResourceVersion,
  intakeDeadline:row.intakeDeadline??null,
  hasCampusActivity:row.hasCampusActivity,
  hasHuiteacherLink:row.hasHuiteacherLink,
 }
}

function productScopeFromLockRow(row:Partial<ExecutionLockRow>|undefined):RunPopulationProductScope|undefined{
 if(!row?.executionId)return undefined
 if(row.hasCampusActivity===true&&row.hasHuiteacherLink===false)return 'CAMPUS_ONLY'
 if(row.hasHuiteacherLink===true&&row.hasCampusActivity===false)return 'HUITEACHER_ONLY'
 return 'ALL'
}

export async function assertPrivateFormFinalCurrent(tx:Prisma.TransactionClient,input:{
 attemptId:string
 actorUserId:string|null|undefined
 knownParent?:KnownPrivateFormFinalParent
 knownExecution?:KnownPrivateFormExecutionIdentity
 knownCompositionIdentity?:FrozenCompositionIdentity
}){
 const parent=input.knownParent&&input.knownParent.id===input.attemptId
  ?input.knownParent
  :await tx.compositeAssessmentAttempt.findUnique({where:{id:input.attemptId},select:{id:true,userId:true,subjectUserId:true,respondentUserId:true,assignmentRef:true,consentId:true,compositeAssessmentId:true,
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
 let executionId=input.knownExecution?.executionId
 if(!executionId){
  const [execution]=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE relational_assignment_id=${parent.assignmentRef}`
  if(!execution)fail()
  executionId=execution.id
 }
 const locked=(input.knownExecution
  ?await lockExecutionEnvelope(tx,executionId,input.knownExecution)
  :await lockExecutionEnvelope(tx,executionId)) as Partial<ExecutionLockRow>|undefined
 const id=input.knownCompositionIdentity
 const assignmentRow=locked?.assignmentRow
 const canUseLockedComposition=Boolean(
  composition&&id&&locked?.executionId&&assignmentRow&&locked.policyDomain==='ORGANIZATION_RUN'
  &&locked.runStatus&&['PUBLISHED','CLOSED'].includes(locked.runStatus)
  &&locked.executionStatus&&['ASSIGNED','STARTED','COMPLETED'].includes(locked.executionStatus)
  &&['OPEN','STARTED','COMPLETED'].includes(assignmentRow.status)
  &&locked.respondentUserId===input.actorUserId
  &&locked.runtimeBindingKind==='COMPOSITE'&&locked.runtimeBindingRef===parent.id
  &&locked.relationalAssignmentId===parent.assignmentRef
  &&parent.userId===locked.respondentUserId&&parent.subjectUserId===locked.subjectUserId&&parent.respondentUserId===locked.respondentUserId
  &&locked.trackResourceFamily==='BUNDLE'&&locked.trackResourceKey===id.policy.key
  &&locked.trackResourceVersion===id.policy.version&&locked.trackResourcePolicyHash===id.policyHash
  &&locked.organizationId===id.origin.organizationId&&id.compositeId===parent.compositeAssessmentId
  &&locked.hasCampusActivity!==locked.hasHuiteacherLink
  &&id.origin.entry===(locked.hasCampusActivity?'SCHOOL':'TEACHER')
  &&assignmentRow.analysisMode==='INDIVIDUAL_ONLY'
  &&locked.subjectRole===(locked.hasCampusActivity?'STUDENT':'TEACHER')
  &&(locked.hasCampusActivity||(locked.respondentRole==='TEACHER'))
  &&matchesEducationCompositionRespondent(id.origin,{
   subjectUserId:assignmentRow.subjectUserId,respondentUserId:assignmentRow.respondentUserId,
   subjectRole:assignmentRow.subjectRole,respondentRole:assignmentRow.respondentRole,
   relationshipKind:assignmentRow.relationshipKind,perspective:assignmentRow.perspective,
  })
 )
 const lockedExecutionId=locked?.executionId??executionId
 if(canUseLockedComposition&&id){
  await assertCompositionCollection(tx,id,'BOUND_COLLECTION',true,undefined,id)
 }else if(composition){
  const source=await readCompositionExecutionSource(tx,{executionId:lockedExecutionId,parentAttemptId:parent.id,actorUserId:input.actorUserId,compositeId:parent.compositeAssessmentId})
  await assertCompositionCollection(tx,source.identity,'BOUND_COLLECTION',true)
 }else await readPrivateFormExecutionSource(tx,{executionId:lockedExecutionId,parentAttemptId:parent.id,actorUserId:input.actorUserId,compositeId:parent.compositeAssessmentId})
 const knownEnvelope=knownEnvelopeFromLockRow(locked)
 const productScope=productScopeFromLockRow(locked)
 await assertCurrentRunStartAuthority(tx,lockedExecutionId,{
  accountMode:'DETECT_EDUCATION_LIBRARY',
  operation:'BOUND_FINAL',
  ...(knownEnvelope?{knownEnvelope}:{}),
  ...(productScope?{productScope}:{}),
 })
 const preloadedConsent=locked?.executionId&&parent.consentId!==undefined
  ?{id:parent.id,userId:parent.userId,assignmentRef:parent.assignmentRef,consentId:parent.consentId}
  :undefined
 const preloadedAssignment=assignmentRow&&assignmentRow.id===parent.assignmentRef
  ?{...assignmentRow,assignmentId:assignmentRow.id}
  :undefined
 const consentAuthority=createRelationalRuntimeConsentAuthority({db:tx as any,assignments:createSqlRelationalAssignmentRepository(tx as any)})
 if(preloadedConsent!==undefined){
  await consentAuthority.assertCompositeFinal(input.attemptId,input.actorUserId,preloadedConsent,preloadedAssignment)
 }else{
  await consentAuthority.assertCompositeFinal(input.attemptId,input.actorUserId)
 }
}

/** Exact section ownership before ensureCompositeSectionAttempt can create any
 * child. Parent/source validation remains in admission and the FINAL tx. */
export async function assertPrivateFormSectionOwnership(parentId:string,sectionId:string){
 const found=await prisma.compositeFormSection.findFirst({where:{id:sectionId,compositeAssessment:{attempts:{some:{id:parentId}}}},select:{id:true}})
 if(!found)throw new PrivateFormExecutionError('PRIVATE_FORM_SECTION_NOT_FOUND',404)
}
