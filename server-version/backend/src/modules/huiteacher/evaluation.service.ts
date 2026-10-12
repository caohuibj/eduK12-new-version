import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { createAssessmentRunDraft } from '../assessment-run/repository'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

export type TeacherTargetKind='PERSON'|'TEAM'|'ORGANIZATION'|'ACTIVITY'|'ARTIFACT'|'PROJECT'
export type TeacherEventKind='ASSESSMENT'|'CLASSROOM'|'MEETING'|'TEACHING_RESEARCH'|'FIELD_VISIT'|'OTHER'
export type TeacherEventTransition='OPEN'|'CLOSE'|'CANCEL'
type Tx=Prisma.TransactionClient
export class HuiteacherEvaluationError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherEvaluationError'
  }
}
const fail=(code:string,status=409):never=>{throw new HuiteacherEvaluationError(code,status)}
async function scope(tx:Tx,input:{actorUserId:string;organizationId:string;admin:boolean}){
  const current=await resolveEducationProductMemberScope({
    actorUserId:input.actorUserId,organizationId:input.organizationId,product:'HUITEACHER',
  },tx)
  if(!current||input.admin&&!current.productAdmin)fail('HUITEACHER_EVALUATION_AUTH_REQUIRED',403)
  return current
}
export async function createHuiteacherTarget(input:{
  organizationId:string;actorUserId:string;kind:TeacherTargetKind
  name:string;subjectUserId?:string
}){
  const name=input.name.trim()
  if(!name||name.length>200)fail('HUITEACHER_TARGET_NAME_INVALID',400)
  if(input.kind!=='PERSON'&&input.subjectUserId)fail('HUITEACHER_TARGET_RELATION_INVALID',400)
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    if(input.kind==='PERSON'&&input.subjectUserId){
      const teacher=await tx.$queryRaw<Array<{id:string}>>`
        SELECT user_row."id"
        FROM "users" user_row
        JOIN "organization_memberships" m
          ON m."user_id"=user_row."id" AND m."organization_id"=${input.organizationId}
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
        JOIN "organization_persona_grants" persona
          ON persona."organization_id"=m."organization_id"
          AND persona."membership_id"=m."id" AND persona."persona"='TEACHER'
          AND persona."revoked_at" IS NULL
        WHERE user_row."id"=${input.subjectUserId}
          AND user_row."account_domain"='SCHOOL'
          AND user_row."is_active"=TRUE AND user_row."is_frozen"=FALSE
        LIMIT 1
      `
      if(!teacher.length)fail('HUITEACHER_TARGET_MEMBER_INVALID',403)
    }
    // An unregistered teacher is a stable but UNCLAIMED target. Later account
    // binding requires a separate identity proof and must never match by name.
    const id=randomUUID()
    const target=await tx.huiteacherEvaluationTarget.create({data:{
      id,organizationId:input.organizationId,kind:input.kind,
      name,subjectUserId:input.subjectUserId??null,
      createdByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_TARGET_CREATED',targetType:'EVALUATION_TARGET',
      targetId:id,domainEventId:randomUUID(),
      payload:{kind:input.kind,hasConfirmedUserId:!!input.subjectUserId}})
    return target
  })
}
export async function listHuiteacherTargets(input:{
  organizationId:string;actorUserId:string;cursor?:string
}){
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const rows=await tx.huiteacherEvaluationTarget.findMany({where:{
      organizationId:input.organizationId,
      status:'ACTIVE',
      ...(input.cursor?{id:{gt:input.cursor}}:{}),
    },select:{id:true,kind:true,name:true,subjectUserId:true,status:true,createdAt:true},
      orderBy:{id:'asc'},take:101})
    return {list:rows.slice(0,100),
      nextCursor:rows.length>100?rows[99].id:null}
  })
}
export async function archiveHuiteacherTarget(input:{
  organizationId:string;actorUserId:string;targetId:string
}){
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const activeEvents=await tx.huiteacherEvaluationEvent.count({where:{
      organizationId:input.organizationId,targetId:input.targetId,
      status:{in:['DRAFT','OPEN']},
    }})
    if(activeEvents)fail('HUITEACHER_TARGET_HAS_ACTIVE_EVENTS')
    const updated=await tx.huiteacherEvaluationTarget.updateMany({where:{
      id:input.targetId,organizationId:input.organizationId,status:'ACTIVE',
    },data:{status:'ARCHIVED',updatedAt:new Date()}})
    if(updated.count!==1)fail('HUITEACHER_TARGET_NOT_ACTIVE',404)
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_TARGET_ARCHIVED',targetType:'EVALUATION_TARGET',
      targetId:input.targetId,domainEventId:randomUUID(),payload:{}})
    return {archived:true}
  })
}
export async function createHuiteacherEvent(input:{
  organizationId:string;actorUserId:string;targetId:string
  kind:TeacherEventKind;title:string;notes?:string;scheduledAt?:Date
}){
  const title=input.title.trim()
  if(!title||title.length>200||(input.notes?.length??0)>12000)
    fail('HUITEACHER_EVENT_INPUT_INVALID',400)
  if(input.scheduledAt&&!Number.isFinite(input.scheduledAt.getTime()))
    fail('HUITEACHER_EVENT_DATE_INVALID',400)
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const target=await tx.huiteacherEvaluationTarget.findFirst({where:{
      id:input.targetId,organizationId:input.organizationId,status:'ACTIVE',
    },select:{id:true}})
    if(!target)fail('HUITEACHER_EVENT_TARGET_INVALID',404)
    const id=randomUUID()
    const event=await tx.huiteacherEvaluationEvent.create({data:{
      id,organizationId:input.organizationId,targetId:input.targetId,
      kind:input.kind,title,notes:input.notes?.trim()??null,
      scheduledAt:input.scheduledAt??null,createdByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_EVENT_DRAFT_CREATED',targetType:'EVALUATION_EVENT',
      targetId:id,domainEventId:randomUUID(),
      payload:{kind:input.kind,targetId:input.targetId}})
    return event
  })
}
export async function listHuiteacherEvents(input:{
  organizationId:string;actorUserId:string;targetId?:string;cursor?:string
}){
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const rows=await tx.huiteacherEvaluationEvent.findMany({where:{
      organizationId:input.organizationId,...(input.targetId?{targetId:input.targetId}:{}),
      ...(input.cursor?{id:{gt:input.cursor}}:{}),
    },select:{id:true,kind:true,title:true,notes:true,targetId:true,status:true,
      version:true,scheduledAt:true,openedAt:true,closedAt:true,createdAt:true},
      orderBy:{id:'asc'},take:101})
    return {list:rows.slice(0,100),nextCursor:rows.length>100?rows[99].id:null}
  })
}
export async function transitionHuiteacherEvent(input:{
  organizationId:string;actorUserId:string;eventId:string
  action:TeacherEventTransition;expectedVersion:number
}){
  if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1)
    fail('HUITEACHER_EVENT_VERSION_REQUIRED',400)
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    // Serialize activity transitions with observer invitation acceptance and
    // canonical Run updates. Validity is checked under the event lock.
    const events=await tx.$queryRaw<Array<{
      id:string;status:string;version:number;kind:string;targetId:string
    }>>`
      SELECT "id","status","version","kind","target_id" AS "targetId"
      FROM "huiteacher_evaluation_events"
      WHERE "organization_id"=${input.organizationId}
        AND "id"=${input.eventId} FOR UPDATE
    `
    const event=events[0]
    if(!event)fail('HUITEACHER_EVENT_NOT_FOUND',404)
    if(event.version!==input.expectedVersion)fail('HUITEACHER_EVENT_VERSION_CHANGED')
    const from=input.action==='OPEN'?'DRAFT':input.action==='CLOSE'?'OPEN':null
    if((from&&event.status!==from)||input.action==='CANCEL'&&!['DRAFT','OPEN'].includes(event.status))
      fail('HUITEACHER_EVENT_INVALID_TRANSITION')
    const relatedRun=await tx.$queryRaw<Array<{id:string;status:string}>>`
      SELECT run."id",run."status" FROM "huiteacher_evaluation_run_links" link
      JOIN "assessment_runs" run
        ON run."organization_id"=link."organization_id"
        AND run."id"=link."run_id"
      WHERE link."organization_id"=${input.organizationId}
        AND link."event_id"=${input.eventId}
      FOR SHARE OF run
    `
    const run=relatedRun[0]
    if(input.action==='OPEN'){
      if(run){
        // Form/Scale activities must never bypass the frozen Run contract.
        if(run.status!=='DRAFT')fail('HUITEACHER_EVENT_RUN_DRAFT_REQUIRED')
        const tracks=await tx.$queryRaw<Array<{n:number}>>`
          SELECT COUNT(*)::int AS n FROM "assessment_run_tracks"
          WHERE "organization_id"=${input.organizationId}
            AND "run_id"=${run.id}
        `
        if((tracks[0]?.n??0)<1)fail('HUITEACHER_EVENT_TRACK_REQUIRED')
      }else{
        // Field-only events do not create empty/fake Assessment Runs.
        // At least one independently ACCEPTED, unexpired expert/peer grant
        // proves the field event is ready. Generic ASSESSMENT cannot use this.
        if(!['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind))
          fail('HUITEACHER_EVENT_RUN_DRAFT_REQUIRED')
        const accepted=await tx.$queryRaw<Array<{n:number}>>`
          SELECT COUNT(*)::int AS n
          FROM "huiteacher_observer_grants" g
          JOIN "users" u ON u."id"=g."observer_user_id"
            AND u."account_domain"='SCHOOL'
            AND u."role" IN ('TEACHER','ADMIN')
            AND u."teacher_approved"=TRUE AND u."is_active"=TRUE
            AND u."is_frozen"=FALSE AND u."must_change_password"=FALSE
            AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
          WHERE g."organization_id"=${input.organizationId}
            AND g."event_id"=${input.eventId}
            AND g."status"='ACCEPTED' AND g."accepted_at" IS NOT NULL
            AND g."revoked_at" IS NULL AND g."expires_at">statement_timestamp()
        `
        if((accepted[0]?.n??0)<1)
          fail('HUITEACHER_FIELD_ACCEPTED_OBSERVER_REQUIRED')
      }
    }
    if(input.action==='CLOSE'&&run&&run.status!=='CLOSED')
      fail('HUITEACHER_RUN_MUST_CLOSE_FIRST')
    if(input.action==='CANCEL'&&run&&!['DRAFT','CANCELLED'].includes(run.status))
      fail('HUITEACHER_RUN_MUST_CANCEL_FIRST')
    const now=new Date()
    const status=input.action==='OPEN'?'OPEN':input.action==='CLOSE'?'CLOSED':'CANCELLED'
    const changed=await tx.huiteacherEvaluationEvent.updateMany({
      where:{id:event.id,organizationId:input.organizationId,version:input.expectedVersion,status:event.status},
      data:{status,version:{increment:1},updatedAt:now,
        ...(input.action==='OPEN'?{openedAt:now}:{}),
        ...(input.action==='CLOSE'||input.action==='CANCEL'?{closedAt:now}:{})},
    })
    if(changed.count!==1)fail('HUITEACHER_EVENT_VERSION_CHANGED')
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_EVENT_'+status,targetType:'EVALUATION_EVENT',
      targetId:event.id,domainEventId:randomUUID(),
      payload:{from:event.status,to:status,version:input.expectedVersion+1}})
    return {id:event.id,status,version:input.expectedVersion+1}
  })
}

/**
 * Reuse canonical Assessment Run with an atomic product-bound draft.
 * Do not allow a caller-supplied arbitrary runId: School-owned Runs and their
 * FINAL are never promoted to Teacher by ID reuse.
 */
export async function createHuiteacherEventRunDraft(input:{
  organizationId:string;actorUserId:string;eventId:string;name:string;
  intakeDeadline?:Date|null
}){
  const name=input.name.trim()
  if(!name||name.length>200)fail('HUITEACHER_RUN_NAME_INVALID',400)
  if(input.intakeDeadline&&!Number.isFinite(input.intakeDeadline.getTime()))
    fail('HUITEACHER_RUN_DATE_INVALID',400)
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const events=await tx.$queryRaw<Array<{id:string;status:string;targetId:string}>>`
      SELECT event."id",event."status",event."target_id" AS "targetId"
      FROM "huiteacher_evaluation_events" event
      JOIN "huiteacher_evaluation_targets" target
        ON target."id"=event."target_id"
        AND target."organization_id"=event."organization_id"
        AND target."status"='ACTIVE'
      WHERE event."organization_id"=${input.organizationId}
        AND event."id"=${input.eventId}
      FOR UPDATE OF event
    `
    if(!events.length)fail('HUITEACHER_EVENT_NOT_FOUND',404)
    if(events[0].status!=='DRAFT')fail('HUITEACHER_RUN_EVENT_NOT_DRAFT')
    const existing=await tx.huiteacherEvaluationRunLink.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},
      select:{runId:true},
    })
    if(existing)fail('HUITEACHER_EVENT_RUN_EXISTS')
    const studentFeedback=await tx.huiteacherStudentEvaluationConfig.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},select:{id:true},
    })
    // A student→teacher Run requires an exact role/relationship policy and
    // new START/FINAL/report disclosure adapters. Do not silently publish an
    // ordinary Teacher SELF Form for the same configured event.
    if(studentFeedback)fail('HUITEACHER_STUDENT_EVAL_RUN_ADAPTER_NOT_RELEASED',403)
    const run=await createAssessmentRunDraft({
      tx,organizationId:input.organizationId,createdByUserId:input.actorUserId,
      name,intakeDeadline:input.intakeDeadline??null,
    })
    await tx.huiteacherEvaluationRunLink.create({data:{
      organizationId:input.organizationId,eventId:input.eventId,
      runId:run.id,boundByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_CANONICAL_RUN_CREATED',targetType:'RUN',
      targetId:run.id,domainEventId:randomUUID(),
      payload:{eventId:input.eventId,runVersion:run.version,runStatus:run.status},
    })
    return {eventId:input.eventId,runId:run.id,status:run.status,version:run.version}
  })
}

export async function readHuiteacherEventRun(input:{
  organizationId:string;actorUserId:string;eventId:string
}){
  return prisma.$transaction(async tx=>{
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:true})
    const link=await tx.huiteacherEvaluationRunLink.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},select:{eventId:true,runId:true,createdAt:true},
    })
    if(!link)fail('HUITEACHER_EVENT_RUN_NOT_FOUND',404)
    const run=await tx.$queryRaw<Array<{status:string;version:number;name:string}>>`
      SELECT "status","version","name" FROM "assessment_runs"
      WHERE "id"=${link.runId} AND "organization_id"=${input.organizationId}
    `
    if(!run.length)fail('HUITEACHER_EVENT_RUN_NOT_FOUND',404)
    const tracks=await tx.$queryRaw<Array<{n:number}>>`
      SELECT COUNT(*)::int AS n FROM "assessment_run_tracks"
      WHERE "organization_id"=${input.organizationId}
        AND "run_id"=${link.runId}
    `
    return {...link,...run[0],trackCount:tracks[0]?.n??0}
  })
}
