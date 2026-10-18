import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { buildTrainingAnalysis, buildTrainingAnalysisTables, buildTrainingDictionary } from './core'
import { loadTrainingAnalysisSources, listTrainingAnalysisSources } from './source'
import { assertTrainingManifest, parseTrainingAnalysisSelector, trainingManifestHash,
  type TrainingAnalysisActor, type TrainingAnalysisManifestV1 } from './manifest'
import type { TrainingAnalysisRequestV1 } from './types'

type Tx = Prisma.TransactionClient
const fail = (statusCode:number,code:string,message:string):never => {throw Object.assign(new Error(message),{statusCode,code})}
const stale = ():never => fail(409,'TRAINING_ANALYSIS_STALE','来源、质量或访问权限已变化，请重新生成分析')
/** Course lock serializes quality decisions and freezes their absence as well as
 * presence. Actor fields are current DB authority, never a cached role claim. */
async function lockAuthority(tx:Tx,actor:TrainingAnalysisActor,courseId:string,write=false) {
  const rows = await tx.$queryRaw<Array<{id:string}>>`
    SELECT c.id FROM courses c JOIN users u ON u.id=${actor.id}
    WHERE c.id=${courseId} AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
      AND (u.role::text='ADMIN' OR c.creator_id=u.id)
      AND u.role::text=${actor.role} AND u.role::text IN ('ADMIN','TEACHER')
      AND u.account_domain IN ('LEGACY','TRAINING') AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    ${write ? Prisma.sql`FOR UPDATE OF c FOR SHARE OF u` : Prisma.sql`FOR SHARE OF c,u`}
  `
  if(rows.length!==1) fail(404,'TRAINING_ANALYSIS_NOT_FOUND','课程不存在或无当前数据访问权限')
}
function sortedSources<T extends {waveKey:string;taskId:string;attemptId:string}>(rows:T[]):T[] {
  return [...rows].sort((a,b)=>`${a.waveKey}:${a.taskId}:${a.attemptId}`.localeCompare(`${b.waveKey}:${b.taskId}:${b.attemptId}`))
}
const scopeKey = (row:{attemptId:string;attemptEpoch:number;sourceHash:string})=>`${row.attemptId}:${row.attemptEpoch}:${row.sourceHash}`
async function readQuality(tx:Tx,courseId:string,sources:TrainingAnalysisManifestV1['sources']) {
  const ids=[...new Set(sources.map(row=>row.attemptId))]
  const rows=ids.length ? await tx.trainingAnalysisQuality.findMany({where:{courseId,attemptId:{in:ids}}}) : []
  const byScope=new Map(rows.map(row=>[scopeKey(row),row]))
  const selected=[...new Map(sources.map(source=>[scopeKey(source),source])).values()]
  const quality=selected.map(source=>{
    const review=byScope.get(scopeKey(source))
    return {attemptId:source.attemptId,attemptEpoch:source.attemptEpoch,sourceHash:source.sourceHash,
      status:source.status,taskSatisfaction:source.taskSatisfaction,verdict:review?.verdict??'INCLUDE',
      reason:review?.reason??null,revision:review?.revision??0}
  }).sort((a,b)=>scopeKey(a).localeCompare(scopeKey(b)))
  return {quality,qualityHash:canonicalHash(quality)}
}
export async function discoverTrainingCourseSources(actor:TrainingAnalysisActor,courseId:string) {
  return prisma.$transaction(async tx=>{
    await lockAuthority(tx,actor,courseId)
    return listTrainingAnalysisSources(tx,{userId:actor.id,role:actor.role},courseId)
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}

export async function analyzeTrainingCourse(input:{actor:TrainingAnalysisActor;courseId:string;selector:unknown;expectedManifest?:TrainingAnalysisManifestV1;sourceCutoff?:string;includeTables?:boolean}) {
  const selector=parseTrainingAnalysisSelector(input.selector,input.courseId)
  const expected=input.expectedManifest ? assertTrainingManifest(input.expectedManifest) : undefined
  if(expected && (expected.actor.id!==input.actor.id || expected.actor.role!==input.actor.role
    || expected.courseId!==input.courseId || expected.definitionHash!==canonicalHash(selector))) stale()
  const frozen=await prisma.$transaction(async tx=>{
    await lockAuthority(tx,input.actor,input.courseId)
    const sourceCutoff=expected?.sourceCutoff??input.sourceCutoff??new Date().toISOString()
    const loaded=await loadTrainingAnalysisSources(tx,{userId:input.actor.id,role:input.actor.role},selector,
      expected ? {fixedManifest:{attempts:expected.sources,...(expected.schemaVersion===2?{researchSources:expected.researchSources}:{})},sourceCutoff} : {sourceCutoff})
    const sources=sortedSources(loaded.manifest.attempts)
    const {quality,qualityHash}=await readQuality(tx,input.courseId,sources)
    return {loaded,sources,sourceCutoff,quality,qualityHash}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
  // Pure statistics/table construction happens after releasing the DB snapshot.
  // The precise source list cannot grow and every later export use is rechecked.
  const excluded=new Set(frozen.quality.filter(row=>row.verdict==='EXCLUDE').map(row=>`${row.attemptId}:${row.attemptEpoch}`))
  const governance=new Map(frozen.loaded.researchGovernance.map(row=>[row.attemptId,row]))
  const source={...frozen.loaded.source,observations:frozen.loaded.source.observations.map(row=>{
    const research=row.attemptId?governance.get(row.attemptId):undefined
    const reason=research ? research.status==='WITHDRAWAL_PENDING'?'RESEARCH_WITHDRAWAL_PENDING' as const
      : research.status==='EXCLUDED'?'RESEARCH_EXCLUDED' as const
      : research.status!=='CONSENTED'||!research.acceptanceId?'RESEARCH_CONSENT_UNKNOWN' as const
      : !row.researchCategory||!research.dataCategories?.includes(row.researchCategory)?'RESEARCH_SCOPE_NOT_COVERED' as const : null : null
    if(reason)return {...row,value:null,reason}
    return row.attemptId && excluded.has(`${row.attemptId}:${row.attemptEpoch}`)?{...row,value:null,reason:'QUALITY_EXCLUDED' as const}:row
  })}
  const analysis=buildTrainingAnalysis(selector,source)
  const dictionary=buildTrainingDictionary(selector,source)
  const unsigned={schemaVersion:(frozen.loaded.researchGovernance.length?2:1) as 1|2,kind:'TRAINING_ANALYSIS' as const,
    ...(frozen.loaded.researchGovernance.length?{researchGovernanceHash:canonicalHash(frozen.loaded.researchGovernance),researchSources:frozen.loaded.researchGovernance.map(({attemptId,taskId,attemptEpoch})=>({attemptId,taskId,attemptEpoch}))}:{}),
    courseId:input.courseId,actor:input.actor,selector,definitionHash:canonicalHash(selector),
    sourceHash:canonicalHash(frozen.sources),authorityHash:frozen.loaded.authorityHash,qualityHash:frozen.qualityHash,
    sourceCutoff:frozen.sourceCutoff,sources:frozen.sources,dictionary,
    observationCount:source.observations.length}
  const manifest=assertTrainingManifest({...unsigned,manifestHash:trainingManifestHash(unsigned)})
  if(expected && expected.manifestHash!==manifest.manifestHash) stale()
  let cachedTables: ReturnType<typeof buildTrainingAnalysisTables> | undefined
  return {manifest,analysis,get tables(){return cachedTables??(cachedTables=buildTrainingAnalysisTables(selector,source))},quality:frozen.quality}
}

export async function revalidateTrainingAnalysisManifest(actor:TrainingAnalysisActor,manifest:TrainingAnalysisManifestV1):Promise<void> {
  const expected=assertTrainingManifest(manifest)
  await analyzeTrainingCourse({actor,courseId:expected.courseId,selector:expected.selector,expectedManifest:expected})
}

export async function setTrainingAnalysisQuality(input:{actor:TrainingAnalysisActor;courseId:string;selector:unknown;
  attemptId:string;attemptEpoch:number;sourceHash:string;expectedRevision:number;verdict:'INCLUDE'|'EXCLUDE';reason:string}) {
  const selector=parseTrainingAnalysisSelector(input.selector,input.courseId)
  const reason=input.reason.trim()
  if(reason.length<2||reason.length>1000 || !Number.isInteger(input.expectedRevision)||input.expectedRevision<0)
    fail(400,'TRAINING_ANALYSIS_QUALITY_INVALID','复核理由须为2–1000字，且须提供当前版本')
  return prisma.$transaction(async tx=>{
    await lockAuthority(tx,input.actor,input.courseId,true)
    const loaded=await loadTrainingAnalysisSources(tx,{userId:input.actor.id,role:input.actor.role},selector)
    const matches=loaded.manifest.attempts.filter(row=>row.attemptId===input.attemptId && row.attemptEpoch===input.attemptEpoch && row.sourceHash===input.sourceHash)
    if(!matches.length) fail(404,'TRAINING_ANALYSIS_NOT_FOUND','记录不存在或无当前数据访问权限')
    if(matches.some(row=>row.status!=='COMPLETED')) fail(409,'TRAINING_ANALYSIS_FINAL_REQUIRED','仅可复核已完成的冻结事实')
    await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${input.attemptId} AND attempt_epoch=${input.attemptEpoch} FOR SHARE`
    const where={courseId:input.courseId,attemptId:input.attemptId,attemptEpoch:input.attemptEpoch,sourceHash:input.sourceHash}
    const old=await tx.trainingAnalysisQuality.findUnique({where:{courseId_attemptId_attemptEpoch_sourceHash:where}})
    if((old?.revision??0)!==input.expectedRevision) fail(409,'TRAINING_ANALYSIS_QUALITY_CONFLICT','复核版本已变化，请刷新后重试')
    const revision=input.expectedRevision+1,reviewerId=input.actor.id,reviewedAt=new Date(),id=old?.id??randomUUID()
    const data={verdict:input.verdict,reason,reviewerId,reviewedAt,revision}
    if(old){
      const changed=await tx.trainingAnalysisQuality.updateMany({where:{id:old.id,revision:input.expectedRevision},data})
      if(changed.count!==1) fail(409,'TRAINING_ANALYSIS_QUALITY_CONFLICT','复核发生并发变化')
    }else await tx.trainingAnalysisQuality.create({data:{id,...where,...data}})
    await tx.trainingAnalysisQualityAudit.create({data:{id:randomUUID(),reviewId:id,...where,...data,previousVerdict:old?.verdict??'INCLUDE'}})
    // Surface this deferred integrity check while the transaction callback is
    // still awaited: some Prisma engines log a failed COMMIT but resolve it.
    await tx.$executeRaw`SET CONSTRAINTS training_analysis_quality_requires_audit IMMEDIATE`
    return {...where,...data}
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}).catch((error:unknown)=>{
    // PostgreSQL may detect the losing CAS at the serialization/unique fence.
    if(['P2034','P2002'].includes((error as {code?:string})?.code??''))
      fail(409,'TRAINING_ANALYSIS_QUALITY_CONFLICT','复核发生并发变化，请刷新后重试')
    throw error
  })
}

export function trainingQualityPage(quality:Awaited<ReturnType<typeof analyzeTrainingCourse>>['quality'],page=1) {
  if(!Number.isInteger(page)||page<1||page>240) fail(400,'TRAINING_ANALYSIS_PAGE_INVALID','页码无效')
  return {list:quality.slice((page-1)*25,page*25),total:quality.length,page,pageSize:25}
}
