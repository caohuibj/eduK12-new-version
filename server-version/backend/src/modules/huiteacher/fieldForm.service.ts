import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {appendAudit} from '../organization/service'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {fieldAssessmentRefSchema} from './fieldComposition.contract'
import {bindFieldComposition,readManagerFieldComposition,readInvitedFieldComposition} from './fieldComposition.service'
import {readCanonicalFieldEvidence} from './fieldComposition.evidence'
import {FieldCompositionError} from './fieldComposition.authority'

export {FieldCompositionError as HuiteacherFieldFormError}
export async function bindHuiteacherFieldForm(input:{actorUserId:string;organizationId:string;eventId:string;formId?:string;privateComposition?:{versionId:string;contentHash:string}}){
 if(!input.privateComposition||input.formId)throw new FieldCompositionError('HUITEACHER_FIELD_FIXED_QUESTIONNAIRE_REQUIRED',400)
 return bindFieldComposition({...input,privateComposition:input.privateComposition})
}
/** Old test rows without the new immutable reference are unconfigured. Their
 * columns/data stay in place; no alternate form-only execution protocol runs. */
export async function readBoundHuiteacherFieldForm(tx:Prisma.TransactionClient,input:{organizationId:string;eventId:string}){
 const binding=await tx.huiteacherFieldEventForm.findUnique({where:{organizationId_eventId:input}})
 if(!binding?.assessmentRef)return null
 const ref=fieldAssessmentRefSchema.parse(binding.assessmentRef)
 if(ref.origin.organizationId!==input.organizationId)throw new FieldCompositionError('HUITEACHER_FIELD_SOURCE_INTEGRITY',409)
 return {assessmentRef:ref}
}
export const readManagerHuiteacherFieldForm=readManagerFieldComposition
export const readInvitedHuiteacherFieldForm=readInvitedFieldComposition

/** Submitted professional evidence retains its audited administrative purpose.
 * It does not become a teacher's personal report or a private reflection export. */
export async function readSubmittedHuiteacherFieldFormEvidence(input:{actorUserId:string;organizationId:string;eventId:string;recordId:string}){
 return prisma.$transaction(async tx=>{
  const access=await resolveEducationProductMemberScope({...input,product:'HUITEACHER'},tx)
  if(!access?.productAdmin)throw new FieldCompositionError('HUITEACHER_FIELD_EVIDENCE_MANAGER_REQUIRED')
  const rows=await tx.$queryRaw<Array<{recordId:string;organizationId:string;eventId:string;attemptId:string|null;attemptEpoch:number|null;finalHash:string|null;answersCipher:string;answersHash:string}>>(Prisma.sql`
   SELECT note.id AS "recordId",note.organization_id AS "organizationId",note.event_id AS "eventId",evidence.attempt_id AS "attemptId",evidence.attempt_epoch AS "attemptEpoch",
    evidence.final_hash AS "finalHash",evidence.answers_cipher AS "answersCipher",evidence.answers_hash AS "answersHash"
   FROM huiteacher_observation_records note JOIN huiteacher_field_form_evidence evidence ON evidence.record_id=note.id
    AND evidence.organization_id=note.organization_id AND evidence.event_id=note.event_id
   JOIN huiteacher_evaluation_events event ON event.id=note.event_id AND event.organization_id=note.organization_id AND event.status IN ('OPEN','CLOSED')
   JOIN organizations org ON org.id=event.organization_id AND org.status='ACTIVE' AND org.product_domain='SCHOOL'
   JOIN education_product_entitlements product ON product.organization_id=org.id AND product.product='HUITEACHER' AND product.status='ACTIVE'
   WHERE note.id=${input.recordId} AND note.organization_id=${input.organizationId} AND note.event_id=${input.eventId}
    AND note.kind='FORMAL_FEEDBACK' AND note.status='SUBMITTED' AND evidence.attempt_id IS NOT NULL FOR SHARE OF note,evidence,event,product`)
  if(rows.length!==1)throw new FieldCompositionError('HUITEACHER_FIELD_EVIDENCE_NOT_FOUND',404)
  const result=await readCanonicalFieldEvidence(tx,rows[0])
  await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:'HUITEACHER_FIELD_CANONICAL_EVIDENCE_READ',targetType:'EVALUATION_EVENT',targetId:input.eventId,
   domainEventId:randomUUID(),payload:{recordId:input.recordId,attemptId:result.attemptId,attemptEpoch:result.attemptEpoch,finalHash:result.finalHash}})
  return result
 })
}
