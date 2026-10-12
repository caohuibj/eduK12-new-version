import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { canonicalHash } from '../assessment-runtime/canonical'
import { dryRunSurveyForm,SurveyFinalValidationError } from '../survey/final.compute'
import { readBoundHuiteacherFieldForm } from './fieldForm.service'

type Tx=Prisma.TransactionClient
export type TeacherObserverRole='EXPERT'|'PEER'
export type TeacherObservationKind='FACT'|'FORMAL_FEEDBACK'|'PRIVATE_REFLECTION'
export class HuiteacherObserverError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherObserverError'
  }
}
const denied=(code:string,status=409):never=>{throw new HuiteacherObserverError(code,status)}
async function validEducationActor(tx:Tx,userId:string){
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM "users" WHERE "id"=${userId}
      AND "account_domain"='SCHOOL' AND "role" IN ('TEACHER','ADMIN')
      AND "teacher_approved"=TRUE AND "is_active"=TRUE
      AND "is_frozen"=FALSE AND "must_change_password"=FALSE
      AND ("expires_at" IS NULL OR "expires_at">statement_timestamp())
    FOR SHARE
  `
  if(!rows.length)denied('HUITEACHER_OBSERVER_ACCOUNT_REQUIRED',403)
}
async function schoolEvent(tx:Tx,input:{
  organizationId:string;eventId:string;allowDraft?:boolean;allowClosed?:boolean
}){
  const rows=await tx.$queryRaw<Array<{id:string;status:string;kind:string}>>`
    SELECT event."id",event."status",event."kind"
    FROM "huiteacher_evaluation_events" event
    JOIN "organizations" o ON o."id"=event."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=event."organization_id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    WHERE event."organization_id"=${input.organizationId}
      AND event."id"=${input.eventId}
    FOR SHARE OF event,entitlement,o
  `
  const e=rows[0]
  if(!e||!['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(e.kind))
    denied('HUITEACHER_FIELD_EVENT_UNAVAILABLE',404)
  if(e.status!=='OPEN'
    &&!(input.allowDraft&&e.status==='DRAFT')
    &&!(input.allowClosed&&e.status==='CLOSED'))
    denied('HUITEACHER_FIELD_EVENT_NOT_OPEN')
  return e
}
async function manager(tx:Tx,organizationId:string,userId:string){
  const access=await resolveEducationProductMemberScope({
    organizationId,actorUserId:userId,product:'HUITEACHER',
  },tx)
  if(!access?.productAdmin)denied('HUITEACHER_FIELD_MANAGER_REQUIRED',403)
}
async function activeObserver(tx:Tx,input:{
  organizationId:string;eventId:string;userId:string
}){
  await validEducationActor(tx,input.userId)
  const rows=await tx.$queryRaw<Array<{id:string;role:string}>>`
    SELECT grant_row."id",grant_row."role"
    FROM "huiteacher_observer_grants" grant_row
    WHERE grant_row."organization_id"=${input.organizationId}
      AND grant_row."event_id"=${input.eventId}
      AND grant_row."observer_user_id"=${input.userId}
      AND grant_row."status"='ACCEPTED'
      AND grant_row."expires_at">statement_timestamp()
      AND grant_row."revoked_at" IS NULL
    FOR SHARE
  `
  if(rows.length)return rows[0]
  const scope=await resolveEducationProductMemberScope({
    organizationId:input.organizationId,actorUserId:input.userId,product:'HUITEACHER',
  },tx)
  if(!scope?.productAdmin)denied('HUITEACHER_FIELD_OBSERVER_NOT_ASSIGNED',403)
  return {id:scope.membershipId,role:'MANAGER'}
}

export async function inviteHuiteacherObserver(input:{
  organizationId:string;eventId:string;actorUserId:string;
  observerUserId:string;role:TeacherObserverRole;expiresAt:Date
}){
  const now=new Date()
  if(!Number.isFinite(input.expiresAt.getTime())
    ||input.expiresAt.getTime()<=now.getTime()
    ||input.expiresAt.getTime()>now.getTime()+180*86400000)
    denied('HUITEACHER_OBSERVER_EXPIRY_INVALID',400)
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    const event=await schoolEvent(tx,{organizationId:input.organizationId,
      eventId:input.eventId,allowDraft:true,allowClosed:true})
    await validEducationActor(tx,input.observerUserId)
    const where={organizationId_eventId_observerUserId:{
      organizationId:input.organizationId,eventId:input.eventId,
      observerUserId:input.observerUserId,
    }}
    const previous=await tx.huiteacherObserverGrant.findUnique({where})
    // Once a field visit closes, this is strictly a renewal for authors of
    // existing submitted formal evidence; it must not create new reviewers.
    if(event.status==='CLOSED'){
      if(!previous)denied('HUITEACHER_CLOSED_EVENT_NEW_INVITEE_FORBIDDEN',403)
      const authored=await tx.huiteacherObservationRecord.count({where:{
        organizationId:input.organizationId,eventId:input.eventId,
        observerUserId:input.observerUserId,kind:'FORMAL_FEEDBACK',
        status:'SUBMITTED',
      }})
      if(authored<1)denied('HUITEACHER_CLOSED_EVENT_REVIEWER_NOT_SOURCED',403)
    }
    if(previous?.status==='ACCEPTED'&&previous.expiresAt>now)
      denied('HUITEACHER_OBSERVER_ALREADY_ACTIVE')
    const changed=previous
      ?await tx.huiteacherObserverGrant.update({where,
        data:{status:'INVITED',role:input.role,expiresAt:input.expiresAt,
          invitedByUserId:input.actorUserId,acceptedAt:null,revokedAt:null,
          revision:{increment:1}},
      })
      :await tx.huiteacherObserverGrant.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        eventId:input.eventId,observerUserId:input.observerUserId,
        role:input.role,status:'INVITED',expiresAt:input.expiresAt,
        invitedByUserId:input.actorUserId,
      }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_OBSERVER_INVITED',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),
      payload:{invitationId:changed.id,role:input.role,revision:changed.revision},
    })
    // Never leak invitee's details or private work through manager response.
    return {id:changed.id,status:changed.status,expiresAt:changed.expiresAt,
      revision:changed.revision}
  })
}

export async function acceptHuiteacherObserver(input:{userId:string;invitationId:string}){
  return prisma.$transaction(async tx=>{
    await validEducationActor(tx,input.userId)
    const rows=await tx.$queryRaw<Array<{organizationId:string;eventId:string;status:string}>>`
      SELECT "organization_id" AS "organizationId",
        "event_id" AS "eventId","status"
      FROM "huiteacher_observer_grants"
      WHERE "id"=${input.invitationId}
        AND "observer_user_id"=${input.userId}
        AND "expires_at">statement_timestamp()
        AND "revoked_at" IS NULL
      FOR UPDATE
    `
    const grant=rows[0]
    if(!grant||grant.status!=='INVITED')
      denied('HUITEACHER_OBSERVER_INVITATION_UNAVAILABLE',404)
    await schoolEvent(tx,{organizationId:grant.organizationId,
      eventId:grant.eventId,allowDraft:true,allowClosed:true})
    const changed=await tx.huiteacherObserverGrant.update({
      where:{id:input.invitationId},
      data:{status:'ACCEPTED',acceptedAt:new Date(),revision:{increment:1}},
    })
    await appendAudit(tx,{organizationId:grant.organizationId,
      actorUserId:input.userId,action:'HUITEACHER_OBSERVER_ACCEPTED',
      targetType:'EVALUATION_EVENT',targetId:grant.eventId,
      domainEventId:randomUUID(),payload:{grantId:changed.id},
    })
    return {id:changed.id,eventId:grant.eventId,status:'ACCEPTED' as const}
  })
}

/** Manager-readable role/expiry list, not evaluator raw responses or notes. */
export async function listHuiteacherObserverGrants(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    await schoolEvent(tx,{organizationId:input.organizationId,
      eventId:input.eventId,allowDraft:true,allowClosed:true})
    const list=await tx.huiteacherObserverGrant.findMany({
      where:{organizationId:input.organizationId,eventId:input.eventId},
      orderBy:{createdAt:'desc'},take:101,
      select:{id:true,observerUserId:true,role:true,status:true,
        expiresAt:true,acceptedAt:true,revokedAt:true,revision:true},
    })
    return {list:list.slice(0,100),truncated:list.length>100}
  })
}

export async function revokeHuiteacherObserver(input:{
  organizationId:string;eventId:string;actorUserId:string;observerUserId:string
}){
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    const changed=await tx.huiteacherObserverGrant.updateMany({
      where:{organizationId:input.organizationId,eventId:input.eventId,
        observerUserId:input.observerUserId,status:{in:['INVITED','ACCEPTED']}},
      data:{status:'REVOKED',revokedAt:new Date(),revision:{increment:1}},
    })
    if(changed.count!==1)denied('HUITEACHER_OBSERVER_GRANT_NOT_FOUND',404)
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_OBSERVER_REVOKED',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),payload:{observerUserId:input.observerUserId},
    })
    return {revoked:true}
  })
}

export async function myHuiteacherFieldAssignments(userId:string){
  return prisma.$transaction(async tx=>{
    await validEducationActor(tx,userId)
    const rows=await tx.$queryRaw<Array<{
      organizationId:string;eventId:string;title:string;kind:string;
      role:string;expiresAt:Date;invitationId:string;status:string
    }>>`
      SELECT grant_row."organization_id" AS "organizationId",
        grant_row."event_id" AS "eventId",
        event."title",event."kind",grant_row."role",
        grant_row."expires_at" AS "expiresAt",
        grant_row."id" AS "invitationId",grant_row."status"
      FROM "huiteacher_observer_grants" grant_row
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=grant_row."organization_id"
        AND event."id"=grant_row."event_id"
        AND event."status" IN ('DRAFT','OPEN')
      JOIN "education_product_entitlements" entitlement
        ON entitlement."organization_id"=event."organization_id"
        AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
      WHERE grant_row."observer_user_id"=${userId}
        AND grant_row."status" IN ('INVITED','ACCEPTED')
        AND grant_row."expires_at">statement_timestamp()
      ORDER BY grant_row."created_at" DESC LIMIT 101
    `
    return {list:rows.slice(0,100),truncated:rows.length>100}
  })
}

const contentOk=(body:string)=>{
  const str=body.trim()
  if(!str||str.length>12000)denied('HUITEACHER_OBSERVATION_CONTENT_INVALID',400)
  return str
}
const encrypted=(body:string)=>encryptUnifiedRuntimePayload({
  schemaVersion:1 as const,product:'HUITEACHER' as const,kind:'FIELD_NOTE' as const,
  content:contentOk(body),
})
const plain=(cipher:string)=>{
  const value=decryptUnifiedRuntimePayload<{
    schemaVersion:number;product:string;kind:string;content:string
  }>(cipher)
  if(value?.schemaVersion!==1||value.product!=='HUITEACHER'
    ||value.kind!=='FIELD_NOTE'||typeof value.content!=='string')
    denied('HUITEACHER_OBSERVATION_CIPHER_INVALID')
  return value.content
}
export async function createHuiteacherObservation(input:{
  organizationId:string;eventId:string;actorUserId:string;
  kind:TeacherObservationKind;content:string
}){
  return prisma.$transaction(async tx=>{
    await schoolEvent(tx,input)
    await activeObserver(tx,{organizationId:input.organizationId,
      eventId:input.eventId,userId:input.actorUserId})
    const item=await tx.huiteacherObservationRecord.create({data:{
      id:randomUUID(),organizationId:input.organizationId,
      eventId:input.eventId,observerUserId:input.actorUserId,
      kind:input.kind,status:'DRAFT',bodyCipher:encrypted(input.content),
    }})
    return {id:item.id,eventId:item.eventId,kind:item.kind,
      status:'DRAFT' as const,revision:item.revision}
  })
}
export async function updateHuiteacherObservation(input:{
  id:string;actorUserId:string;expectedRevision:number;content:string
}){
  return prisma.$transaction(async tx=>{
    const item=await tx.huiteacherObservationRecord.findUnique({where:{id:input.id}})
    if(!item||item.observerUserId!==input.actorUserId)
      denied('HUITEACHER_OBSERVATION_NOT_FOUND',404)
    await schoolEvent(tx,{organizationId:item.organizationId,eventId:item.eventId})
    await activeObserver(tx,{organizationId:item.organizationId,
      eventId:item.eventId,userId:input.actorUserId})
    const updated=await tx.huiteacherObservationRecord.updateMany({where:{
      id:input.id,observerUserId:input.actorUserId,
      status:'DRAFT',revision:input.expectedRevision,
    },data:{bodyCipher:encrypted(input.content),revision:{increment:1},
      updatedAt:new Date()},
    })
    if(updated.count!==1)denied('HUITEACHER_OBSERVATION_REVISION_CHANGED')
    return {id:input.id,status:'DRAFT' as const,revision:input.expectedRevision+1}
  })
}
export async function submitHuiteacherObservation(input:{
  id:string;actorUserId:string;expectedRevision:number;
  fieldFormId?:string;answers?:Record<string,unknown>
}){
  return prisma.$transaction(async tx=>{
    const item=await tx.huiteacherObservationRecord.findUnique({where:{id:input.id}})
    if(!item||item.observerUserId!==input.actorUserId)
      denied('HUITEACHER_OBSERVATION_NOT_FOUND',404)
    await schoolEvent(tx,{organizationId:item.organizationId,eventId:item.eventId})
    await activeObserver(tx,{organizationId:item.organizationId,
      eventId:item.eventId,userId:input.actorUserId})
    if(item.status!=='DRAFT'||item.revision!==input.expectedRevision)
      denied('HUITEACHER_OBSERVATION_REVISION_CHANGED')
    const bound=await readBoundHuiteacherFieldForm(tx,{
      organizationId:item.organizationId,eventId:item.eventId,
    })
    if(bound&&item.kind==='FORMAL_FEEDBACK'){
      if(input.fieldFormId!==bound.formId||!input.answers
        ||typeof input.answers!=='object'||Array.isArray(input.answers))
        denied('HUITEACHER_FIELD_FORM_REQUIRED',400)
      if(JSON.stringify(input.answers).length>262144)
        denied('HUITEACHER_FIELD_FORM_TOO_LARGE',413)
      let output:ReturnType<typeof dryRunSurveyForm>
      try{output=dryRunSurveyForm(bound.definition,input.answers)}
      catch(e){
        if(e instanceof SurveyFinalValidationError)
          denied('HUITEACHER_FIELD_FORM_ANSWERS_INVALID',400)
        throw e
      }
      const payload={
        schemaVersion:1 as const,kind:'FIELD_FORM_OBSERVATION' as const,
        product:'HUITEACHER' as const,recordId:item.id,eventId:item.eventId,
        formId:bound.formId,definitionDigest:bound.definitionDigest,
        rawAnswers:output.rawAnswers,missing:output.missing,
        privateScoring:null,
      }
      await tx.huiteacherFieldFormEvidence.create({data:{
        id:randomUUID(),organizationId:item.organizationId,eventId:item.eventId,
        recordId:item.id,formId:bound.formId,
        definitionDigest:bound.definitionDigest,
        answersCipher:encryptUnifiedRuntimePayload(payload),
        answersHash:canonicalHash(payload),
      }})
    }else if(input.fieldFormId||input.answers){
      denied('HUITEACHER_FIELD_FORM_NOT_APPLICABLE',400)
    }
    const changed=await tx.huiteacherObservationRecord.updateMany({where:{
      id:input.id,observerUserId:input.actorUserId,status:'DRAFT',
      revision:input.expectedRevision,
    },data:{status:'SUBMITTED',submittedAt:new Date(),
      revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)denied('HUITEACHER_OBSERVATION_REVISION_CHANGED')
    await appendAudit(tx,{organizationId:item.organizationId,
      actorUserId:input.actorUserId,
      action:item.kind==='PRIVATE_REFLECTION'
        ?'HUITEACHER_PRIVATE_REFLECTION_SUBMITTED'
        :'HUITEACHER_FORMAL_OBSERVATION_SUBMITTED',
      targetType:'EVALUATION_EVENT',targetId:item.eventId,
      domainEventId:randomUUID(),payload:{kind:item.kind,recordId:item.id,
        structuredFieldFormId:bound&&item.kind==='FORMAL_FEEDBACK'?bound.formId:null},
    })
    return {id:item.id,status:'SUBMITTED' as const,
      revision:input.expectedRevision+1}
  })
}
export async function readOwnHuiteacherObservations(userId:string){
  return prisma.$transaction(async tx=>{
    await validEducationActor(tx,userId)
    const rows=await tx.huiteacherObservationRecord.findMany({
      where:{observerUserId:userId},orderBy:{createdAt:'desc'},take:101,
      select:{id:true,eventId:true,kind:true,status:true,bodyCipher:true,
        revision:true,createdAt:true,submittedAt:true},
    })
    return {list:rows.slice(0,100).map(({bodyCipher,...row})=>({
      ...row,content:plain(bodyCipher),
    })),truncated:rows.length>100}
  })
}
/** Managers only see finalized explicitly shareable observations, never an
 * expert's private reflections, even after their project/grant expires.
 */
export async function readFormalHuiteacherObservations(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    const rows=await tx.huiteacherObservationRecord.findMany({
      where:{organizationId:input.organizationId,eventId:input.eventId,
        kind:{in:['FACT','FORMAL_FEEDBACK']},status:'SUBMITTED'},
      orderBy:{submittedAt:'asc'},take:101,
      select:{id:true,observerUserId:true,kind:true,status:true,
        bodyCipher:true,submittedAt:true},
    })
    // Do not expose observer-level raw identity to a school group report.
    return {list:rows.slice(0,100).map(({bodyCipher,observerUserId,...row})=>({
      ...row,content:plain(bodyCipher),
    })),truncated:rows.length>100}
  })
}
