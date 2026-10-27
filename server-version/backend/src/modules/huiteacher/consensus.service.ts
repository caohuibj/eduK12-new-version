import { createHash,randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

type Tx=Prisma.TransactionClient
export class HuiteacherConsensusError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherConsensusError'
  }
}
const deny=(code:string,statusCode=409):never=>{
  throw new HuiteacherConsensusError(code,statusCode)
}
const safeText=(value:string,max:number)=>{
  const text=value.trim()
  if(!text||text.length>max)deny('HUITEACHER_CONSENSUS_TEXT_INVALID',400)
  return text
}
const cipher=(body:string)=>encryptUnifiedRuntimePayload({
  schemaVersion:1 as const,product:'HUITEACHER' as const,
  kind:'FIELD_CONSENSUS' as const,content:safeText(body,12000),
})
const plain=(value:string)=>{
  const data=decryptUnifiedRuntimePayload<{
    schemaVersion:number;product:string;kind:string;content:string
  }>(value)
  if(data?.schemaVersion!==1||data.product!=='HUITEACHER'
    ||data.kind!=='FIELD_CONSENSUS'||typeof data.content!=='string')
    deny('HUITEACHER_CONSENSUS_INTEGRITY',409)
  return data.content
}
const digestCipher=(value:string)=>createHash('sha256').update(value).digest('hex')
const kinds=['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'] as const

async function manager(tx:Tx,organizationId:string,actorUserId:string){
  const scope=await resolveEducationProductMemberScope({
    organizationId,actorUserId,product:'HUITEACHER',
  },tx)
  if(!scope?.productAdmin)deny('HUITEACHER_CONSENSUS_MANAGER_REQUIRED',403)
}
async function fieldEvent(tx:Tx,organizationId:string,eventId:string){
  const rows=await tx.$queryRaw<Array<{id:string;kind:string;status:string}>>`
    SELECT event."id",event."kind",event."status"
    FROM "huiteacher_evaluation_events" event
    JOIN "organizations" org ON org."id"=event."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
    JOIN "education_product_entitlements" e
      ON e."organization_id"=event."organization_id"
      AND e."product"='HUITEACHER' AND e."status"='ACTIVE'
    WHERE event."organization_id"=${organizationId} AND event."id"=${eventId}
    FOR SHARE OF event,org,e
  `
  const event=rows[0]
  if(!event||!kinds.some(kind=>kind===event.kind))
    deny('HUITEACHER_CONSENSUS_EVENT_NOT_FOUND',404)
  return event
}
type Source={
  id:string;observerUserId:string;kind:string;status:string;
  bodyCipher:string;revision:number
}
async function sources(tx:Tx,organizationId:string,eventId:string,ids:string[]){
  if(ids.length<2||ids.length>30||new Set(ids).size!==ids.length)
    deny('HUITEACHER_CONSENSUS_SOURCES_INVALID',400)
  const rows=await tx.$queryRaw<Source[]>(Prisma.sql`
    SELECT note."id",note."observer_user_id" AS "observerUserId",
      note."kind",note."status",note."body_cipher" AS "bodyCipher",
      note."revision"
    FROM "huiteacher_observation_records" note
    WHERE note."organization_id"=${organizationId}
      AND note."event_id"=${eventId}
      AND note."id" IN (${Prisma.join(ids)})
    ORDER BY note."id" FOR SHARE
  `)
  if(rows.length!==ids.length||rows.some(row=>
    row.status!=='SUBMITTED'||!['FORMAL_FEEDBACK','FACT'].includes(row.kind)))
    deny('HUITEACHER_CONSENSUS_SOURCE_NOT_FINAL',409)
  const independent=new Set(rows.filter(row=>row.kind==='FORMAL_FEEDBACK')
    .map(row=>row.observerUserId))
  if(independent.size<2)deny('HUITEACHER_CONSENSUS_REQUIRES_TWO_INDEPENDENT_RATERS',409)
  return rows
}
async function readSources(tx:Tx,input:{
  organizationId:string;eventId:string;consensusId:string
}){
  const rows=await tx.$queryRaw<Array<{
    recordId:string;sourceCipherHash:string;
    observerUserId:string;kind:string;bodyCipher:string;status:string
  }>>`
    SELECT ref."record_id" AS "recordId",
      ref."source_cipher_hash" AS "sourceCipherHash",
      note."observer_user_id" AS "observerUserId",
      note."kind",note."body_cipher" AS "bodyCipher",note."status"
    FROM "huiteacher_field_consensus_sources" ref
    JOIN "huiteacher_observation_records" note
      ON note."organization_id"=ref."organization_id"
      AND note."event_id"=ref."event_id"
      AND note."id"=ref."record_id"
    WHERE ref."organization_id"=${input.organizationId}
      AND ref."event_id"=${input.eventId}
      AND ref."consensus_id"=${input.consensusId}
    ORDER BY ref."record_id"
  `
  if(rows.length<2||rows.some(row=>
      row.status!=='SUBMITTED'||row.kind==='PRIVATE_REFLECTION'
      ||digestCipher(row.bodyCipher)!==row.sourceCipherHash))
    deny('HUITEACHER_CONSENSUS_SOURCE_INTEGRITY',409)
  const authors=new Set(rows.filter(r=>r.kind==='FORMAL_FEEDBACK').map(r=>r.observerUserId))
  if(authors.size<2)deny('HUITEACHER_CONSENSUS_INDEPENDENCE_LOST')
  return {rows,authors}
}
async function load(tx:Tx,id:string){
  const drafts=await tx.$queryRaw<Array<{
    id:string;organizationId:string;eventId:string;title:string;
    bodyCipher:string;status:string;revision:number;createdByUserId:string;
    submittedAt:Date|null
  }>>`
    SELECT "id","organization_id" AS "organizationId",
      "event_id" AS "eventId","title","body_cipher" AS "bodyCipher",
      "status","revision","created_by_user_id" AS "createdByUserId",
      "submitted_at" AS "submittedAt"
    FROM "huiteacher_field_consensuses" WHERE "id"=${id} FOR SHARE
  `
  if(!drafts[0])deny('HUITEACHER_CONSENSUS_NOT_FOUND',404)
  return drafts[0]
}
const digest=(record:{id:string;revision:number;title:string;bodyCipher:string;status?:string},
  src:Array<{recordId:string;sourceCipherHash:string}>)=>canonicalHash({
  schemaVersion:1,product:'HUITEACHER',kind:'HUMAN_REVIEWED_CONSENSUS',
  consensusId:record.id,
  revision:record.status==='SUBMITTED'?record.revision-1:record.revision,
  title:record.title,
  bodyCipherHash:digestCipher(record.bodyCipher),
  evidence:src.map(x=>({id:x.recordId,digest:x.sourceCipherHash})),
})
const payload=(r:Awaited<ReturnType<typeof load>>,src:Awaited<ReturnType<typeof readSources>>,
  approvals:number)=>({
  id:r.id,organizationId:r.organizationId,eventId:r.eventId,
  title:r.title,content:plain(r.bodyCipher),status:r.status,revision:r.revision,
  digest:digest(r,src.rows),sourceRecordIds:src.rows.map(x=>x.recordId),
  independentEvaluatorCount:src.authors.size,approvalCount:approvals,
  submittedAt:r.submittedAt,
})
async function approvedObservers(tx:Tx,r:Awaited<ReturnType<typeof load>>,
  src:Awaited<ReturnType<typeof readSources>>){
  const approvals=await tx.huiteacherFieldConsensusApproval.findMany({
    where:{consensusId:r.id,
      revision:r.status==='SUBMITTED'?r.revision-1:r.revision,
      contentHash:digest(r,src.rows)},
    select:{observerUserId:true},
  })
  return new Set(approvals.filter(x=>src.authors.has(x.observerUserId))
    .map(x=>x.observerUserId))
}
async function approvalCount(tx:Tx,r:Awaited<ReturnType<typeof load>>,src:Awaited<ReturnType<typeof readSources>>){
  return (await approvedObservers(tx,r,src)).size
}
async function eligibleReviewer(tx:Tx,record:Awaited<ReturnType<typeof load>>,
  src:Awaited<ReturnType<typeof readSources>>,userId:string){
  if(!src.authors.has(userId))deny('HUITEACHER_CONSENSUS_REVIEWER_NOT_SOURCED',403)
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT actor."id" FROM "users" actor
    JOIN "huiteacher_observer_grants" grant_row
      ON grant_row."observer_user_id"=actor."id"
      AND grant_row."organization_id"=${record.organizationId}
      AND grant_row."event_id"=${record.eventId}
      AND grant_row."status"='ACCEPTED'
      AND grant_row."accepted_at" IS NOT NULL
      AND grant_row."revoked_at" IS NULL
      AND grant_row."expires_at">statement_timestamp()
    WHERE actor."id"=${userId}
      AND actor."account_domain"='SCHOOL'
      AND actor."role" IN ('TEACHER','ADMIN')
      AND actor."teacher_approved"=TRUE AND actor."is_active"=TRUE
      AND actor."is_frozen"=FALSE AND actor."must_change_password"=FALSE
      AND (actor."expires_at" IS NULL OR actor."expires_at">statement_timestamp())
    FOR SHARE OF actor,grant_row
  `
  if(!rows.length)deny('HUITEACHER_CONSENSUS_REVIEW_AUTH_REVOKED',403)
}
export async function createHuiteacherFieldConsensus(input:{
  organizationId:string;eventId:string;actorUserId:string;
  title:string;content:string;sourceRecordIds:string[]
}){
  const title=safeText(input.title,200),body=cipher(input.content)
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    const event=await fieldEvent(tx,input.organizationId,input.eventId)
    if(event.status!=='CLOSED')deny('HUITEACHER_CONSENSUS_EVENT_MUST_CLOSE')
    const sourceRows=await sources(tx,input.organizationId,input.eventId,input.sourceRecordIds)
    const id=randomUUID()
    const consensus=await tx.huiteacherFieldConsensus.create({data:{
      id,organizationId:input.organizationId,eventId:input.eventId,title,
      bodyCipher:body,createdByUserId:input.actorUserId,status:'DRAFT',
    }})
    await tx.huiteacherFieldConsensusSource.createMany({
      data:sourceRows.map(row=>({
        organizationId:input.organizationId,eventId:input.eventId,
        consensusId:id,recordId:row.id,sourceCipherHash:digestCipher(row.bodyCipher),
      })),
    })
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_CONSENSUS_DRAFT_CREATED',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),
      payload:{consensusId:id,independentContributors:
        new Set(sourceRows.filter(r=>r.kind==='FORMAL_FEEDBACK').map(r=>r.observerUserId)).size,
        citedRecords:sourceRows.length},
    })
    const src=await readSources(tx,{organizationId:input.organizationId,
      eventId:input.eventId,consensusId:id})
    return payload({
      id,organizationId:input.organizationId,eventId:input.eventId,title,
      bodyCipher:consensus.bodyCipher,status:consensus.status,
      revision:1,createdByUserId:input.actorUserId,submittedAt:null,
    },src,0)
  })
}
export async function updateHuiteacherFieldConsensus(input:{
  actorUserId:string;consensusId:string;expectedRevision:number;
  title:string;content:string
}){
  const title=safeText(input.title,200),body=cipher(input.content)
  return prisma.$transaction(async tx=>{
    const r=await load(tx,input.consensusId)
    await manager(tx,r.organizationId,input.actorUserId)
    if(r.status!=='DRAFT'||r.revision!==input.expectedRevision)
      deny('HUITEACHER_CONSENSUS_REVISION_CONFLICT')
    await fieldEvent(tx,r.organizationId,r.eventId)
    const changed=await tx.huiteacherFieldConsensus.updateMany({
      where:{id:r.id,organizationId:r.organizationId,revision:r.revision,status:'DRAFT'},
      data:{title,bodyCipher:body,revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)deny('HUITEACHER_CONSENSUS_REVISION_CONFLICT')
    const updated={...r,title,bodyCipher:body,revision:r.revision+1}
    const src=await readSources(tx,{organizationId:r.organizationId,eventId:r.eventId,consensusId:r.id})
    await appendAudit(tx,{organizationId:r.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_CONSENSUS_DRAFT_REVISED',
      targetType:'EVALUATION_EVENT',targetId:r.eventId,
      domainEventId:randomUUID(),payload:{consensusId:r.id,revision:updated.revision},
    })
    return payload(updated,src,0)
  })
}
export async function readHuiteacherFieldConsensus(input:{
  actorUserId:string;consensusId:string
}){
  return prisma.$transaction(async tx=>{
    const r=await load(tx,input.consensusId)
    await manager(tx,r.organizationId,input.actorUserId)
    await fieldEvent(tx,r.organizationId,r.eventId)
    const src=await readSources(tx,{organizationId:r.organizationId,eventId:r.eventId,consensusId:r.id})
    return payload(r,src,await approvalCount(tx,r,src))
  })
}
export async function listHuiteacherFieldConsensuses(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    await manager(tx,input.organizationId,input.actorUserId)
    await fieldEvent(tx,input.organizationId,input.eventId)
    const records=await tx.huiteacherFieldConsensus.findMany({where:{
      organizationId:input.organizationId,eventId:input.eventId,
    },orderBy:{createdAt:'desc'},take:51,
    select:{id:true,title:true,status:true,revision:true,submittedAt:true}})
    return {list:records.slice(0,50),truncated:records.length>50}
  })
}
export async function myHuiteacherConsensusReviews(actorUserId:string){
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string}>>`
      SELECT DISTINCT consensus."id"
      FROM "huiteacher_field_consensuses" consensus
      JOIN "huiteacher_field_consensus_sources" citation
        ON citation."consensus_id"=consensus."id"
        AND citation."organization_id"=consensus."organization_id"
        AND citation."event_id"=consensus."event_id"
      JOIN "huiteacher_observation_records" note
        ON note."organization_id"=citation."organization_id"
        AND note."event_id"=citation."event_id"
        AND note."id"=citation."record_id"
        AND note."kind"='FORMAL_FEEDBACK'
        AND note."observer_user_id"=${actorUserId}
      JOIN "huiteacher_observer_grants" grant_row
        ON grant_row."organization_id"=consensus."organization_id"
        AND grant_row."event_id"=consensus."event_id"
        AND grant_row."observer_user_id"=${actorUserId}
        AND grant_row."status"='ACCEPTED'
        AND grant_row."revoked_at" IS NULL
        AND grant_row."expires_at">statement_timestamp()
      JOIN "education_product_entitlements" entitlement
        ON entitlement."organization_id"=consensus."organization_id"
        AND entitlement."product"='HUITEACHER'
        AND entitlement."status"='ACTIVE'
      JOIN "organizations" org ON org."id"=consensus."organization_id"
        AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
      JOIN "users" actor ON actor."id"=${actorUserId}
        AND actor."account_domain"='SCHOOL'
        AND actor."is_active"=TRUE AND actor."is_frozen"=FALSE
      ORDER BY consensus."id" DESC LIMIT 51
    `
    const list=[]
    for(const item of rows.slice(0,50)){
      const r=await load(tx,item.id)
      const src=await readSources(tx,{organizationId:r.organizationId,eventId:r.eventId,consensusId:r.id})
      const approved=await approvedObservers(tx,r,src)
      list.push({...payload(r,src,approved.size),approvedByMe:approved.has(actorUserId)})
    }
    return {list,truncated:rows.length>50}
  })
}
export async function approveHuiteacherFieldConsensus(input:{
  actorUserId:string;consensusId:string;expectedRevision:number;expectedDigest:string
}){
  return prisma.$transaction(async tx=>{
    const r=await load(tx,input.consensusId)
    const src=await readSources(tx,{organizationId:r.organizationId,eventId:r.eventId,consensusId:r.id})
    await eligibleReviewer(tx,r,src,input.actorUserId)
    if(r.status!=='DRAFT'||r.revision!==input.expectedRevision
      ||digest(r,src.rows)!==input.expectedDigest)
      deny('HUITEACHER_CONSENSUS_CHANGED_SINCE_REVIEW')
    const existed=await tx.huiteacherFieldConsensusApproval.findFirst({where:{
      consensusId:r.id,observerUserId:input.actorUserId,revision:r.revision,
    },select:{id:true,contentHash:true}})
    if(existed){
      if(existed.contentHash!==input.expectedDigest)deny('HUITEACHER_CONSENSUS_APPROVAL_CONFLICT')
      return {approved:true,id:r.id,revision:r.revision,replayed:true}
    }
    const inserted=await tx.huiteacherFieldConsensusApproval.createMany({skipDuplicates:true,data:[{
      id:randomUUID(),organizationId:r.organizationId,eventId:r.eventId,
      consensusId:r.id,observerUserId:input.actorUserId,revision:r.revision,
      contentHash:input.expectedDigest,
    }]})
    if(inserted.count===0){
      const concurrent=await tx.huiteacherFieldConsensusApproval.findFirst({where:{
        consensusId:r.id,observerUserId:input.actorUserId,revision:r.revision,
      },select:{id:true,contentHash:true}})
      if(!concurrent||concurrent.contentHash!==input.expectedDigest)deny('HUITEACHER_CONSENSUS_APPROVAL_CONFLICT')
      return {approved:true,id:r.id,revision:r.revision,replayed:true}
    }
    await appendAudit(tx,{organizationId:r.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_CONSENSUS_INDEPENDENT_APPROVAL',
      targetType:'EVALUATION_EVENT',targetId:r.eventId,
      domainEventId:randomUUID(),payload:{consensusId:r.id,revision:r.revision,
        digest:input.expectedDigest},
    })
    return {approved:true,id:r.id,revision:r.revision,replayed:false}
  })
}
export async function submitHuiteacherFieldConsensus(input:{
  actorUserId:string;consensusId:string;expectedRevision:number
}){
  return prisma.$transaction(async tx=>{
    const r=await load(tx,input.consensusId)
    await manager(tx,r.organizationId,input.actorUserId)
    const event=await fieldEvent(tx,r.organizationId,r.eventId)
    if(event.status!=='CLOSED'||r.status!=='DRAFT'||r.revision!==input.expectedRevision)
      deny('HUITEACHER_CONSENSUS_FINAL_UNAVAILABLE')
    const src=await readSources(tx,{organizationId:r.organizationId,eventId:r.eventId,consensusId:r.id})
    const approved=await approvalCount(tx,r,src)
    if(approved<2)deny('HUITEACHER_CONSENSUS_REQUIRES_TWO_APPROVALS')
    const changed=await tx.huiteacherFieldConsensus.updateMany({
      where:{id:r.id,revision:r.revision,status:'DRAFT'},
      data:{status:'SUBMITTED',submittedAt:new Date(),
        revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)deny('HUITEACHER_CONSENSUS_REVISION_CONFLICT')
    await appendAudit(tx,{organizationId:r.organizationId,actorUserId:input.actorUserId,
      action:'HUITEACHER_CONSENSUS_FINAL_SUBMITTED',
      targetType:'EVALUATION_EVENT',targetId:r.eventId,
      domainEventId:randomUUID(),payload:{
        consensusId:r.id,approvedRaters:approved,
        digest:digest(r,src.rows),sourceRecordCount:src.rows.length,
      },
    })
    return {id:r.id,status:'SUBMITTED' as const,revision:r.revision+1,
      independentApprovals:approved}
  })
}
