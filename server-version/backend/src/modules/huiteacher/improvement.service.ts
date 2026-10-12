import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {appendAudit} from '../organization/service'

type Tx=Prisma.TransactionClient
type Audience='PRIVATE_PERSONAL'|'SCHOOL_SHARED'
type Status='PLANNED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'
export class HuiteacherImprovementError extends Error {
  constructor(public readonly code:string,public readonly statusCode=403){
    super(code);this.name='HuiteacherImprovementError'
  }
}
const deny=(code:string,statusCode=403):never=>{
  throw new HuiteacherImprovementError(code,statusCode)
}
const encrypted=(kind:'GOAL'|'PLAN'|'EVIDENCE'|'REASSESSMENT',text:string)=>{
  const payload={schemaVersion:1 as const,
    purpose:'HUITEACHER_IMPROVEMENT' as const,kind,text}
  return {cipher:encryptUnifiedRuntimePayload(payload),hash:canonicalHash(payload)}
}
const decrypted=(kind:'GOAL'|'PLAN'|'EVIDENCE'|'REASSESSMENT',cipher:string,hash:string)=>{
  const value=decryptUnifiedRuntimePayload<{
    schemaVersion:number;purpose:string;kind:string;text:string
  }>(cipher)
  if(value.schemaVersion!==1||value.purpose!=='HUITEACHER_IMPROVEMENT'
    ||value.kind!==kind||typeof value.text!=='string'
    ||canonicalHash(value)!==hash)
    deny('HUITEACHER_ACTION_CIPHER_INTEGRITY',409)
  return value.text
}
async function currentScope(tx:Tx,input:{
  actorUserId:string;organizationId:string;targetId:string
}){
  const membership=await resolveEducationProductMemberScope({
    organizationId:input.organizationId,
    actorUserId:input.actorUserId,product:'HUITEACHER',
  },tx)
  if(!membership)deny('HUITEACHER_ACTION_PRODUCT_FORBIDDEN')
  const targets=await tx.$queryRaw<Array<{
    id:string;kind:string;name:string;subjectUserId:string|null;status:string
  }>>`
    SELECT "id","kind","name","subject_user_id" AS "subjectUserId","status"
    FROM "huiteacher_evaluation_targets"
    WHERE "organization_id"=${input.organizationId}
      AND "id"=${input.targetId} FOR SHARE
  `
  const target=targets[0]
  if(!target)deny('HUITEACHER_ACTION_TARGET_NOT_FOUND',404)
  const teacher=target.kind==='PERSON'&&target.subjectUserId===input.actorUserId
    &&(await tx.$queryRaw<Array<{id:string}>>`
      SELECT persona."id" FROM "organization_memberships" member
      JOIN "organization_persona_grants" persona
        ON persona."organization_id"=member."organization_id"
        AND persona."membership_id"=member."id"
        AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
      JOIN "users" u ON u."id"=member."user_id"
        AND u."account_domain"='SCHOOL'
        AND u."role" IN ('TEACHER','ADMIN') AND u."teacher_approved"=TRUE
        AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      WHERE member."organization_id"=${input.organizationId}
        AND member."user_id"=${input.actorUserId}
        AND member."valid_from"<=statement_timestamp()
        AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
      LIMIT 1
    `).length>0
  return {target,membership,teacher}
}
const canRead=(scope:Awaited<ReturnType<typeof currentScope>>,
  audience:Audience,ownerUserId:string,actorUserId:string)=>
  audience==='PRIVATE_PERSONAL'
    ?scope.teacher&&ownerUserId===actorUserId
    :scope.membership.productAdmin||scope.teacher

const projected=(row:{
  id:string;organizationId:string;targetId:string;sourceEventId:string|null;
  ownerUserId:string;audience:string;goalCipher:string;goalHash:string;
  planCipher:string;planHash:string;evidenceCipher:string|null;
  evidenceHash:string|null;status:string;version:number;dueAt:Date|null;
  completedAt:Date|null;createdAt:Date;updatedAt:Date;
})=>({
  id:row.id,targetId:row.targetId,sourceEventId:row.sourceEventId,
  audience:row.audience,status:row.status,version:row.version,
  goal:decrypted('GOAL',row.goalCipher,row.goalHash),
  plan:decrypted('PLAN',row.planCipher,row.planHash),
  evidence:row.evidenceCipher&&row.evidenceHash
    ?decrypted('EVIDENCE',row.evidenceCipher,row.evidenceHash):null,
  dueAt:row.dueAt,completedAt:row.completedAt,
  createdAt:row.createdAt,updatedAt:row.updatedAt,
})

/** Private teacher goals are never part of school administrator output.
 * School shared actions require an explicit current Teacher product admin.
 */
export async function createHuiteacherImprovement(input:{
  actorUserId:string;organizationId:string;targetId:string;
  audience:Audience;sourceEventId?:string|null;goal:string;plan:string;
  dueAt?:Date|null
}){
  const goal=input.goal.trim(),plan=input.plan.trim()
  if(goal.length<2||goal.length>400||plan.length<5||plan.length>4000
    ||input.dueAt&&(!Number.isFinite(input.dueAt.getTime())))
    deny('HUITEACHER_ACTION_INPUT_INVALID',400)
  return prisma.$transaction(async tx=>{
    const scope=await currentScope(tx,input)
    if(scope.target.status!=='ACTIVE')deny('HUITEACHER_ACTION_TARGET_ARCHIVED',409)
    if(input.audience==='PRIVATE_PERSONAL'&&!scope.teacher)
      deny('HUITEACHER_ACTION_PRIVATE_AUTHOR_REQUIRED')
    if(input.audience==='SCHOOL_SHARED'&&!scope.membership.productAdmin)
      deny('HUITEACHER_ACTION_SCHOOL_ADMIN_REQUIRED')
    if(input.sourceEventId){
      // A closed title is NOT evidence. Only this Teacher product's formal
      // completed Run or submitted non-private observation may justify a
      // longitudinal plan. Student feedback remains excluded until a
      // specific, reviewed aggregate disclosure/longitudinal policy exists.
      const source=await tx.$queryRaw<Array<{id:string}>>`
        SELECT e."id" FROM "huiteacher_evaluation_events" e
        WHERE e."organization_id"=${input.organizationId}
          AND e."id"=${input.sourceEventId}
          AND e."target_id"=${input.targetId}
          AND e."status"='CLOSED'
          AND NOT EXISTS(
            SELECT 1 FROM "huiteacher_student_eval_configs" student
            WHERE student."organization_id"=e."organization_id"
              AND student."event_id"=e."id"
          )
          AND (
            EXISTS(
              SELECT 1 FROM "huiteacher_evaluation_run_links" link
              JOIN "assessment_runs" run
                ON run."organization_id"=link."organization_id"
                AND run."id"=link."run_id"
                AND run."status"='CLOSED'
              JOIN "assessment_run_executions" x
                ON x."organization_id"=run."organization_id"
                AND x."run_id"=run."id"
                AND x."status"='COMPLETED'
              WHERE link."organization_id"=e."organization_id"
                AND link."event_id"=e."id"
            )
            OR EXISTS(
              SELECT 1 FROM "huiteacher_observation_records" note
              WHERE note."organization_id"=e."organization_id"
                AND note."event_id"=e."id"
                AND note."status"='SUBMITTED'
                AND note."kind" IN ('FACT','FORMAL_FEEDBACK')
            )
          ) FOR SHARE OF e
      `
      if(source.length!==1)deny('HUITEACHER_ACTION_SOURCE_NOT_RELEASABLE',409)
    }
    const goalData=encrypted('GOAL',goal),planData=encrypted('PLAN',plan)
    const row=await tx.huiteacherImprovementAction.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      targetId:input.targetId,sourceEventId:input.sourceEventId??null,
      ownerUserId:input.actorUserId,audience:input.audience,
      goalCipher:goalData.cipher,goalHash:goalData.hash,
      planCipher:planData.cipher,planHash:planData.hash,
      dueAt:input.dueAt??null,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_IMPROVEMENT_PLANNED',
      targetType:'IMPROVEMENT_ACTION',targetId:row.id,
      domainEventId:randomUUID(),
      payload:{audience:input.audience,sourceLinked:!!input.sourceEventId,version:1},
    })
    return projected(row)
  })
}


/** Teacher self targets are looked up by the exact shared education User ID,
 * current teacher persona, HUITEACHER entitlement and deny guard. No teacher
 * can browse the school's full roster from this participant endpoint.
 */
export async function listMyHuiteacherImprovementTargets(actorUserId:string){
  const rows=await prisma.$queryRaw<Array<{
    organizationId:string;organizationName:string;targetId:string;targetName:string
  }>>`
    SELECT target."organization_id" AS "organizationId",
      org."name" AS "organizationName",target."id" AS "targetId",
      target."name" AS "targetName"
    FROM "huiteacher_evaluation_targets" target
    JOIN "organizations" org ON org."id"=target."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "education_product_entitlements" product
      ON product."organization_id"=org."id"
      AND product."product"='HUITEACHER' AND product."status"='ACTIVE'
    JOIN "organization_memberships" member
      ON member."organization_id"=org."id"
      AND member."user_id"=${actorUserId}
      AND member."valid_from"<=statement_timestamp()
      AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=member."organization_id"
      AND persona."membership_id"=member."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    JOIN "users" user_row ON user_row."id"=${actorUserId}
      AND user_row."account_domain"='SCHOOL'
      AND user_row."role" IN ('TEACHER','ADMIN')
      AND user_row."teacher_approved"=TRUE
      AND user_row."is_active"=TRUE AND user_row."is_frozen"=FALSE
      AND user_row."must_change_password"=FALSE
      AND (user_row."expires_at" IS NULL OR user_row."expires_at">statement_timestamp())
    WHERE target."kind"='PERSON' AND target."status"='ACTIVE'
      AND target."subject_user_id"=${actorUserId}
      AND NOT EXISTS(SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=org."id"
          AND deny."user_id"=${actorUserId}
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS'))
    ORDER BY target."organization_id",target."id" LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}

export async function listHuiteacherImprovements(input:{
  actorUserId:string;organizationId:string;targetId:string;cursor?:string
}){
  return prisma.$transaction(async tx=>{
    const scope=await currentScope(tx,input)
    if(!scope.membership.productAdmin&&!scope.teacher)
      deny('HUITEACHER_ACTION_TARGET_FORBIDDEN')
    const allowed={
      organizationId:input.organizationId,targetId:input.targetId,
      OR:[{audience:'SCHOOL_SHARED'},
        ...(scope.teacher?[{audience:'PRIVATE_PERSONAL',
          ownerUserId:input.actorUserId}]:[])],
    }
    if(input.cursor){
      const anchor=await tx.huiteacherImprovementAction.findFirst({
        where:{...allowed,id:input.cursor},select:{id:true},
      })
      if(!anchor)deny('HUITEACHER_ACTION_CURSOR_INVALID',400)
    }
    const rows=await tx.huiteacherImprovementAction.findMany({
      where:allowed,
      orderBy:[{createdAt:'desc'},{id:'desc'}],
      ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
      take:51,
    })
    const visible=rows.filter(row=>canRead(scope,row.audience as Audience,
      row.ownerUserId,input.actorUserId))
    // Single scoped read for 50 actions, not one query per participant.
    const ids=visible.slice(0,50).map(row=>row.id)
    const reassessments=ids.length?await tx.huiteacherImprovementReassessment.findMany({
      where:{organizationId:input.organizationId,actionId:{in:ids}},
      select:{actionId:true,eventId:true,createdAt:true,
        feedbackCipher:true,feedbackHash:true},
    }):[]
    const byAction=new Map(reassessments.map(row=>[row.actionId,row]))
    return {targetId:input.targetId,list:visible.slice(0,50).map(row=>{
      const review=byAction.get(row.id)
      return {...projected(row),reassessment:review?{
        eventId:review.eventId,
        feedback:decrypted('REASSESSMENT',
          review.feedbackCipher,review.feedbackHash),
        recordedAt:review.createdAt,
        comparisonPolicy:'NARRATIVE_ONLY_NO_CAUSAL_INFERENCE' as const,
      }:null}
    }),
      nextCursor:rows.length>50?rows[49].id:null,
      disclosure:'SCHOOL_SHARED_OR_OWN_PRIVATE' as const}
  })
}

export async function transitionHuiteacherImprovement(input:{
  actorUserId:string;organizationId:string;targetId:string;actionId:string;
  expectedAudience:Audience;expectedVersion:number;
  action:'START'|'COMPLETE'|'CANCEL';evidence?:string
}){
  if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1
    ||(input.evidence?.trim().length??0)>6000)
    deny('HUITEACHER_ACTION_VERSION_INVALID',400)
  return prisma.$transaction(async tx=>{
    const scope=await currentScope(tx,input)
    const rows=await tx.$queryRaw<Array<{
      id:string;status:Status;version:number;ownerUserId:string;audience:Audience;
    }>>`
      SELECT "id","status","version","owner_user_id" AS "ownerUserId",
        "audience" FROM "huiteacher_improvement_actions"
      WHERE "organization_id"=${input.organizationId}
        AND "target_id"=${input.targetId}
        AND "id"=${input.actionId}
        AND "audience"=${input.expectedAudience} FOR UPDATE
    `
    const row=rows[0]
    if(!row)deny('HUITEACHER_ACTION_NOT_FOUND',404)
    if(row.audience==='PRIVATE_PERSONAL'&&
      (!scope.teacher||row.ownerUserId!==input.actorUserId))
      deny('HUITEACHER_ACTION_PRIVATE_FORBIDDEN')
    if(row.audience==='SCHOOL_SHARED'&&!scope.membership.productAdmin)
      deny('HUITEACHER_ACTION_SCHOOL_FORBIDDEN')
    if(row.version!==input.expectedVersion)
      deny('HUITEACHER_ACTION_VERSION_CONFLICT',409)
    const next:Status=input.action==='START'?'IN_PROGRESS'
      :input.action==='COMPLETE'?'COMPLETED':'CANCELLED'
    if((row.status==='PLANNED'&&!['IN_PROGRESS','CANCELLED'].includes(next))
      ||(row.status==='IN_PROGRESS'&&!['COMPLETED','CANCELLED'].includes(next))
      ||!['PLANNED','IN_PROGRESS'].includes(row.status))
      deny('HUITEACHER_ACTION_TRANSITION_INVALID',409)
    const evidence=input.evidence?.trim()??''
    if(next==='COMPLETED'&&(evidence.length<10||evidence.length>6000))
      deny('HUITEACHER_ACTION_EVIDENCE_REQUIRED',400)
    if(next!=='COMPLETED'&&evidence)
      deny('HUITEACHER_ACTION_EVIDENCE_NOT_APPLICABLE',400)
    const encryptedEvidence=next==='COMPLETED'?encrypted('EVIDENCE',evidence):null
    const now=new Date()
    const changed=await tx.huiteacherImprovementAction.updateMany({
      where:{id:row.id,organizationId:input.organizationId,
        version:row.version,status:row.status},
      data:{status:next,version:{increment:1},updatedAt:now,
        ...(next==='COMPLETED'?{completedAt:now,
          evidenceCipher:encryptedEvidence!.cipher,
          evidenceHash:encryptedEvidence!.hash}:{})},
    })
    if(changed.count!==1)deny('HUITEACHER_ACTION_VERSION_CONFLICT',409)
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_IMPROVEMENT_'+next,
      targetType:'IMPROVEMENT_ACTION',targetId:row.id,
      domainEventId:randomUUID(),
      payload:{audience:row.audience,version:row.version+1,evidenceSupplied:!!encryptedEvidence},
    })
    return {actionId:row.id,status:next,version:row.version+1}
  })
}


type ReassessmentAccess={
  actorUserId:string;organizationId:string;targetId:string;
  actionId:string;audience:Audience
}
async function verifiedReviewAction(tx:Tx,input:ReassessmentAccess,write:boolean){
  const scope=await currentScope(tx,input)
  const action=await tx.huiteacherImprovementAction.findFirst({
    where:{id:input.actionId,organizationId:input.organizationId,
      targetId:input.targetId,audience:input.audience},
  })
  if(!action)deny('HUITEACHER_REASSESSMENT_ACTION_NOT_FOUND',404)
  if(!canRead(scope,action.audience as Audience,action.ownerUserId,input.actorUserId))
    deny('HUITEACHER_REASSESSMENT_AUDIENCE_FORBIDDEN')
  if(write&&input.audience==='SCHOOL_SHARED'&&!scope.membership.productAdmin)
    deny('HUITEACHER_REASSESSMENT_ADMIN_REQUIRED')
  if(action.status!=='COMPLETED'||!action.completedAt)
    deny('HUITEACHER_REASSESSMENT_ACTION_INCOMPLETE',409)
  return action
}

async function reassessmentCandidates(tx:Tx,action:{
  organizationId:string;targetId:string;completedAt:Date|null;
  sourceEventId:string|null
},eventId?:string){
  if(!action.completedAt)deny('HUITEACHER_REASSESSMENT_ACTION_INCOMPLETE',409)
  return tx.$queryRaw<Array<{id:string;title:string;kind:string;closedAt:Date}>>`
    SELECT event."id",event."title",event."kind",
      event."closed_at" AS "closedAt"
    FROM "huiteacher_evaluation_events" event
    WHERE event."organization_id"=${action.organizationId}
      AND event."target_id"=${action.targetId}
      AND event."status"='CLOSED'
      -- A teacher cannot use an unpublished/small student feedback group
      -- as an alternative narrative backdoor or longitudinal comparator.
      AND NOT EXISTS(
        SELECT 1 FROM "huiteacher_student_eval_configs" student
        WHERE student."organization_id"=event."organization_id"
          AND student."event_id"=event."id"
      )
      AND event."opened_at">${action.completedAt}
      AND event."closed_at">${action.completedAt}
      AND (${action.sourceEventId}::text IS NULL
        OR event."id"<>${action.sourceEventId})
      AND (${eventId??null}::text IS NULL OR event."id"=${eventId??null})
      AND (
        EXISTS(
          SELECT 1 FROM "huiteacher_evaluation_run_links" link
          JOIN "assessment_runs" run
            ON run."organization_id"=link."organization_id"
            AND run."id"=link."run_id" AND run."status"='CLOSED'
          JOIN "assessment_run_executions" execution
            ON execution."organization_id"=run."organization_id"
            AND execution."run_id"=run."id"
            AND execution."status"='COMPLETED'
          WHERE link."organization_id"=event."organization_id"
            AND link."event_id"=event."id"
        )
        OR EXISTS(
          SELECT 1 FROM "huiteacher_observation_records" record
          WHERE record."organization_id"=event."organization_id"
            AND record."event_id"=event."id"
            AND record."status"='SUBMITTED'
            AND record."kind" IN ('FACT','FORMAL_FEEDBACK')
        )
      )
    ORDER BY event."closed_at" DESC,event."id" DESC LIMIT 51
  `
}
/** A completed action can point to only one LATER, evidence-bearing event.
 * Listing is metadata-only, never a second, unsafe route to raw reports.
 */
export async function listHuiteacherReassessmentCandidates(input:ReassessmentAccess){
  return prisma.$transaction(async tx=>{
    const action=await verifiedReviewAction(tx,input,false)
    const rows=await reassessmentCandidates(tx,action)
    return {list:rows.slice(0,50),truncated:rows.length>50,
      note:'只列出行动完成后正式关闭、具有提交证据的同对象活动；不代表量尺可比或具有因果效果。'}
  })
}
export async function attachHuiteacherReassessment(input:ReassessmentAccess&{
  eventId:string;feedback:string
}){
  const feedback=input.feedback.trim()
  if(feedback.length<15||feedback.length>2500)
    deny('HUITEACHER_REASSESSMENT_FEEDBACK_INVALID',400)
  try{
    return await prisma.$transaction(async tx=>{
      const action=await verifiedReviewAction(tx,input,true)
      const source=await reassessmentCandidates(tx,action,input.eventId)
      if(source.length!==1||source[0].id!==input.eventId)
        deny('HUITEACHER_REASSESSMENT_SOURCE_INVALID',409)
      const existing=await tx.huiteacherImprovementReassessment.findUnique({
        where:{organizationId_actionId:{
          organizationId:input.organizationId,actionId:input.actionId,
        }},select:{id:true},
      })
      if(existing)deny('HUITEACHER_REASSESSMENT_ALREADY_LINKED',409)
      const encryptedNote=encrypted('REASSESSMENT',feedback)
      const record=await tx.huiteacherImprovementReassessment.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        actionId:input.actionId,targetId:input.targetId,
        eventId:input.eventId,reviewedByUserId:input.actorUserId,
        feedbackCipher:encryptedNote.cipher,feedbackHash:encryptedNote.hash,
      }})
      await appendAudit(tx,{
        organizationId:input.organizationId,actorUserId:input.actorUserId,
        action:'HUITEACHER_IMPROVEMENT_REASSESSED',
        targetType:'IMPROVEMENT_ACTION',targetId:input.actionId,
        domainEventId:randomUUID(),payload:{
          reassessmentEventId:input.eventId,audience:input.audience,
          comparisonPolicy:'NARRATIVE_ONLY',
        },
      })
      return {actionId:input.actionId,eventId:record.eventId,
        feedback,recordedAt:record.createdAt,
        comparisonPolicy:'NARRATIVE_ONLY_NO_CAUSAL_INFERENCE' as const}
    })
  }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
      deny('HUITEACHER_REASSESSMENT_ALREADY_LINKED',409)
    throw error
  }
}
