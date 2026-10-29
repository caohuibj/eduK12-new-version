import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {appendAudit} from '../organization/service'
import {createAssessmentRunDraft,addAssessmentRunTrackDraft} from '../assessment-run/repository'
import {lockEducationLibraryOrganization} from '../scale-library-governance/education-runtime-resources'
import {readPrivateCompositionRunSources} from '../education-tools/private-tool.composition-source'
import {lockCompositionLibraryUses,assertLockedLibraryUseTime} from '../education-tools/library-source.use'
import {privateToolFail} from '../education-tools/private-tool.contracts'
import {studentCompositionRef,studentCompositionRequestedPolicy} from './studentCompositionResource'

type Scope={actorUserId:string;organizationId:string;eventId:string}
type Appointment=Scope&{classUnitId:string;staffAssignmentId:string}
/** Same verified PERSON/class appointment as the legacy student Form. Library
 * issuer locks and the organization fence must precede this event lock. */
async function appointment(tx:Prisma.TransactionClient,input:Appointment){
 const rows=await tx.$queryRaw<Array<{eventTitle:string;teacherUserId:string;teacherMembershipId:string}>>(Prisma.sql`
  SELECT event.title AS "eventTitle",teacher.user_id AS "teacherUserId",teacher.id AS "teacherMembershipId"
  FROM huiteacher_evaluation_events event JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id
   AND target.kind='PERSON' AND target.status='ACTIVE'
  JOIN organization_staff_class_assignments staff ON staff.id=${input.staffAssignmentId} AND staff.organization_id=event.organization_id
   AND staff.class_unit_id=${input.classUnitId} AND staff.staff_role IN ('TEACHING','HOMEROOM') AND staff.valid_from<=statement_timestamp()
   AND (staff.valid_until IS NULL OR staff.valid_until>statement_timestamp())
  JOIN organization_memberships teacher ON teacher.id=staff.membership_id AND teacher.organization_id=staff.organization_id AND teacher.user_id=target.subject_user_id
   AND teacher.valid_from<=statement_timestamp() AND (teacher.valid_until IS NULL OR teacher.valid_until>statement_timestamp())
  JOIN organization_persona_grants persona ON persona.organization_id=teacher.organization_id AND persona.membership_id=teacher.id AND persona.persona='TEACHER' AND persona.revoked_at IS NULL
  JOIN organization_units unit ON unit.organization_id=event.organization_id AND unit.id=staff.class_unit_id AND unit.unit_kind='CLASS'
  WHERE event.organization_id=${input.organizationId} AND event.id=${input.eventId} AND event.kind='ASSESSMENT' AND event.status='DRAFT'
  FOR UPDATE OF event FOR SHARE OF target,staff,teacher`)
 if(rows.length!==1)privateToolFail('HUITEACHER_STUDENT_EVAL_TEACHER_CLASS_MISMATCH',403)
 return rows[0]
}
export async function configureStudentComposition(input:Appointment&{privateComposition:{versionId:string;contentHash:string}}){
 return prisma.$transaction(async tx=>{
  const context={entry:'TEACHER' as const,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL' as const}},ref=studentCompositionRef(input.privateComposition.versionId)
  const libraries=await lockCompositionLibraryUses(tx,context,[ref.key])
  await lockEducationLibraryOrganization(tx,input.organizationId,'TEACHER')
  // The source reader resolves current Teacher authorship once, after any org
  // fence wait. Governance revocation holds this same organization lock.
  const source=(await readPrivateCompositionRunSources(tx,context,[ref],{lockForUse:true,libraryUses:libraries})).get(ref.key)!
  if(source.origin.contentHash!==input.privateComposition.contentHash)privateToolFail('PRIVATE_COMPOSITION_VERSION_MISMATCH',409)
  const matched=await appointment(tx,input)
  const where={organizationId_eventId:{organizationId:input.organizationId,eventId:input.eventId}}
  if(await tx.huiteacherStudentEvaluationConfig.findUnique({where,select:{id:true}}))privateToolFail('HUITEACHER_STUDENT_EVAL_ALREADY_CONFIGURED',409)
  if(await tx.huiteacherEvaluationRunLink.findUnique({where,select:{runId:true}}))privateToolFail('HUITEACHER_STUDENT_EVAL_PREEXISTING_RUN_FORBIDDEN',403)
  const config=await tx.huiteacherStudentEvaluationConfig.create({data:{id:randomUUID(),organizationId:input.organizationId,eventId:input.eventId,
   classUnitId:input.classUnitId,staffAssignmentId:input.staffAssignmentId,formId:null,definitionDigest:null,
   compositionVersionId:source.origin.versionId,compositionContentHash:source.origin.contentHash,configuredByUserId:input.actorUserId}})
  await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:'HUITEACHER_STUDENT_EVALUATION_SCOPE_FROZEN',
   targetType:'EVALUATION_EVENT',targetId:input.eventId,domainEventId:randomUUID(),payload:{studentDataDomain:'HUITEACHER',classUnitId:input.classUnitId,
    staffAssignmentId:input.staffAssignmentId,privateComposition:input.privateComposition}})
  await assertLockedLibraryUseTime(tx,libraries)
  return {...config,teacherTargetUserId:matched.teacherUserId,privateComposition:input.privateComposition}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
export async function createStudentCompositionRun(tx:Prisma.TransactionClient,input:Scope&{intakeDeadline?:Date|null},config:{classUnitId:string;staffAssignmentId:string;compositionVersionId:string|null;compositionContentHash:string|null}){
 if(!config.compositionVersionId||!config.compositionContentHash)privateToolFail('HUITEACHER_STUDENT_COMPOSITION_REQUIRED',403)
 const context={entry:'TEACHER' as const,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL' as const}},ref=studentCompositionRef(config.compositionVersionId)
 const libraries=await lockCompositionLibraryUses(tx,context,[ref.key])
 await lockEducationLibraryOrganization(tx,input.organizationId,'TEACHER')
 const matched=await appointment(tx,{...input,...config})
 if(await tx.huiteacherEvaluationRunLink.findUnique({where:{organizationId_eventId:{organizationId:input.organizationId,eventId:input.eventId}},select:{runId:true}}))
  privateToolFail('HUITEACHER_STUDENT_EVAL_RUN_EXISTS',409)
 const run=await createAssessmentRunDraft({tx,organizationId:input.organizationId,createdByUserId:input.actorUserId,name:matched.eventTitle,intakeDeadline:input.intakeDeadline??null})
 await tx.huiteacherEvaluationRunLink.create({data:{organizationId:input.organizationId,eventId:input.eventId,runId:run.id,boundByUserId:input.actorUserId}})
 const selector={kind:'CLASS_UNITS',classUnitIds:[config.classUnitId]}
 await addAssessmentRunTrackDraft({tx,organizationId:input.organizationId,runId:run.id,actorUserId:input.actorUserId,expectedRunId:run.id,expectedVersion:run.version,
  educationWorkflow:{product:'TEACHER',id:input.eventId},privateComposition:{versionId:config.compositionVersionId,contentHash:config.compositionContentHash},
  privateCompositionLibraryLocks:{proof:libraries},resource:ref,subjectSelector:selector,respondentSelector:selector,requestedPolicy:studentCompositionRequestedPolicy(matched.teacherMembershipId)})
 await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:'HUITEACHER_STUDENT_EVAL_RUN_DRAFT',targetType:'EVALUATION_EVENT',targetId:input.eventId,
  domainEventId:randomUUID(),payload:{runId:run.id,classUnitId:config.classUnitId,privateComposition:{versionId:config.compositionVersionId,contentHash:config.compositionContentHash}}})
 return {runId:run.id,eventId:input.eventId,status:'DRAFT' as const,version:run.version+1,trackCount:1}
}
