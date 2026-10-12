import {randomUUID} from 'node:crypto'
import {prisma} from '../../config/database'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {appendAudit} from '../organization/service'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'

export class HuiteacherFeedbackError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherFeedbackError'
  }
}
const deny=(code:string,status=409):never=>{throw new HuiteacherFeedbackError(code,status)}
const plain=(cipher:string,kind:'FORMAL_FEEDBACK'|'CONSENSUS')=>{
  const data=decryptUnifiedRuntimePayload<{
    schemaVersion:number;product:string;kind:string;content:string
  }>(cipher)
  const required=kind==='FORMAL_FEEDBACK'?'FIELD_NOTE':'FIELD_CONSENSUS'
  if(!data||data.schemaVersion!==1||data.product!=='HUITEACHER'
    ||data.kind!==required||typeof data.content!=='string')
    deny('HUITEACHER_RELEASE_PAYLOAD_INTEGRITY')
  return data.content
}
/** Human share is explicit and narrowly addressed to a verified PERSON
 * target, never a mass release of all evaluator notes or raw Survey data.
 */
export async function releaseHuiteacherFieldFeedback(input:{
  actorUserId:string;organizationId:string;eventId:string;
  sourceKind:'FORMAL_FEEDBACK'|'CONSENSUS';sourceId:string
}){
  return prisma.$transaction(async tx=>{
    const grant=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!grant?.productAdmin)deny('HUITEACHER_FEEDBACK_MANAGER_REQUIRED',403)
    const targets=await tx.$queryRaw<Array<{subjectUserId:string}>>`
      SELECT target."subject_user_id" AS "subjectUserId"
      FROM "huiteacher_evaluation_events" event
      JOIN "huiteacher_evaluation_targets" target
        ON target."id"=event."target_id"
        AND target."organization_id"=event."organization_id"
        AND target."kind"='PERSON' AND target."status"='ACTIVE'
        AND target."subject_user_id" IS NOT NULL
      JOIN "organization_memberships" m
        ON m."organization_id"=event."organization_id"
        AND m."user_id"=target."subject_user_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      JOIN "organization_persona_grants" persona
        ON persona."organization_id"=m."organization_id"
        AND persona."membership_id"=m."id"
        AND persona."persona"='TEACHER'
        AND persona."revoked_at" IS NULL
      JOIN "users" u ON u."id"=m."user_id"
        AND u."account_domain"='SCHOOL' AND u."teacher_approved"=TRUE
        AND u."is_active"=TRUE AND u."is_frozen"=FALSE
        AND u."must_change_password"=FALSE
      WHERE event."organization_id"=${input.organizationId}
        AND event."id"=${input.eventId}
        AND event."status"='CLOSED'
      FOR SHARE OF event,target,m
    `
    const subjectUserId=targets[0]?.subjectUserId
    if(!subjectUserId||targets.some(x=>x.subjectUserId!==subjectUserId))
      deny('HUITEACHER_FEEDBACK_PERSON_TARGET_REQUIRED',403)
    if(input.sourceKind==='FORMAL_FEEDBACK'){
      const note=await tx.huiteacherObservationRecord.findFirst({where:{
        id:input.sourceId,organizationId:input.organizationId,eventId:input.eventId,
        kind:'FORMAL_FEEDBACK',status:'SUBMITTED',
      },select:{id:true}})
      if(!note)deny('HUITEACHER_FEEDBACK_FORMAL_SOURCE_REQUIRED',404)
    }else{
      const consensus=await tx.huiteacherFieldConsensus.findFirst({where:{
        id:input.sourceId,organizationId:input.organizationId,eventId:input.eventId,
        status:'SUBMITTED',
      },select:{id:true}})
      if(!consensus)deny('HUITEACHER_FEEDBACK_APPROVED_CONSENSUS_REQUIRED',404)
    }
    const existing=await tx.huiteacherFieldFeedbackRelease.findFirst({where:{
      organizationId:input.organizationId,eventId:input.eventId,
      recipientUserId:subjectUserId,
      ...(input.sourceKind==='CONSENSUS'
        ?{consensusId:input.sourceId}:{noteId:input.sourceId}),
    },select:{id:true}})
    if(existing)return {releaseId:existing.id,recipientUserId:subjectUserId,
      released:true,replayed:true}
    const release=await tx.huiteacherFieldFeedbackRelease.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      eventId:input.eventId,recipientUserId:subjectUserId,
      ...(input.sourceKind==='CONSENSUS'
        ?{consensusId:input.sourceId}:{noteId:input.sourceId}),
      releasedByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,
      action:'HUITEACHER_FIELD_FEEDBACK_RELEASED_TO_SUBJECT',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),payload:{releaseId:release.id,
        sourceKind:input.sourceKind,sourceId:input.sourceId,recipientUserId:subjectUserId},
    })
    return {releaseId:release.id,recipientUserId:subjectUserId,
      released:true,replayed:false}
  })
}
/** The current teacher can only see explicitly released own feedback from
 * schools where membership, Teacher product and report disclosure remain valid.
 * No evaluator name, other respondent list or private reflection is sent.
 */
export async function readOwnHuiteacherFieldFeedback(actorUserId:string){
  const rows=await prisma.$queryRaw<Array<{
    id:string;eventTitle:string;eventId:string;organizationId:string;
    kind:'FORMAL_FEEDBACK'|'CONSENSUS';bodyCipher:string;releasedAt:Date
  }>>`
    SELECT release."id",event."title" AS "eventTitle",
      event."id" AS "eventId",event."organization_id" AS "organizationId",
      CASE WHEN release."consensus_id" IS NOT NULL THEN 'CONSENSUS'
        ELSE 'FORMAL_FEEDBACK' END AS "kind",
      COALESCE(note."body_cipher",consensus."body_cipher") AS "bodyCipher",
      release."released_at" AS "releasedAt"
    FROM "huiteacher_field_feedback_releases" release
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=release."organization_id"
      AND event."id"=release."event_id"
      AND event."status"='CLOSED'
    JOIN "huiteacher_evaluation_targets" target
      ON target."organization_id"=event."organization_id"
      AND target."id"=event."target_id"
      AND target."kind"='PERSON' AND target."status"='ACTIVE'
      AND target."subject_user_id"=${actorUserId}
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=event."organization_id"
      AND entitlement."product"='HUITEACHER'
      AND entitlement."status"='ACTIVE'
    JOIN "organizations" org ON org."id"=event."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "users" actor ON actor."id"=${actorUserId}
      AND actor."account_domain"='SCHOOL'
      AND actor."role" IN ('TEACHER','ADMIN')
      AND actor."teacher_approved"=TRUE AND actor."is_active"=TRUE
      AND actor."is_frozen"=FALSE AND actor."must_change_password"=FALSE
      AND (actor."expires_at" IS NULL OR actor."expires_at">statement_timestamp())
    JOIN "organization_memberships" membership
      ON membership."organization_id"=org."id"
      AND membership."user_id"=actor."id"
      AND membership."valid_from"<=statement_timestamp()
      AND (membership."valid_until" IS NULL
        OR membership."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=membership."organization_id"
      AND persona."membership_id"=membership."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    LEFT JOIN "huiteacher_observation_records" note
      ON note."organization_id"=release."organization_id"
      AND note."event_id"=release."event_id"
      AND note."id"=release."note_id"
      AND note."status"='SUBMITTED' AND note."kind"='FORMAL_FEEDBACK'
    LEFT JOIN "huiteacher_field_consensuses" consensus
      ON consensus."organization_id"=release."organization_id"
      AND consensus."event_id"=release."event_id"
      AND consensus."id"=release."consensus_id"
      AND consensus."status"='SUBMITTED'
    WHERE release."recipient_user_id"=${actorUserId}
      AND (note."id" IS NOT NULL OR consensus."id" IS NOT NULL)
      AND NOT EXISTS(
        SELECT 1 FROM "organization_access_denies" denial
        WHERE denial."organization_id"=event."organization_id"
          AND denial."user_id"=${actorUserId}
          AND denial."lifted_at" IS NULL
          AND denial."permission" IN ('*','EDUCATION_ACCESS',
            'HUITEACHER_ACCESS','REPORT_READ')
      )
    ORDER BY release."released_at" DESC,release."id" DESC LIMIT 101
  `
  return {list:rows.slice(0,100).map(({bodyCipher,...r})=>({
    ...r,content:plain(bodyCipher,r.kind),
  })),truncated:rows.length>100}
}
