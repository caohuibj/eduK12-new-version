import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  surveyKindSchema, surveyKeySchema, assertSurveyDraft, initialSurveyDefinition,
  validateSurveyDraft, type SurveyKind, type SurveyDraft,
} from './builder.definition'

type Tx=Prisma.TransactionClient
export class SurveyBuilderError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
const fail=(code:number,text:string):never=>{throw new SurveyBuilderError(code,text)}
const publicRow=(row:any)=>({
  id:row.id,projectId:row.projectId,instrumentKey:row.instrumentKey,
  kind:row.kind,title:row.title,definition:row.definition,revision:row.revision,
  status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,
})

async function authorizedProject(tx:Tx,userId:string,projectId:string,write:boolean){
  const rows=await tx.$queryRaw<Array<{id:string;status:string}>>`
    SELECT p.id,p.status FROM "survey_projects" p
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE p.id=${projectId} AND p.owner_user_id=${userId}
      AND u.account_domain='SURVEY' AND u.is_active=TRUE AND u.is_frozen=FALSE
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled=TRUE
    LIMIT 1
  `
  const project=rows[0]
  if(!project)fail(404,'研究项目不存在')
  if(write&&project.status!=='DRAFT')fail(409,'仅可编辑未归档的研究项目')
  return project
}
async function findDraft(tx:Tx,projectId:string,id:string){
  const row=await tx.surveyInstrumentDraft.findFirst({where:{id,projectId}})
  if(!row)fail(404,'研究工具不存在')
  return row!
}
const persistable=(definition:SurveyDraft):Prisma.InputJsonValue=>
  JSON.parse(JSON.stringify(definition)) as Prisma.InputJsonValue

export async function listDrafts(userId:string,projectId:string,page:number) {
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,false)
    const list=await tx.surveyInstrumentDraft.findMany({
      where:{projectId},orderBy:[{updatedAt:'desc'},{id:'desc'}],
      take:25,skip:(page-1)*25,
      select:{id:true,projectId:true,instrumentKey:true,kind:true,title:true,status:true,revision:true,updatedAt:true,createdAt:true},
    })
    return {page,pageSize:25,list}
  })
}
export async function getDraft(userId:string,projectId:string,id:string){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,false)
    return publicRow(await findDraft(tx,projectId,id))
  })
}
export async function createDraft(userId:string,projectId:string,raw:{
  requestId:string;instrumentKey:string;kind:SurveyKind;title:string;
}){
  const kind=surveyKindSchema.parse(raw.kind)
  const instrumentKey=surveyKeySchema.parse(raw.instrumentKey)
  const initial=initialSurveyDefinition(kind)
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,true)
    const existing=await tx.surveyInstrumentDraft.findUnique({where:{id:raw.requestId}})
    if(existing){
      if(existing.projectId!==projectId||existing.instrumentKey!==instrumentKey
        ||existing.kind!==kind||existing.title!==raw.title)fail(409,'创建研究工具请求冲突')
      return publicRow(existing)
    }
    if(await tx.surveyInstrumentDraft.findFirst({where:{projectId,instrumentKey}}))
      fail(409,'工具编码已存在')
    const row=await tx.surveyInstrumentDraft.create({data:{
      id:raw.requestId,projectId,instrumentKey,kind,title:raw.title,
      definition:persistable(initial),
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,action:'INSTRUMENT_CREATED',
      metadata:{instrumentId:row.id,kind}}})
    return publicRow(row)
  })
}
export async function updateDraft(userId:string,projectId:string,id:string,
  input:{revision:number;title:string;definition:unknown}){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,true)
    const row=await findDraft(tx,projectId,id)
    if(row.status!=='DRAFT'||row.revision!==input.revision)fail(409,'草稿版本已变化，请获取最新内容后再保存')
    const definition=assertSurveyDraft(surveyKindSchema.parse(row.kind),input.definition)
    const changed=await tx.surveyInstrumentDraft.updateMany({
      where:{id,projectId,revision:input.revision,status:'DRAFT'},
      data:{title:input.title,definition:persistable(definition),revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)fail(409,'其他编辑会话已修改此研究工具')
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,action:'INSTRUMENT_UPDATED',
      metadata:{instrumentId:id,revision:input.revision+1,definitionDigest:canonicalHash(definition)}}})
    return publicRow(await findDraft(tx,projectId,id))
  })
}
export async function copyDraft(userId:string,projectId:string,id:string,input:{
  requestId:string;instrumentKey:string;title:string
}){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,true)
    const from=await findDraft(tx,projectId,id)
    const prior=await tx.surveyInstrumentDraft.findUnique({where:{id:input.requestId}})
    if(prior){
      if(prior.projectId!==projectId||prior.instrumentKey!==input.instrumentKey||prior.title!==input.title)
        fail(409,'复制请求冲突')
      return publicRow(prior)
    }
    if(input.instrumentKey===from.instrumentKey)fail(409,'新的独立研究工具必须拥有新的工具编码')
    if(await tx.surveyInstrumentDraft.findFirst({where:{projectId,instrumentKey:input.instrumentKey}}))
      fail(409,'工具编码已存在')
    // Logical stable item IDs are namespaced by instrumentKey; the copy is a
    // new instrument, and PR3 never treats it as comparable merely by title.
    const created=await tx.surveyInstrumentDraft.create({data:{
      id:input.requestId,projectId,instrumentKey:input.instrumentKey,title:input.title,
      kind:from.kind,definition:from.definition as Prisma.InputJsonValue,
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,action:'INSTRUMENT_COPIED',
      metadata:{instrumentId:created.id,copiedFrom:id}}})
    return publicRow(created)
  })
}
export async function archiveDraft(userId:string,projectId:string,id:string,revision:number){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,true)
    await findDraft(tx,projectId,id)
    const changed=await tx.surveyInstrumentDraft.updateMany({
      where:{id,projectId,revision,status:'DRAFT'},
      data:{status:'ARCHIVED',revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)fail(409,'草稿状态或版本已发生变化')
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,action:'INSTRUMENT_ARCHIVED',
      metadata:{instrumentId:id}}})
    return publicRow(await findDraft(tx,projectId,id))
  })
}
export async function validateDraftForPreview(userId:string,projectId:string,id:string) {
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,userId,projectId,false)
    const row=await findDraft(tx,projectId,id)
    const kind=surveyKindSchema.parse(row.kind)
    const result=validateSurveyDraft(kind,row.definition,true)
    return {id,kind,revision:row.revision,ok:result.issues.every(i=>i.severity!=='error'),
      issues:result.issues,digest:result.digest,definition:result.definition}
  })
}
