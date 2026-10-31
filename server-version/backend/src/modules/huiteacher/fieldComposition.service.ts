import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {lockEducationLibraryOrganization} from '../scale-library-governance/education-runtime-resources'
import {assertCompositionCollection} from '../assessment-run/educationCompositionExecution'
import {startFieldCompositeAttemptInTransaction} from '../composite/composite.service'
import {appendAudit} from '../organization/service'
import {fieldAssessmentRefSchema,fieldParticipantKey,issueVerifiedFieldStart} from './fieldComposition.contract'
import {readFieldCompositionSource,currentFieldComposition,fieldFail} from './fieldComposition.authority'
import {lockCompositionLibraryUses,assertLockedLibraryUseTime} from '../education-tools/library-source.use'

type Scope={actorUserId:string;organizationId:string;eventId:string}
export async function bindFieldComposition(input:Scope&{privateComposition:{versionId:string;contentHash:string}}){
 return prisma.$transaction(async tx=>{
  const fixed=await readFieldCompositionSource(tx,{...input,...input.privateComposition})
  const author={entry:'TEACHER' as const,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL' as const}}
  const libraryUses=await lockCompositionLibraryUses(tx,author,[fixed.ref.resourceKey])
  await lockEducationLibraryOrganization(tx,input.organizationId,'TEACHER')
  const targets=await tx.$queryRaw<Array<{kind:string;subjectUserId:string|null}>>(Prisma.sql`SELECT target.kind,target.subject_user_id AS "subjectUserId"
   FROM huiteacher_evaluation_events event JOIN huiteacher_evaluation_targets target ON target.id=event.target_id AND target.organization_id=event.organization_id AND target.status='ACTIVE'
   WHERE event.organization_id=${input.organizationId} AND event.id=${input.eventId} AND event.status='DRAFT'
    AND event.kind IN ('CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT')
    AND (target.kind<>'PERSON' AND target.subject_user_id IS NULL OR target.kind='PERSON' AND EXISTS(
     SELECT 1 FROM organization_memberships m JOIN organization_persona_grants p ON p.membership_id=m.id AND p.organization_id=m.organization_id AND p.persona='TEACHER' AND p.revoked_at IS NULL
     JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL' AND u.teacher_approved AND u.role IN ('TEACHER','ADMIN') AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
     WHERE m.organization_id=event.organization_id AND m.user_id=target.subject_user_id AND m.valid_from<=clock_timestamp() AND (m.valid_until IS NULL OR m.valid_until>clock_timestamp())))
   FOR UPDATE OF event FOR SHARE OF target`)
  if(targets.length!==1||targets[0].kind!==fixed.ref.origin.targetKind)fieldFail('HUITEACHER_FIELD_EXPERT_TARGET_MISMATCH',409)
  const currentSource=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM composite_assessments WHERE id=${fixed.ref.compositeId} FOR UPDATE`)
  if(currentSource.length!==1||!['DRAFT','PUBLISHED'].includes(currentSource[0].status))fieldFail('HUITEACHER_FIELD_FIXED_SOURCE_UNAVAILABLE',409)
  // Check U/time after waiting for event/source locks. A second event may
  // already have published this same immutable source while we waited.
  await assertCompositionCollection(tx,{origin:fixed.ref.origin,manifest:fixed.manifest,units:fixed.units},'NEW_START',true,libraryUses)
  const where={organizationId_eventId:{organizationId:input.organizationId,eventId:input.eventId}}
  const old=await tx.huiteacherFieldEventForm.findUnique({where})
  if(old?.assessmentRef)fieldFail('HUITEACHER_FIELD_QUESTIONNAIRE_ALREADY_BOUND',409)
  if(currentSource[0].status==='DRAFT')await tx.compositeAssessment.update({where:{id:fixed.ref.compositeId},data:{status:'PUBLISHED',publishedAt:new Date(),revision:{increment:1}}})
  const data={assessmentRef:fixed.ref as unknown as Prisma.InputJsonValue,assignedByUserId:input.actorUserId}
  if(old)await tx.huiteacherFieldEventForm.update({where,data})
  else await tx.huiteacherFieldEventForm.create({data:{organizationId:input.organizationId,eventId:input.eventId,formId:null,definitionDigest:null,...data}})
  await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:'HUITEACHER_FIELD_QUESTIONNAIRE_FROZEN',targetType:'EVALUATION_EVENT',targetId:input.eventId,
   domainEventId:randomUUID(),payload:{assessmentRef:fixed.ref}})
  await assertLockedLibraryUseTime(tx,libraryUses)
  return {title:fixed.title,assessmentRef:fixed.ref}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
export async function readManagerFieldComposition(input:Scope){
 const access=await resolveEducationProductMemberScope({...input,product:'HUITEACHER'})
 if(!access?.productAdmin)fieldFail('HUITEACHER_FIELD_MANAGER_REQUIRED')
 const bound=await prisma.huiteacherFieldEventForm.findUnique({where:{organizationId_eventId:{organizationId:input.organizationId,eventId:input.eventId}}})
 if(!bound?.assessmentRef)return null
 const ref=fieldAssessmentRefSchema.parse(bound.assessmentRef)
 const runtime=await prisma.compositeAssessment.findUnique({where:{id:ref.compositeId},select:{name:true}})
 return {assessmentRef:ref,title:runtime?.name??'固定专家观察问卷'}
}
export async function readInvitedFieldComposition(input:{invitationId:string;actorUserId:string}){
 const current=await currentFieldComposition(prisma,{...input,allowUnconfigured:true})
 if(!current)return null
 const {scope,source,targetName}=current
 const attempt=await prisma.compositeAssessmentAttempt.findFirst({where:{compositeAssessmentId:scope.assessmentRef.compositeId,participantKey:fieldParticipantKey(scope)},orderBy:{attemptNo:'desc'},select:{id:true,status:true,attemptEpoch:true}})
 return {title:source.title,assessmentRef:scope.assessmentRef,targetName,attemptId:attempt?.id??null,status:attempt?.status??'ASSIGNED',attemptEpoch:attempt?.attemptEpoch??null}
}
export async function startInvitedFieldComposition(input:{invitationId:string;actorUserId:string}){
 return prisma.$transaction(async tx=>{
  // External issuer/User/U locks precede the organization/grant fence. This
  // bounded hint has no authority: current field scope is checked afterwards.
  // Entered attempts consume their own admission, without requesting new U.
  const hints=await tx.$queryRaw<Array<{organizationId:string;ownerUserId:string;key:string}>>(Prisma.sql`SELECT c.training_content_snapshot#>>'{educationBinding,origin,organizationId}' AS "organizationId",
   c.training_content_snapshot#>>'{educationBinding,origin,ownerUserId}' AS "ownerUserId",c.creation_key AS key
   FROM huiteacher_observer_grants g JOIN huiteacher_field_event_forms b ON b.organization_id=g.organization_id AND b.event_id=g.event_id
   JOIN huiteacher_evaluation_events event ON event.id=g.event_id AND event.organization_id=g.organization_id
   JOIN composite_assessments c ON c.id=b.assessment_ref->>'compositeId'
   WHERE g.id=${input.invitationId} AND g.observer_user_id=${input.actorUserId} AND g.status='ACCEPTED'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') leaf WHERE leaf->>'sourceProvider'='LIBRARY_SCALE')
    AND NOT EXISTS(SELECT 1 FROM composite_assessment_attempts p WHERE p.composite_assessment_id=c.id AND p.user_id=g.observer_user_id
     AND p.participant_key=huiteacher_field_participant_key(b.organization_id,event.id,event.target_id,g.id,g.accepted_at,b.assessment_ref))`)
  const hint=hints[0],libraryUses=hint?await lockCompositionLibraryUses(tx,{entry:'TEACHER',organizationId:hint.organizationId,principal:{userId:hint.ownerUserId,accountDomain:'SCHOOL'}},[hint.key]):undefined
  const current=await currentFieldComposition(tx,{...input,lock:true}),{scope,source}=current
  const proof=issueVerifiedFieldStart({...scope,tx})
  const {attempt,replayed}=await startFieldCompositeAttemptInTransaction(tx,{compositeId:scope.assessmentRef.compositeId,respondentUserId:input.actorUserId,proof,
   beforeCreate:()=>assertCompositionCollection(tx,{origin:source.ref.origin,manifest:source.manifest,units:source.units},'NEW_START',true,libraryUses)})
  if(!replayed)await assertLockedLibraryUseTime(tx,libraryUses)
  return {attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,status:attempt.status,replayed}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
