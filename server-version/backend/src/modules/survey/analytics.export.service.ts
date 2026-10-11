import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { prisma } from '../../config/database'
import { getSurveySessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload,encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadSurveySource } from './analytics.source'
import { rawLongExport,rawWideExport } from './analytics.raw-export'
import { exportLong,exportWide } from './analytics.export-format'
import { SurveyAnalyticsError } from './analytics.read'
import type { BoundedResearchExport } from './analytics.export-format'
import type { SurveyRawExport } from './analytics.raw-export'

type Format='RAW_WAVE'|'RAW_LONG'|'RAW_WIDE'|'SCORE_LONG'|'SCORE_WIDE'
export type SurveyExportArtifact={csv:string;codebook:unknown;manifest:unknown}
function fail(status:number,message:string): never {throw new SurveyAnalyticsError(status,message)}
const nowSeconds=()=>Math.floor(Date.now()/1000)
/** A real signed Survey MFA session, not an X-header or the old Teacher role. */
export function assertRecentSurveyMfa(req:Request):void{
  const bearer=getSurveySessionToken(req)
  const payload=bearer?verifyToken(bearer):null
  const verified=payload?.mfaVerifiedAt
  const now=nowSeconds()
  if(!payload||payload.accountDomain!=='SURVEY'||payload.userId!==req.user?.userId
    ||payload.tokenVersion!==req.user?.tokenVersion
    ||typeof verified!=='number'||verified>now||now-verified>300)
    fail(403,'导出包含研究原始数据，需要最近五分钟的 TOTP 二次验证')
}
const maxBytes=2*1024*1024
const artifactFor=(format:Format,projectId:string,source:Awaited<ReturnType<typeof loadSurveySource>>,waveId?:string)=>{
  if(format==='RAW_WAVE'){
    if(!waveId)fail(400,'单波次导出必须指定波次')
    return rawLongExport(projectId,source,waveId)
  }
  if(format==='RAW_LONG')return rawLongExport(projectId,source)
  if(format==='RAW_WIDE')return rawWideExport(projectId,source)
  if(format==='SCORE_LONG')return exportLong(projectId,source.scores)
  return exportWide(projectId,source.scores)
}
async function guardedOwner(tx:import('@prisma/client').Prisma.TransactionClient,uid:string,pid:string){
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT p.id FROM "survey_projects" p
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE p.id=${pid} AND p.owner_user_id=${uid}
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
    LIMIT 1 FOR SHARE OF p,u,g,m
  `
  if(!rows.length)fail(404,'无权限访问研究项目数据')
}
export async function createSurveyExport(req:Request,input:{
  projectId:string;format:Format;waveId?:string;
}){
  assertRecentSurveyMfa(req)
  const uid=req.user!.userId
  const sources=await loadSurveySource({actorUserId:uid,projectId:input.projectId,
    ...(input.waveId?{waveIds:[input.waveId]}:{}),maxFinals:250})
  if(input.format.includes('WIDE')&&sources.collectionMode!=='LINKED_WAVES')
    fail(409,'不可关联的匿名研究不支持跨波次个人宽表')
  let artifact:SurveyRawExport|BoundedResearchExport
  try{artifact=artifactFor(input.format,input.projectId,sources,input.waveId)}
  catch(e){fail(413,e instanceof Error?e.message:'研究数据超过安全导出上限')}
  const selectedVersions=[...new Map(sources.codebook.map(x=>[
    x.waveId+':'+x.instrumentKey+':'+x.definitionDigest,
    {waveId:x.waveId,instrumentKey:x.instrumentKey,
      publicationVersion:x.publicationVersion,
      instrumentRevision:x.instrumentRevision,
      definitionDigest:x.definitionDigest,scoringDigest:x.scoringDigest},
  ])).values()]
  const manifest={...artifact.manifest,sourceCutOff:sources.cutOff,
    completedFinalCount:sources.completeAttempts,selectedVersions,
    selection:{format:input.format,waveIds:input.waveId?[input.waveId]:null,
      researchOnly:true,collectionMode:sources.collectionMode}}
  const value:SurveyExportArtifact={csv:artifact.csv,codebook:artifact.codebook,manifest}
  const encoded=JSON.stringify(value)
  if(Buffer.byteLength(encoded,'utf8')>maxBytes)
    fail(413,'本次导出超过 2MB 的单请求上限，请缩小波次范围')
  const digest=canonicalHash(JSON.parse(encoded))
  const cipher=encryptUnifiedRuntimePayload(value)
  if(Buffer.byteLength(cipher,'utf8')>3900000)fail(413,'加密数据超过安全持久化预算')
  const id=randomUUID(),expiresAt=new Date(Date.now()+10*60000)
  await prisma.$transaction(async tx=>{
    await guardedOwner(tx,uid,input.projectId)
    await tx.surveyExportTicket.create({data:{
      id,projectId:input.projectId,actorUserId:uid,format:input.format,status:'READY',
      sourceDigest:canonicalHash(sources.scores.map(s=>s.sourceFinalHash).concat(
        sources.raw.map(r=>r.sourceFinalHash))),
      artifactHash:digest,artifactCipher:cipher,expiresAt,
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:uid,projectId:input.projectId,
      action:'RESEARCH_EXPORT_CREATED',metadata:{exportId:id,format:input.format,
        rowCount:artifact.manifest.rowCount,expiresAt:expiresAt.toISOString()}}})
  })
  return {id,status:'READY' as const,format:input.format,expiresAt,manifest}
}
export async function downloadSurveyExport(req:Request,input:{projectId:string;exportId:string}){
  assertRecentSurveyMfa(req)
  const uid=req.user!.userId
  return prisma.$transaction(async tx=>{
    await guardedOwner(tx,uid,input.projectId)
    const ticket=await tx.surveyExportTicket.findFirst({where:{
      id:input.exportId,projectId:input.projectId,actorUserId:uid,
      status:'READY',expiresAt:{gt:new Date()},
    }})
    if(!ticket)fail(404,'导出已过期、撤销或不存在')
    const data=decryptUnifiedRuntimePayload<SurveyExportArtifact>(ticket.artifactCipher)
    if(canonicalHash(JSON.parse(JSON.stringify(data)))!==ticket.artifactHash)
      fail(409,'导出内容摘要校验失败')
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:uid,projectId:input.projectId,
      action:'RESEARCH_EXPORT_DOWNLOADED',metadata:{exportId:ticket.id,format:ticket.format}}})
    return {id:ticket.id,format:ticket.format,...data}
  })
}

/** Bounded hourly cleanup: permanently erase expired encrypted source files
 * and metadata from the application database. The audit event remains.
 */
export async function cleanupExpiredSurveyExportTickets(now=new Date()):Promise<number>{
  const ids=await prisma.surveyExportTicket.findMany({
    where:{expiresAt:{lte:now}},select:{id:true},
    orderBy:{expiresAt:'asc'},take:100,
  })
  if(!ids.length)return 0
  const changed=await prisma.surveyExportTicket.deleteMany({
    where:{id:{in:ids.map(x=>x.id)},expiresAt:{lte:now}},
  })
  return changed.count
}
