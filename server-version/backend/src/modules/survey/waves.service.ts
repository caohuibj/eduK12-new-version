import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { surveyKindSchema } from './builder.definition'
import { previewResearchInstrument } from './builder.compiler'
import { assertSurveyMediaOwned } from './media.references'
import { canonicalHash } from '../assessment-runtime/canonical'

type Tx=Prisma.TransactionClient
export class SurveyWaveError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
const fail=(status:number,message:string):never=>{throw new SurveyWaveError(status,message)}
async function ownProject(tx:Tx,uid:string,pid:string,write:boolean,lockForCreate=false){
  const rows=await tx.$queryRaw<Array<{id:string;status:string;collectionMode:string}>>`
    SELECT p.id,p.status,p.collection_mode AS "collectionMode"
    FROM "survey_projects" p
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE p.id=${pid} AND p.owner_user_id=${uid}
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled=TRUE
    ${lockForCreate
      ?Prisma.sql`FOR UPDATE OF p FOR SHARE OF u,g,m`
      :Prisma.sql`FOR SHARE OF p,u,g,m`}
  `
  if(!rows.length)fail(404,'研究项目不存在')
  if(write&&!['DRAFT','ACTIVE'].includes(rows[0].status))fail(409,'当前项目状态禁止编辑波次')
  return rows[0]
}
const ownWave=async(tx:Tx,pid:string,wid:string)=>{
  const row=await tx.surveyWave.findFirst({where:{id:wid,projectId:pid}})
  if(!row)fail(404,'研究波次不存在')
  return row!
}
export const MAX_WAVE_FINISH_GRACE_MS=2*60*60*1000
const ensureWindow=(input:{opensAt?:string|null;closesAt?:string|null;finishUntil?:string|null})=>{
  const open=input.opensAt?new Date(input.opensAt):null
  const close=input.closesAt?new Date(input.closesAt):null
  const finish=input.finishUntil?new Date(input.finishUntil):null
  if([open,close,finish].some(d=>d!==null&&!Number.isFinite(d.getTime())))
    fail(400,'采集时间必须是有效日期')
  if(open&&close&&open>=close)fail(400,'波次结束时间必须晚于开始时间')
  if(finish&&!close)fail(400,'指定在途截止时间时须明确设置采集结束时间')
  if(finish&&close&&(finish<close||finish.getTime()-close.getTime()>MAX_WAVE_FINISH_GRACE_MS))
    fail(400,'在途完成截止必须在采集结束后两小时内')
}
const exactDate=(left:Date|null,right:string|null|undefined)=>
  (left?.toISOString()??null)===(right?new Date(right).toISOString():null)
async function validateDraftRefs(tx:Tx,pid:string,ids:string[]){
  if(new Set(ids).size!==ids.length)fail(400,'同一波次的研究工具不可重复')
  if(!ids.length)return
  const rows=await tx.surveyInstrumentDraft.findMany({where:{projectId:pid,id:{in:ids}},
    select:{id:true,status:true}})
  if(rows.length!==ids.length||rows.some(x=>x.status!=='DRAFT'))
    fail(403,'有研究工具不属于当前项目或已归档')
}
export async function listWaves(uid:string,pid:string,page:number){
  return prisma.$transaction(async tx=>{
    await ownProject(tx,uid,pid,false)
    const list=await tx.surveyWave.findMany({where:{projectId:pid},
      orderBy:[{ordinal:'asc'}],take:25,skip:(page-1)*25,
      select:{id:true,projectId:true,title:true,ordinal:true,status:true,revision:true,
        opensAt:true,closesAt:true,quotaStarts:true,startsCount:true,allowNewParticipants:true,publicationId:true}})
    return {page,pageSize:25,list}
  })
}
export async function getWave(uid:string,pid:string,wid:string){
  return prisma.$transaction(async tx=>{
    await ownProject(tx,uid,pid,false)
    return ownWave(tx,pid,wid)
  })
}
type WaveInput={
  requestId:string;title:string;consentText:string;generalText?:string;instrumentIds:string[];
  opensAt?:string|null;closesAt?:string|null;finishUntil?:string|null;
  quotaStarts?:number|null;allowNewParticipants?:boolean;
  linkageNoticeConfirmed?:boolean
}
export async function createWave(uid:string,pid:string,input:WaveInput){
  ensureWindow(input)
  return prisma.$transaction(async tx=>{
    // Acquire the strongest project lock first. SHARE -> UPDATE promotion
    // can deadlock when two creators concurrently allocate the next ordinal.
    const project=await ownProject(tx,uid,pid,true,true)
    const existing=await tx.surveyWave.findUnique({where:{id:input.requestId}})
    if(existing){
      if(existing.projectId!==pid||existing.status!=='DRAFT'||existing.publicationId
        ||existing.revision!==0||existing.title!==input.title
        ||existing.consentText!==input.consentText
        ||existing.generalText!==(input.generalText??'')
        ||existing.linkageNoticeConfirmed!==(input.linkageNoticeConfirmed===true)
        ||JSON.stringify(existing.instrumentIds)!==JSON.stringify(input.instrumentIds)
        ||!exactDate(existing.opensAt,input.opensAt)
        ||!exactDate(existing.closesAt,input.closesAt)
        ||!exactDate(existing.finishUntil,input.finishUntil)
        ||existing.quotaStarts!==(input.quotaStarts??null)
        ||existing.allowNewParticipants!==(input.allowNewParticipants??false))
        fail(409,'同一波次创建请求 ID 已用于不同内容')
      return existing
    }
    await validateDraftRefs(tx,pid,input.instrumentIds)
    const ordinal=await tx.surveyWave.aggregate({where:{projectId:pid},_max:{ordinal:true}})
    const next=(ordinal._max.ordinal||0)+1
    if(next>100)fail(400,'首版单项目最多 100 个波次')
    const row=await tx.surveyWave.create({data:{
      id:input.requestId,projectId:pid,ordinal:next,title:input.title,
      consentText:input.consentText,generalText:input.generalText??'',consentVersion:1,
      linkageNoticeConfirmed:input.linkageNoticeConfirmed===true,
      instrumentIds:input.instrumentIds,
      status:'DRAFT',
      opensAt:input.opensAt?new Date(input.opensAt):null,
      closesAt:input.closesAt?new Date(input.closesAt):null,
      finishUntil:input.finishUntil?new Date(input.finishUntil):null,
      quotaStarts:input.quotaStarts??null,allowNewParticipants:input.allowNewParticipants??false,
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:uid,
      projectId:pid,action:'WAVE_DRAFT_CREATED',
      metadata:{waveId:row.id,ordinal:row.ordinal,collectionMode:project.collectionMode}}})
    return row
  })
}
type WaveUpdate=Omit<WaveInput,'requestId'>&{revision:number}
export async function updateWave(uid:string,pid:string,wid:string,input:WaveUpdate){
  ensureWindow(input)
  return prisma.$transaction(async tx=>{
    await ownProject(tx,uid,pid,true)
    const old=await ownWave(tx,pid,wid)
    if(old.status!=='DRAFT'||old.publicationId!==null||old.revision!==input.revision)
      fail(409,'仅能修改当前版本的未发布波次')
    await validateDraftRefs(tx,pid,input.instrumentIds)
    const changed=await tx.surveyWave.updateMany({
      where:{id:wid,projectId:pid,status:'DRAFT',publicationId:null,revision:input.revision},
      data:{title:input.title,consentText:input.consentText,generalText:input.generalText??'',instrumentIds:input.instrumentIds,
        linkageNoticeConfirmed:input.linkageNoticeConfirmed===true,
        opensAt:input.opensAt?new Date(input.opensAt):null,
        closesAt:input.closesAt?new Date(input.closesAt):null,
        finishUntil:input.finishUntil?new Date(input.finishUntil):null,
        quotaStarts:input.quotaStarts??null,
        allowNewParticipants:input.allowNewParticipants??false,
        revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)fail(409,'另一个研究者会话已修改波次')
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:uid,projectId:pid,
      action:'WAVE_DRAFT_UPDATED',metadata:{waveId:wid,revision:input.revision+1}}})
    return ownWave(tx,pid,wid)
  })
}
export async function preflightWave(uid:string,pid:string,wid:string){
  const input=await prisma.$transaction(async tx=>{
    const project=await ownProject(tx,uid,pid,false)
    const wave=await ownWave(tx,pid,wid)
    if(wave.status!=='DRAFT')fail(409,'发布后内容不可重新进行草稿预检')
    const ids=Array.isArray(wave.instrumentIds)?wave.instrumentIds.filter((x):x is string=>typeof x==='string'):[]
    if(ids.length!==(Array.isArray(wave.instrumentIds)?wave.instrumentIds.length:-1))fail(400,'工具引用格式错误')
    await validateDraftRefs(tx,pid,ids)
    const drafts=await tx.surveyInstrumentDraft.findMany({where:{projectId:pid,id:{in:ids}}})
    return {project,wave,drafts:ids.map(id=>drafts.find(d=>d.id===id)!),selected:ids}
  })
  const checks:Array<{key:string;ok:boolean;issues:string[];digest?:string}>=[]
  try{
    await prisma.$transaction(async tx=>{
      await ownProject(tx,uid,pid,false)
      await assertSurveyMediaOwned(tx,uid,pid,input.drafts.map(d=>({
        kind:surveyKindSchema.parse(d.kind),definition:d.definition,
      })))
    })
    checks.push({key:'media',ok:true,issues:[]})
  }catch(e){
    checks.push({key:'media',ok:false,
      issues:[e instanceof Error?e.message:'研究图片身份或授权不可用']})
  }
  const hasConsent=input.wave.consentText.trim().length>=20
  checks.push({key:'consent',ok:hasConsent,
    issues:hasConsent?[]:['研究说明与知情同意至少需要 20 字']})
  checks.push({key:'instruments',ok:input.selected.length>0,
    issues:input.selected.length?[]:['至少选择一个研究工具']})
  if(input.project.collectionMode==='LINKED_WAVES'){
    const linkedConfirmed=input.wave.linkageNoticeConfirmed===true
    checks.push({key:'linkage_disclosure',ok:linkedConfirmed,
      issues:linkedConfirmed?[]:['跨波次研究必须由研究者确认已明确告知：随机研究编号将关联不同时间点的答案']})
  }
  for(const draft of input.drafts){
    const compilation=previewResearchInstrument({
      kind:surveyKindSchema.parse(draft.kind),instrumentKey:draft.instrumentKey,
      title:draft.title,definition:draft.definition,
    })
    checks.push({key:draft.id,ok:compilation.ok,
      issues:compilation.issues.map(issue=>issue.path+': '+issue.message),
      digest:compilation.definitionDigest})
  }
  // This preflight is NOT a publish operation. It writes no Participant, Wave
  // Attempt, public token or scientific catalog status.
  return {projectId:pid,waveId:wid,revision:input.wave.revision,
    selectionDigest:canonicalHash(input.selected),checks,
    ok:checks.length===input.selected.length+(input.project.collectionMode==='LINKED_WAVES'?4:3)&&checks.every(c=>c.ok),
    publicationReady:process.env.SURVEY_PUBLICATION_ENABLED==='true',
    reason:process.env.SURVEY_PUBLICATION_ENABLED==='true'
      ?'研究专用 FINAL 可用，仍需以当前发布版本完成预检'
      :'公开采集未开启；需要最终 CI 和部署授权'}
}
