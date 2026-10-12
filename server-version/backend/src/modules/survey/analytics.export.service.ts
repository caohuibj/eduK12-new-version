import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { prisma } from '../../config/database'
import { getSurveySessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload,encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadSurveySource } from './analytics.source'
import { isResearchFreeTextType } from './analytics.response-privacy'
import { rawLongExport,rawWideExport,compactSurveyAttendanceExport } from './analytics.raw-export'
import { exportLong,exportWide } from './analytics.export-format'
import { SurveyAnalyticsError } from './analytics.read'
import {encodeSurveyExportCursor,decodeSurveyExportCursor,type SurveyExportCursor} from './analytics.export-cursor'
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
  if(format==='SCORE_LONG')return exportLong(projectId,source.scores,source.attendance,source.scoreColumns)
  return exportWide(projectId,source.scores,source.attendance,source.scoreColumns)
}
async function guardedOwner(tx:import('@prisma/client').Prisma.TransactionClient,uid:string,pid:string){
  const rows=await tx.$queryRaw<Array<{id:string;revision:number}>>`
    SELECT p.id,p.revision FROM "survey_projects" p
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
  return rows[0]
}
export async function createSurveyExport(req:Request,input:{
  projectId:string;format:Format;waveId?:string;includeFreeText?:boolean;
  completedFrom?:string;completedBefore?:string;cursor?:string;
}){
  assertRecentSurveyMfa(req)
  const uid=req.user!.userId
  if((input.completedFrom||input.completedBefore)&&input.format!=='RAW_WAVE')
    fail(400,'当前仅允许对单波次原始数据按完成时间分段下载')
  const from=input.completedFrom?new Date(input.completedFrom):undefined
  const before=input.completedBefore?new Date(input.completedBefore):undefined
  if((from&&!Number.isFinite(from.getTime()))||(before&&!Number.isFinite(before.getTime()))
    ||(from&&before&&from>=before))
    fail(400,'导出时段必须是开始早于结束的合法时间')
  const paged=!!input.waveId&&['RAW_WAVE','RAW_LONG','SCORE_LONG'].includes(input.format)
  if(input.cursor&&!paged)fail(400,'此格式必须选定单个波次才能继续分批导出')
  const prior=input.cursor?decodeSurveyExportCursor(
    input.cursor,input.projectId,input.format as SurveyExportCursor['format'],input.waveId!,
  ):null
  if(prior&&(prior.completedFrom!==(input.completedFrom??null)
    ||prior.completedBefore!==(input.completedBefore??null)
    ||prior.freeTextIncluded!==(input.includeFreeText===true)))
    fail(400,'分批导出的时间筛选条件不能修改')
  if(input.includeFreeText&&input.format.startsWith('SCORE'))
    fail(400,'纯分数导出不适用自由文本选项')

  // V4 records each non-FINAL participant once, separate from verified FINAL
  // rows. Historical V1-V3 continuation remains byte/semantics compatible.
  const phased=!prior||prior.v>=3
  const compact=!prior||prior.v===4
  const attendanceOnly=!!prior&&prior.v>=3&&prior.phase==='ATTENDANCE'
  let pageLimit=compact&&prior?.v===4?prior.pageLimit!:250
  type Source=Awaited<ReturnType<typeof loadSurveySource>>
  let pinned:{cutOff:string;sourceRevision:number;
    sourceFinalCount:number|null;sourceAttendanceCount:number|null}|null=null
  let ready:{
    sources:Source;artifact:SurveyRawExport|BoundedResearchExport;
    nextCursor:string|null;pageNumber:number|null;
    digest:string;cipher:string;value:SurveyExportArtifact
    manifest:{schemaVersion:1|2;format:string;rowCount:number;columnCount:number;
      completedFinalCount:number;
      batch:{phase:string;representation:string;hasNext:boolean;
        totalIncludedFinals:number|null;totalNonFinalAttempts:number|null};
      selection:{format:Format;completedBefore:string|null;completedFrom:string|null};
      timingProvenance:string}
  }|null=null

  // A batch limit on people alone cannot bound a 240-item Scale or encrypted
  // free-text response. Retry only a true 413 capacity failure, halving the
  // FINAL count. The signed V4 cursor carries the successful next-page limit.
  // Never retry 400/403/409 data-integrity, ownership or cohort drift failures.
  for(;;){
    try{
      const fence=prior?{
        // Every FINAL continuation must advance the exact signed keyset.
        // Without afterFinal, V4 keeps exporting the first batch forever.
        ...(!attendanceOnly?{afterFinal:{id:prior.after.id,
          completedAt:new Date(prior.after.completedAt)}}:{}),
        snapshotCutOff:new Date(prior.cutOff),
        expectedSourceRevision:prior.sourceRevision,
        expectedFinalCount:prior.finalCount,
        ...(prior.v>=3?{expectedAttendanceCount:prior.attendanceCount}:{}),
      }:pinned?{
        snapshotCutOff:new Date(pinned.cutOff),
        expectedSourceRevision:pinned.sourceRevision,
        ...(pinned.sourceFinalCount!==null?{expectedFinalCount:pinned.sourceFinalCount}:{}),
        ...(pinned.sourceAttendanceCount!==null?{expectedAttendanceCount:pinned.sourceAttendanceCount}:{}),
      }:{}
      const sources=await loadSurveySource({
        actorUserId:uid,projectId:input.projectId,
        ...(input.waveId?{waveIds:[input.waveId]}:{}),
        maxFinals:pageLimit,
        // No frozen item matrix is needed by compact participant-status pages.
        includeWideSchema:!(attendanceOnly&&compact),
        completedFrom:from,completedBefore:before,
        ...(input.format.startsWith('SCORE')?{selectRaw:false}:{selectScore:false}),
        ...(paged?{
          pageMode:true,stableIdCursor:!prior||prior.v!==1,
          includeAttendance:false,
          ...(phased?{includeAttendanceCount:true}:{}),
          ...(attendanceOnly?{
            attendanceOnly:true,attendanceAfterId:prior?.afterAttemptId??undefined,
          }:{}),
        }:{}),
        ...fence,
      })
      if(!prior&&!pinned)pinned={
        cutOff:sources.cutOff,sourceRevision:sources.sourceRevision,
        sourceFinalCount:sources.sourceFinalCount??null,
        sourceAttendanceCount:sources.sourceAttendanceCount??null,
      }
      if(input.format.includes('WIDE')&&sources.collectionMode!=='LINKED_WAVES')
        fail(409,'不可关联的匿名研究不支持跨波次个人宽表')
      const nextPhase=attendanceOnly
        ?(sources.nextAttendanceCursor?'ATTENDANCE':null)
        :sources.nextFinalCursor?'FINALS'
          :phased&&sources.collectionMode==='LINKED_WAVES'&&
             (sources.sourceAttendanceCount??0)>0?'ATTENDANCE':null
      const maxPages=compact?500:prior?.v===3?200:100
      if(nextPhase&&(prior?.page??0)+1>=maxPages)
        fail(413,'研究数据超过受控导出页数上限；请缩小波次或采集范围')
      const dummyAfter={id:'00000000-0000-0000-0000-000000000000',
        completedAt:sources.cutOff}
      const after=nextPhase==='FINALS'?sources.nextFinalCursor!:
        prior?.after??dummyAfter
      const nextCursor=paged&&nextPhase?encodeSurveyExportCursor({
        v:prior?.v??4,projectId:input.projectId,waveId:input.waveId!,
        format:input.format as SurveyExportCursor['format'],after,
        ...(phased?{
          phase:nextPhase,attendanceCount:sources.sourceAttendanceCount??0,
          ...(nextPhase==='ATTENDANCE'?{
            afterAttemptId:attendanceOnly?sources.nextAttendanceCursor:null,
          }:{}),
        }:{}),
        ...(compact?{pageLimit}:{}),
        cutOff:sources.cutOff,sourceRevision:sources.sourceRevision,
        finalCount:sources.sourceFinalCount??0,
        page:(prior?.page??0)+1,issuedAt:Date.now(),
        completedFrom:input.completedFrom??null,completedBefore:input.completedBefore??null,
        freeTextIncluded:input.includeFreeText===true,
      }):null
      const pageNumber=paged?(prior?.page??0)+1:null
      const included=input.format.startsWith('RAW')&&input.includeFreeText===true
      const omittedFreeText=input.format.startsWith('RAW')&&!included
        ?sources.raw.filter(r=>isResearchFreeTextType(r.responseType)).length
        :0
      const projected=included||input.format.startsWith('SCORE')?sources:{
        ...sources,
        raw:sources.raw.filter(r=>!isResearchFreeTextType(r.responseType)),
        codebook:sources.codebook.filter(r=>!isResearchFreeTextType(r.responseType)),
      }
      let artifact:SurveyRawExport|BoundedResearchExport
      try{
        artifact=attendanceOnly&&compact
          ?compactSurveyAttendanceExport(input.projectId,sources,input.waveId!)
          :artifactFor(input.format,input.projectId,projected,input.waveId)
      }catch(e){
        const detail=e instanceof Error?e.message:'研究导出来源不可核验'
        // Only resource/format budgets justify reducing a page. A corrupt or
        // mis-scoped FINAL must not turn into a seemingly successful smaller page.
        if(/exceeds?|too many|too large|oversiz|bounded rows/i.test(detail))fail(413,detail)
        fail(409,'导出来源不完整或不一致，请先核验研究数据')
      }
      const selectedVersions=[...new Map(sources.codebook.map(x=>[
        x.waveId+':'+x.instrumentKey+':'+x.definitionDigest,
        {waveId:x.waveId,instrumentKey:x.instrumentKey,
          publicationVersion:x.publicationVersion,
          instrumentRevision:x.instrumentRevision,
          definitionDigest:x.definitionDigest,scoringDigest:x.scoringDigest,
          formSchemaVersion:x.formSchemaVersion??null,flowDigest:x.flowDigest??null,
          scalePresentationMode:x.scalePresentationMode??null,
          scaleTimingContract:x.timingContract??null},
      ] as const)).values()]
      const manifest={...artifact.manifest,sourceCutOff:sources.cutOff,
        generatedAt:new Date().toISOString(),timeZone:'UTC',
        timingProvenance:'BROWSER_OBSERVED_FOREGROUND_MS_NOT_ATTESTED_ATTENTION',
        timingMissingPolicy:'NULL_NOT_ZERO_FOR_HISTORICAL_OR_NON_TIMED_SCALES',
        sourceProjectRevision:sources.sourceRevision,
        analysisPopulation:attendanceOnly
          ?'LINKED_NON_FINAL_ATTENDANCE_AND_QUALITY_EXCLUDED'
          :'COMPLETED_FINAL_NOT_WITHDRAWN_AND_NOT_QUALITY_EXCLUDED',
        batch:{pageNumber,hasNext:!!nextCursor,
          phase:attendanceOnly?'NON_FINAL_PARTICIPATION':'VERIFIED_FINAL',
          representation:attendanceOnly?(compact?'ATTENDANCE_COMPACT_V1':'LEGACY_EXPANDED_ATTENDANCE_V3')
            :'FINAL_ITEM_OR_SCORE_ROWS',
          ...(compact?{maxFinalsPerPage:pageLimit}:{}),
          totalIncludedFinals:sources.sourceFinalCount??null,
          totalNonFinalAttempts:sources.sourceAttendanceCount??null,
          completionRowsOnlyAfterFirstPage:!!prior&&!attendanceOnly,
          sourceOrdering:attendanceOnly
            ?(compact?'ATTEMPT_UUID_ID_V4':'ATTEMPT_UUID_ID_V3')
            :paged?(prior?.v===1?'COMPLETED_AT_AND_ID_V1':'FINAL_UUID_ID_V2')
              :'COMPLETED_AT_AND_ID',
          participationRowsAreSeparate:!!(paged&&phased&&sources.collectionMode==='LINKED_WAVES'),
          ...(attendanceOnly&&compact?{
            attendanceJoinKeys:['research_code','wave_id'],
            finalJoinKeys:['research_code_or_attempt','wave_id'],
            joinInstruction:'MATCH_ATTENDANCE_RESEARCH_CODE_TO_FINAL_RESEARCH_CODE_OR_ATTEMPT_AND_WAVE_ID_NEVER_CONCATENATE_CSV',
            missingSemantics:{QUALITY_EXCLUDED:'Audited exclusion; not an included FINAL',
              ABANDONED:'Started or screened-out without an included FINAL',
              NO_WAVE:'No participation in this wave; derive only from the wider linked cohort'},
          }:{}),
        },
        completedFinalCount:sources.completeAttempts,selectedVersions,
        selection:{format:input.format,waveIds:input.waveId?[input.waveId]:null,
          researchOnly:true,collectionMode:sources.collectionMode,
          freeTextIncluded:included,freeTextExcludedRows:included?0:omittedFreeText,
          completedFrom:from?.toISOString()??null,completedBefore:before?.toISOString()??null,
          bounds:'[completedFrom,completedBefore)',sliceBy:'SurveyWaveFinal.completedAt'}}
      const value:SurveyExportArtifact={csv:artifact.csv,codebook:artifact.codebook,manifest}
      const encoded=JSON.stringify(value)
      if(Buffer.byteLength(encoded,'utf8')>maxBytes)
        fail(413,'本次导出超过 2MB 的单请求上限，请缩小波次范围')
      const digest=canonicalHash(JSON.parse(encoded))
      const cipher=encryptUnifiedRuntimePayload(value)
      if(Buffer.byteLength(cipher,'utf8')>3900000)
        fail(413,'加密数据超过安全持久化预算')
      ready={sources,artifact,nextCursor,pageNumber,digest,cipher,value,manifest}
      break
    }catch(e){
      if(paged&&compact&&!attendanceOnly&&pageLimit>1
        &&e instanceof SurveyAnalyticsError&&e.statusCode===413){
        pageLimit=Math.max(1,Math.floor(pageLimit/2))
        continue
      }
      throw e
    }
  }
  if(!ready)fail(503,'导出页构建未完成')
  const {sources,artifact,nextCursor,pageNumber,digest,cipher,manifest}=ready
  const id=randomUUID(),expiresAt=new Date(Date.now()+10*60000)
  await prisma.$transaction(async tx=>{
    const current=await guardedOwner(tx,uid,input.projectId)
    // A withdrawal or quality decision bumps the revision and invalidates the
    // whole export ticket, including compact participant-status pages.
    if(current.revision!==sources.sourceRevision)
      fail(409,'研究数据授权或项目状态在导出期间发生变化，请重新生成')
    await tx.surveyExportTicket.create({data:{
      id,projectId:input.projectId,actorUserId:uid,format:input.format,status:'READY',
      sourceDigest:'sourceDigest' in artifact.manifest
        ?artifact.manifest.sourceDigest
        :canonicalHash(sources.scores.map(s=>s.sourceFinalHash).concat(
          sources.raw.map(r=>r.sourceFinalHash))),
      artifactHash:digest,artifactCipher:cipher,expiresAt,
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:uid,projectId:input.projectId,
      action:'RESEARCH_EXPORT_CREATED',metadata:{exportId:id,format:input.format,
        rowCount:artifact.manifest.rowCount,expiresAt:expiresAt.toISOString()}}})
  })
  return {id,status:'READY' as const,format:input.format,expiresAt,
    manifest,nextCursor,pageNumber}
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
