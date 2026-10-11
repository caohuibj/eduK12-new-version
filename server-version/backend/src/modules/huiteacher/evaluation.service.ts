import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
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
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:false})
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
    await scope(tx,{actorUserId:input.actorUserId,organizationId:input.organizationId,admin:false})
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
    const event=await tx.huiteacherEvaluationEvent.findFirst({where:{
      id:input.eventId,organizationId:input.organizationId,
    },select:{id:true,status:true,version:true,targetId:true}})
    if(!event)fail('HUITEACHER_EVENT_NOT_FOUND',404)
    if(event.version!==input.expectedVersion)fail('HUITEACHER_EVENT_VERSION_CHANGED')
    const from=input.action==='OPEN'?'DRAFT':input.action==='CLOSE'?'OPEN':null
    if((from&&event.status!==from)||input.action==='CANCEL'&&!['DRAFT','OPEN'].includes(event.status))
      fail('HUITEACHER_EVENT_INVALID_TRANSITION')
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
