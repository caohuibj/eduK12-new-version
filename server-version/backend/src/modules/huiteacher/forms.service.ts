import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { appendAudit } from '../organization/service'
import {
  validateSurveyDraft, type FormDraft, type Issue,
} from '../survey/builder.definition'
import { dryRunSurveyForm } from '../survey/final.compute'

export class HuiteacherFormError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409,public readonly issues:Issue[]=[]){
    super(code);this.name='HuiteacherFormError'
  }
}
const fail=(code:string,status=409,issues:Issue[]=[]):never=>{
  throw new HuiteacherFormError(code,status,issues)
}
type Tx=Prisma.TransactionClient
async function authorized(tx:Tx,org:string,actor:string) {
  const member=await resolveEducationProductMemberScope({
    organizationId:org,actorUserId:actor,product:'HUITEACHER',
  },tx)
  if(!member?.productAdmin)fail('HUITEACHER_FORM_MANAGER_REQUIRED',403)
}
const validate=(definition:unknown,publish:boolean)=>{
  const checked=validateSurveyDraft('FORM',definition,publish)
  if(!checked.definition||!checked.digest||checked.issues.some(i=>i.severity==='error'))
    fail('HUITEACHER_FORM_DEFINITION_INVALID',400,checked.issues)
  return checked as {definition:FormDraft;digest:string;issues:Issue[]}
}

export async function createHuiteacherForm(input:{
  organizationId:string;actorUserId:string;title:string
}){
  const title=input.title.trim()
  if(!title||title.length>200)fail('HUITEACHER_FORM_TITLE_INVALID',400)
  const initial={schemaVersion:2,pages:[]} as const
  const valid=validate(initial,false)
  return prisma.$transaction(async tx=>{
    await authorized(tx,input.organizationId,input.actorUserId)
    const id=randomUUID()
    const record=await tx.huiteacherFormInstrument.create({data:{
      id,organizationId:input.organizationId,title,
      definition:valid.definition as Prisma.InputJsonValue,
      definitionDigest:valid.digest,createdByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_FORM_CREATED',
      targetType:'TEACHER_FORM',targetId:id,domainEventId:randomUUID(),
      payload:{definitionDigest:valid.digest,version:1}})
    return {id:record.id,title:record.title,status:record.status,revision:record.revision}
  })
}
export async function readHuiteacherForm(input:{
  organizationId:string;actorUserId:string;formId:string
}){
  return prisma.$transaction(async tx=>{
    await authorized(tx,input.organizationId,input.actorUserId)
    const row=await tx.huiteacherFormInstrument.findFirst({
      where:{id:input.formId,organizationId:input.organizationId},
      select:{id:true,title:true,status:true,revision:true,definition:true,
        definitionDigest:true,publishedAt:true},
    })
    if(!row)fail('HUITEACHER_FORM_NOT_FOUND',404)
    return row
  })
}
export async function listHuiteacherForms(input:{
  organizationId:string;actorUserId:string;cursor?:string
}){
  return prisma.$transaction(async tx=>{
    await authorized(tx,input.organizationId,input.actorUserId)
    const rows=await tx.huiteacherFormInstrument.findMany({where:{
      organizationId:input.organizationId,
      ...(input.cursor?{id:{gt:input.cursor}}:{}),
    },orderBy:{id:'asc'},take:101,
      select:{id:true,title:true,status:true,revision:true,definitionDigest:true,
        publishedAt:true,createdAt:true}})
    return {list:rows.slice(0,100),nextCursor:rows.length>100?rows[99].id:null}
  })
}
export async function updateHuiteacherForm(input:{
  organizationId:string;actorUserId:string;formId:string;expectedRevision:number
  title:string;definition:unknown
}){
  const title=input.title.trim()
  if(!title||title.length>200)fail('HUITEACHER_FORM_TITLE_INVALID',400)
  if(!Number.isInteger(input.expectedRevision)||input.expectedRevision<1)
    fail('HUITEACHER_FORM_REVISION_INVALID',400)
  const valid=validate(input.definition,false)
  return prisma.$transaction(async tx=>{
    await authorized(tx,input.organizationId,input.actorUserId)
    const updated=await tx.huiteacherFormInstrument.updateMany({
      where:{id:input.formId,organizationId:input.organizationId,
        status:'DRAFT',revision:input.expectedRevision},
      data:{title,definition:valid.definition as Prisma.InputJsonValue,
        definitionDigest:valid.digest,revision:{increment:1}},
    })
    if(updated.count!==1)fail('HUITEACHER_FORM_DRAFT_CONFLICT')
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_FORM_UPDATED',
      targetType:'TEACHER_FORM',targetId:input.formId,domainEventId:randomUUID(),
      payload:{revision:input.expectedRevision+1,digest:valid.digest}})
    return {id:input.formId,title,revision:input.expectedRevision+1,definitionDigest:valid.digest}
  })
}
/** Publish only a science- and rights-reviewed FORM schema; no unscored Scale. */
export async function publishHuiteacherForm(input:{
  organizationId:string;actorUserId:string;formId:string;expectedRevision:number
}){
  return prisma.$transaction(async tx=>{
    await authorized(tx,input.organizationId,input.actorUserId)
    const row=await tx.huiteacherFormInstrument.findFirst({
      where:{id:input.formId,organizationId:input.organizationId},
    })
    if(!row)fail('HUITEACHER_FORM_NOT_FOUND',404)
    if(row.status!=='DRAFT'||row.revision!==input.expectedRevision)
      fail('HUITEACHER_FORM_REVISION_CHANGED')
    const result=validate(row.definition,true)
    // Survey research media assets are intentionally unavailable in Teacher.
    if(result.definition.pages.some(p=>p.questions.some(q=>q.image)))
      fail('HUITEACHER_FORM_IMAGE_REQUIRES_SEPARATE_LICENSED_ASSET',403)
    if(result.digest!==row.definitionDigest)fail('HUITEACHER_FORM_DIGEST_MISMATCH')
    const updated=await tx.huiteacherFormInstrument.updateMany({where:{
      id:row.id,organizationId:row.organizationId,
      revision:input.expectedRevision,status:'DRAFT',
    },data:{status:'PUBLISHED',publishedAt:new Date(),revision:{increment:1}}})
    if(updated.count!==1)fail('HUITEACHER_FORM_REVISION_CHANGED')
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_FORM_PUBLISHED',
      targetType:'TEACHER_FORM',targetId:row.id,domainEventId:randomUUID(),
      payload:{digest:result.digest,revision:input.expectedRevision+1}})
    return {id:row.id,status:'PUBLISHED' as const,revision:input.expectedRevision+1,digest:result.digest}
  })
}
/** Preview canonical Survey Form V2 validator; no new Attempt/FINAL is produced. */
export async function previewHuiteacherForm(input:{
  organizationId:string;actorUserId:string;formId:string;answers:unknown
}){
  const row=await readHuiteacherForm(input)
  const checked=validate(row.definition,true)
  if(checked.digest!==row.definitionDigest)fail('HUITEACHER_FORM_DIGEST_MISMATCH')
  return {...dryRunSurveyForm(checked.definition,input.answers),
    definitionDigest:checked.digest,score:null,reportPolicy:'COMPLETION_ONLY' as const}
}
