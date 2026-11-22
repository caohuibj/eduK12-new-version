import { disclosedSurveyConsent } from './measurement.notice'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  createLinkedResearchIdentity,recoverLinkedResearchIdentity,
  freshUnlinkedSession,hashResearchCredential,
} from './identity.service'
import { surveyAdmissionGate } from './survey-admission-gate'
import { SurveyWaveError } from './waves.service'
import type { ResearchFrozenPublication } from './publication.service'
import { allocateResearchFlowOnAdmission } from './flow.assignment'
import {bindSurveyAttemptContent,type PreparedSurveyPublicationDigest} from './content-binding.service'
import { resetSurveyFinalPublicationCacheForTests } from './final.compute'
import { canonicalHash } from '../assessment-runtime/canonical'
import { BoundedTtlCache } from '../composite/start-read-cache'

type Tx=Prisma.TransactionClient
function blocked(message='研究准入或个人凭证无效'): never {throw new SurveyWaveError(403,message)}
const enabled=()=>{
  if(process.env.SURVEY_WORKSPACE_ENABLED!=='true'||process.env.SURVEY_PUBLICATION_ENABLED!=='true')
    blocked('Survey 匿名研究尚未启用')
}
const publicIdFormat=/^[a-f0-9-]{36}$/i
const secretPattern=/^[A-Za-z0-9_-]{43}$/
const codePattern=/^R-[A-Z0-9]{8,32}$/
const publicInfoInFlight=new BoundedTtlCache<unknown>(0,64)
const projectPublicInFlight=new BoundedTtlCache<{
  id:string;title:string;description:string|null;collectionMode:string;status:string;
  participantIdentityMode:string;participantCodeLabel:string|null;participantCodeInstructions:string|null
}>(0,64)
async function projectPublic(tx:Tx | typeof prisma,publicId:string){
  if(!publicIdFormat.test(publicId))blocked('研究入口无效')
  const load=async()=>{
    const project=await tx.surveyProject.findFirst({where:{publicId},
      select:{id:true,title:true,description:true,collectionMode:true,status:true,participantIdentityMode:true,participantCodeLabel:true,participantCodeInstructions:true}})
    if(!project)blocked('研究入口无效')
    return project!
  }
  return tx===prisma?projectPublicInFlight.singleFlight(publicId,load):load()
}
async function openWaveLocked(tx:Tx,projectId:string,waveId:string,linked:boolean){
  // Admission and project pause/close acquire locks in the same order:
  // Project -> Wave. A committed PAUSE/CLOSE/HARD_STOP takes FOR UPDATE on
  // survey_waves, which conflicts with FOR KEY SHARE here. Using FOR KEY SHARE
  // allows concurrent STARTs and FINAL/TASK readers to run in parallel while
  // claimQuota takes a brief end-of-tx advisory lock + UPDATE starts_count
  // (FOR NO KEY UPDATE, compatible with FOR KEY SHARE).
  const [project]=await tx.$queryRaw<Array<{
    ownerUserId:string;status:string;collectionMode:string
  }>>`SELECT "owner_user_id" AS "ownerUserId","status","collection_mode" AS "collectionMode"
    FROM "survey_projects" WHERE "id"=${projectId} FOR SHARE`
  if(!project||project.status!=='ACTIVE')blocked('研究项目暂停或已结束')
  // Coalesce the Wave FOR KEY SHARE lock and admission column projection into
  // one query roundtrip. Fall back to tx.surveyWave.findFirst only when a unit
  // test mock returns a bare [{ id }] lock stub without wave columns.
  const lockedWaves=await tx.$queryRaw<Array<{
    id:string
    projectId?:string
    publicationId?:string|null
    status?:string
    opensAt?:Date|null
    closesAt?:Date|null
    hardStopAt?:Date|null
    consentVersion?:number
    startsCount?:number
    quotaStarts?:number|null
  }>>`SELECT
    id,
    project_id AS "projectId",
    publication_id AS "publicationId",
    status,
    opens_at AS "opensAt",
    closes_at AS "closesAt",
    hard_stop_at AS "hardStopAt",
    consent_version AS "consentVersion",
    starts_count AS "startsCount",
    quota_starts AS "quotaStarts"
  FROM "survey_waves"
    WHERE id=${waveId} AND project_id=${projectId} FOR KEY SHARE`
  const lockedWave=lockedWaves[0]
  const wave=lockedWave&&typeof lockedWave.status==='string'&&typeof lockedWave.consentVersion==='number'
    ?(lockedWave as NonNullable<Awaited<ReturnType<typeof tx.surveyWave.findFirst>>>)
    :await tx.surveyWave.findFirst({where:{id:waveId,projectId}})
  if(!wave||!wave.publicationId||wave.status!=='OPEN')
    blocked('研究波次尚未开放')
  const now=new Date()
  if((wave.opensAt&&wave.opensAt>now)||(wave.closesAt&&wave.closesAt<=now)||wave.hardStopAt)
    blocked('本波次未在允许的采集时间内')
  // Account/project authoring eligibility was checked when this publication was
  // frozen. Public admission follows its current recruitment state, not a fresh
  // approval of the author's account. Participant authentication stays separate.
  if((linked&&project.collectionMode!=='LINKED_WAVES')||
    (!linked&&project.collectionMode!=='SINGLE_UNLINKED'))
    blocked('此研究不是对应的匿名参与模式')
  return wave
}
async function validateEntry(tx:Tx,projectId:string,waveId:string,raw:string){
  if(!secretPattern.test(raw))blocked('入场凭证无效')
  const token=await tx.surveyEntryToken.findFirst({where:{
    projectId,waveId,tokenHash:hashResearchCredential(raw),
    revokedAt:null,expiresAt:{gt:new Date()},
  }})
  if(!token)blocked('研究招募链接已经失效')
}
const hasQuota=(w:{startsCount:number;quotaStarts:number|null})=>w.quotaStarts===null||w.startsCount<w.quotaStarts
// Only persisted unlinked START identities qualify for post-rollback recovery.
const isUnlinkedStartIdentityConflict=(error:unknown):boolean=>{
  const failure=error as {code?:unknown;meta?:{target?:unknown}}|null
  if(failure?.code!=='P2002')return false
  const target=failure.meta?.target
  if(typeof target==='string')return target==='survey_attempts_wave_session_key'
    ||target==='survey_attempts_project_wave_operation_key'
  return Array.isArray(target)&&(
    (target.length===2&&target[0]==='wave_id'&&target[1]==='session_hash')||
    (target.length===3&&target[0]==='project_id'&&target[1]==='wave_id'&&target[2]==='operation_key_hash'))
}
const claimQuota=async(tx:Tx,projectId:string,waveId:string,startsCount:number)=>{
  if(typeof (tx as {$executeRaw?:unknown}).$executeRaw==='function'){
    // Brief end-of-tx per-wave advisory lock (~0.3 ms right before COMMIT) so
    // only one START runs UPDATE starts_count (FOR NO KEY UPDATE) at a time.
    // Because openWaveLocked and runtime readers hold FOR KEY SHARE (compatible
    // with FOR NO KEY UPDATE), STARTs run concurrently without LockTuple
    // deadlocks against concurrent Admin FOR UPDATE.
    const lockKey=JSON.stringify(['survey-wave-quota-v1',projectId,waveId])
    const updated=await tx.$executeRaw`
      WITH quota_gate AS MATERIALIZED (
        SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      )
      UPDATE "survey_waves"
      SET "starts_count" = "starts_count" + 1
      FROM quota_gate
      WHERE "id" = ${waveId}
        AND "project_id" = ${projectId}
        AND "status" = 'OPEN'
        AND "hard_stop_at" IS NULL
        AND ("quota_starts" IS NULL OR "starts_count" < "quota_starts")
    `
    if(updated!==1)blocked('本波次参与名额已用尽')
    return
  }
  const updated=await tx.surveyWave.updateMany({where:{id:waveId,startsCount},
    data:{startsCount:{increment:1}}})
  if(updated.count!==1)blocked('研究名额出现竞争，请重新进入')
}
type ConsentWaveProjection={
  id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;
  opensAt:Date|null;closesAt:Date|null;allowNewParticipants:boolean;publicationId:string;
  groupIpPolicy:unknown;groupIpActivatedAt:Date|null
}
// Read only the frozen public disclosure, never the full private compiled
// snapshot. Cache measurementNotice by immutable publicationId so warm info
// reads do not open a transaction or detoast survey_publications.compiled_snapshot.
const consentWaveColumns=Prisma.sql`w.id,w.title,w.ordinal,w.status,
  w.consent_text AS "consentText",w.consent_version AS "consentVersion",
  w.opens_at AS "opensAt",w.closes_at AS "closesAt",
  w.allow_new_participants AS "allowNewParticipants",
  w.group_ip_policy AS "groupIpPolicy",w.group_ip_activated_at AS "groupIpActivatedAt",
  w.publication_id AS "publicationId"`
const measurementNoticeCache=new BoundedTtlCache<{value:unknown}>(120_000,64)
async function loadMeasurementNotices(client:Tx|typeof prisma,projectId:string,publicationIds:ReadonlyArray<string>){
  const uniqueIds=[...new Set(publicationIds)]
  const missingIds=uniqueIds.filter(id=>measurementNoticeCache.get(`${projectId}:${id}`)===undefined)
  if(missingIds.length>0){
    const fetchNotices=async()=>{
      const stillMissing=missingIds.filter(id=>measurementNoticeCache.get(`${projectId}:${id}`)===undefined)
      if(!stillMissing.length)return
      const notices=await client.$queryRaw<Array<{id:string;measurementNotice:unknown}>>`
        SELECT p.id, p.compiled_snapshot->'measurementNotice' AS "measurementNotice"
        FROM survey_publications p
        WHERE p.project_id=${projectId} AND p.id = ANY(${stillMissing}::text[])
      `
      const byId=new Map(notices.map(row=>[row.id,row.measurementNotice]))
      for(const id of stillMissing){
        const notice=byId.get(id)??null
        freezeDeep(notice)
        measurementNoticeCache.set(`${projectId}:${id}`,{value:notice})
      }
    }
    if(client===prisma){
      const flightKey=`${projectId}:${[...missingIds].sort().join(',')}`
      await measurementNoticeCache.singleFlight(flightKey,async()=>{
        await fetchNotices()
        return {value:null}
      })
    }else{
      await fetchNotices()
    }
  }
  return (publicationId:string)=>measurementNoticeCache.get(`${projectId}:${publicationId}`)?.value??null
}
export async function getPublicResearchInfo(publicId:string,entryToken?:string){
  enabled()
  if(!publicIdFormat.test(publicId))blocked('研究入口无效')
  if(entryToken!==undefined&&!secretPattern.test(entryToken))blocked('研究招募链接无效')
  const flightKey=entryToken===undefined?publicId:`${publicId}:${hashResearchCredential(entryToken)}`
  return publicInfoInFlight.singleFlight(flightKey,()=>withSurveyReadClient(async tx=>{
    const project=await projectPublic(tx,publicId)
    const now=new Date()
    let scopeWaveId:string|undefined
    if(entryToken!==undefined){
      const entry=await tx.surveyEntryToken.findFirst({where:{projectId:project.id,
        tokenHash:hashResearchCredential(entryToken),revokedAt:null,expiresAt:{gt:now}},
        select:{waveId:true,wave:{select:{groupIpPolicy:true}}}})
      if(!entry)blocked('研究招募链接已经失效')
      if(entry.wave.groupIpPolicy!==null)scopeWaveId=entry.waveId
    }
    const waves=project.status==='ACTIVE'?await tx.$queryRaw<ConsentWaveProjection[]>`
      SELECT ${consentWaveColumns} FROM survey_waves w
      WHERE w.project_id=${project.id} AND w.status='OPEN' AND w.publication_id IS NOT NULL
        AND w.hard_stop_at IS NULL AND (w.opens_at IS NULL OR w.opens_at<=${now})
        AND (w.closes_at IS NULL OR w.closes_at>${now})
        ${scopeWaveId?Prisma.sql`AND w.id=${scopeWaveId}`:Prisma.empty}
      ORDER BY w.ordinal ASC LIMIT 100`:[]
    const noticeFor=await loadMeasurementNotices(tx,project.id,waves.map(w=>w.publicationId))
    return {scopeWaveId:scopeWaveId??null,project:{name:project.title,description:project.description,
      collectionMode:project.collectionMode,status:project.status,participantIdentityMode:project.participantIdentityMode,
      participantCodeLabel:project.participantCodeLabel,participantCodeInstructions:project.participantCodeInstructions},
      waves:waves.map(({publicationId,...wave})=>({...wave,
        consentText:disclosedSurveyConsent(wave.consentText,{
          measurementNotice:noticeFor(publicationId),
        })}))}
  })) as Promise<{
    scopeWaveId:string|null
    project:{name:string;description:string|null;collectionMode:string;status:string;participantIdentityMode:string;participantCodeLabel:string|null;participantCodeInstructions:string|null}
    waves:Array<Omit<ConsentWaveProjection,'publicationId'>&{consentText:string}>
  }>
}
type PreparedPublication={
  preparedDigest:PreparedSurveyPublicationDigest;preparedSnapshot:ResearchFrozenPublication
}
// Cache only an immutable publication snapshot that already hashed to its
// digest. Credentials, identities, and mutable wave/admission state stay live.
// Bound distinct waves so a pre-gate stampede cannot grow without limit.
const publicationPreparationInFlight=new Map<string,Promise<PreparedPublication|undefined>>()
const preparedPublicationCache=new BoundedTtlCache<PreparedPublication>(120_000,32)
const verifiedPublicationCache=new BoundedTtlCache<ResearchFrozenPublication>(120_000,64)
const MAX_IN_FLIGHT_PUBLICATION_PREPARATIONS=32
function freezeDeep(value:unknown):void{
  if(!value||typeof value!=='object'||Object.isFrozen(value))return
  Object.freeze(value)
  for(const child of Object.values(value as Record<string,unknown>))freezeDeep(child)
}
export function resetSurveyPublicationCachesForTests(){
  preparedPublicationCache.clear()
  verifiedPublicationCache.clear()
  measurementNoticeCache.clear()
  publicInfoInFlight.clear()
  projectPublicInFlight.clear()
  publicationPreparationInFlight.clear()
  resetSurveyFinalPublicationCacheForTests()
}
export async function preparePublicationDigest(projectId:string,waveId:string):Promise<PreparedPublication|undefined>{
  const key=JSON.stringify([projectId,waveId])
  const cached=preparedPublicationCache.get(key)
  if(cached)return cached
  const pending=publicationPreparationInFlight.get(key)
  if(pending)return pending
  // Over capacity: skip the optimization and keep the original locked read/hash.
  if(publicationPreparationInFlight.size>=MAX_IN_FLIGHT_PUBLICATION_PREPARATIONS)return undefined
  const task=(async():Promise<PreparedPublication|undefined>=>{
    // The snapshot is immutable in PostgreSQL (survey_publication_frozen).
    // Wave publication ID + digest are checked again in the locked transaction;
    // a changed binding falls back to the authoritative snapshot read.
    const wave=await prisma.surveyWave?.findFirst?.({where:{id:waveId,projectId},
      select:{publicationId:true,publication:{select:{id:true,compiledSnapshot:true}}}})
    if(!wave?.publicationId||!wave.publication?.compiledSnapshot)return undefined
    const snapshot=JSON.parse(JSON.stringify(wave.publication.compiledSnapshot)) as ResearchFrozenPublication
    const snapshotDigest=canonicalHash(snapshot)
    freezeDeep(snapshot)
    const prepared={preparedDigest:{publicationId:wave.publication.id,snapshotDigest},preparedSnapshot:snapshot}
    preparedPublicationCache.set(key,prepared)
    if(snapshot.runtimeStatus==='SURVEY_FINAL_V1'){
      verifiedPublicationCache.set(`${wave.publication.id}:${snapshotDigest}`,snapshot)
    }
    return prepared
  })()
  publicationPreparationInFlight.set(key,task)
  try{return await task}finally{
    if(publicationPreparationInFlight.get(key)===task)publicationPreparationInFlight.delete(key)
  }
}
// Preliminary, cheap unlinked recruitment-token proof: a failed token must
// never cause a large snapshot read/hash outside the admission gate. This is
// NOT authoritative admission; validateEntry still runs inside the Wave lock.
async function mayPrepareUnlinkedPublication(projectId:string,waveId:string,raw:string):Promise<boolean>{
  if(!secretPattern.test(raw))return false
  const entry=await prisma.surveyEntryToken.findFirst({where:{
    projectId,waveId,tokenHash:hashResearchCredential(raw),
    revokedAt:null,expiresAt:{gt:new Date()},
  },select:{id:true}})
  return Boolean(entry)
}
/** Opt-in pseudonymous T1 or late-join only, using a separate high-entropy
 * recruitment bearer. The private participant secret is shown only once.
 */
export async function joinLinkedStudy(input:{
  publicId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean
}){
  enabled()
  const project=await withSurveyReadClient(tx=>projectPublic(tx,input.publicId))
  if(project.collectionMode!=='LINKED_WAVES')blocked('当前项目不是多波次研究')
  if(!input.consent)blocked('必须先确认知情同意')
  // The underlying service locks public Wave and validates entry token and
  // consent version; a separate participant identity cannot access other projects.
  return createLinkedResearchIdentity({
    projectId:project.id,waveId:input.waveId,entryToken:input.entryToken,
    consentVersion:input.consentVersion,consent:true,
  })
}
export async function listOwnLinkedWaves(input:{
  publicId:string;researchCode:string;accessCredential:string;waveId?:string
}){
  enabled()
  return withSurveyReadClient(async client=>{
    const project=await projectPublic(client,input.publicId)
    if(project.collectionMode!=='LINKED_WAVES')blocked('此项目没有稳定的研究编号')
    const identity=await recoverLinkedResearchIdentity({
      projectId:project.id,researchCode:input.researchCode,
      accessCredential:input.accessCredential,
    })
    const waves=await client.$queryRaw<ConsentWaveProjection[]>`
      SELECT ${consentWaveColumns} FROM survey_waves w
      WHERE w.project_id=${project.id} AND w.publication_id IS NOT NULL
        AND w.status IN ('OPEN','PAUSED','CLOSED')
        ${input.waveId?Prisma.sql`AND w.id=${input.waveId}`:Prisma.empty}
      ORDER BY w.ordinal ASC LIMIT 100`
    const attempts=await client.surveyWaveAttempt.findMany({where:{
      projectId:project.id,participantId:identity.participantId,
      ...(input.waveId?{waveId:input.waveId}:{}),
    },select:{id:true,waveId:true,status:true,completedAt:true}})
    const state=new Map(attempts.map(a=>[a.waveId,a]))
    const now=new Date()
    // Freezing a T2/T3 Publication is not consent to reveal future-wave
    // titles or disclosures. Only the current open Wave or own history appears.
    const visible=waves.filter(w=>state.has(w.id)||
      (project.status==='ACTIVE'&&w.status==='OPEN'
        &&(!w.opensAt||w.opensAt<=now)&&(!w.closesAt||w.closesAt>now)))
    const noticeFor=await loadMeasurementNotices(client,project.id,visible.map(w=>w.publicationId))
    return {collectionMode:'LINKED_WAVES',waves:visible.map(({publicationId,...w})=>({
      ...w,consentText:disclosedSurveyConsent(w.consentText,{measurementNotice:noticeFor(publicationId)}),
      attempt:state.get(w.id)||null,
    }))}
  })
}
export async function startLinkedWave(input:{
  publicId:string;waveId:string;researchCode:string;
  accessCredential:string;consentVersion:number;consent:boolean
}){
  enabled()
  if(!input.consent||!codePattern.test(input.researchCode)||!secretPattern.test(input.accessCredential))
    blocked('研究参与身份或知情同意不合法')
  const project=await withSurveyReadClient(tx=>projectPublic(tx,input.publicId))
  const identity=await recoverLinkedResearchIdentity({
    projectId:project.id,researchCode:input.researchCode,
    accessCredential:input.accessCredential,
  })
  const prepared=await preparePublicationDigest(project.id,input.waveId)
  return await surveyAdmissionGate().run(() => prisma.$transaction(async tx=>{
    const wave=await openWaveLocked(tx,project.id,input.waveId,true)
    // Project-scoped credential remains valid at the moment of admission.
    // Revocation cannot commit between the admission credential check and
    // its newly allocated Attempt; preserve Project -> Wave -> Person locks.
    // Exclusive from the start: taking SHARE and later promoting to UPDATE
    // for an encrypted group assignment can deadlock across T2/T3 requests.
    const lockedParticipants=await tx.$queryRaw<Array<{
      id:string
      status?:string
      credentialHash?:string|null
      credentialRevokedAt?:Date|null
    }>>`SELECT id, status, credential_hash AS "credentialHash", credential_revoked_at AS "credentialRevokedAt"
      FROM survey_participants
      WHERE id=${identity.participantId} AND project_id=${project.id} FOR UPDATE`
    const lockedPerson=lockedParticipants[0]
    const expectedCredentialHash=hashResearchCredential(input.accessCredential)
    const live=lockedPerson&&typeof lockedPerson.status==='string'
      ?(lockedPerson.status==='ACTIVE'&&lockedPerson.credentialHash===expectedCredentialHash&&lockedPerson.credentialRevokedAt===null?lockedPerson:null)
      :await tx.surveyParticipant.findFirst({where:{
        id:identity.participantId,projectId:project.id,status:'ACTIVE',
        credentialHash:expectedCredentialHash,credentialRevokedAt:null,
      }})
    if(!live)blocked('研究编号的私密凭证已经失效')
    if(input.consentVersion!==wave.consentVersion)
      blocked('研究说明已更新，请重新确认')
    const previous=await tx.surveyWaveAttempt.findFirst({where:{
      projectId:project.id,waveId:wave.id,participantId:identity.participantId,
    }})
    if(previous){
      await bindSurveyAttemptContent(tx,{projectId:project.id,waveId:wave.id,attemptId:previous.id,publicationId:wave.publicationId!,newAttempt:false,...(prepared??{})})
      return {attemptId:previous.id,waveId:wave.id,status:previous.status,recovered:true}
    }
    if(!hasQuota(wave))blocked('本波次参与名额已用尽')
    const row=await tx.surveyWaveAttempt.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      participantId:identity.participantId,status:'STARTED',
    }})
    await tx.surveyConsent.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      participantId:identity.participantId,attemptId:row.id,
      consentVersion:wave.consentVersion,accepted:true,
    }})
    await allocateResearchFlowOnAdmission(tx,{
      publicationId:wave.publicationId!,projectId:project.id,waveId:wave.id,
      attemptId:row.id,participantId:identity.participantId,
      researchCode:input.researchCode,accessCredential:input.accessCredential,...(prepared??{}),
    })
    await bindSurveyAttemptContent(tx,{projectId:project.id,waveId:wave.id,attemptId:row.id,publicationId:wave.publicationId!,newAttempt:true,...(prepared??{})})
    await claimQuota(tx,project.id,wave.id,wave.startsCount)
    return {attemptId:row.id,waveId:wave.id,status:'STARTED',recovered:false}
  }))
}
export async function startSingleUnlinkedWave(input:{
  publicId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean;
  operationKey?:string;accessCredential?:string
}){
  enabled()
  if(!input.consent)blocked('必须先同意本研究的参与说明')
  // The two client-generated values are OPTIONAL to keep rolling deploys
  // compatible: pages served by the previous backend never send them, and
  // open tabs must keep working against the new one. Both absent → the
  // deprecated server-generated session with no replay identity (exactly the
  // pre-idempotency behavior). Both present → full-entropy format enforced,
  // the values must differ, and the idempotent path applies. The current
  // frontend always sends them.
  const legacy=!input.operationKey&&!input.accessCredential
  if(!legacy&&(!secretPattern.test(input.operationKey??'')||!secretPattern.test(input.accessCredential??'')
    ||input.operationKey===input.accessCredential))blocked('开始凭证不合法')
  const project=await withSurveyReadClient(tx=>projectPublic(tx,input.publicId))
  const serverSession=legacy?freshUnlinkedSession():null
  const operationKeyHash=legacy?null:hashResearchCredential(input.operationKey!)
  const sessionHash=hashResearchCredential(legacy?serverSession!.accessCredential:input.accessCredential!)
  const bearer=legacy?serverSession!.accessCredential:input.accessCredential!
  // Reject heavy pre-gate work for invalid/expired credentials while keeping
  // the existing in-transaction validation and error precedence unchanged.
  // When the immutable prepared publication is already warm in memory, reuse
  // it without a redundant pre-tx token DB query; in-tx validateEntry stays
  // authoritative.
  const cachedPrepared=preparedPublicationCache.get(JSON.stringify([project.id,input.waveId]))
  const prepared=cachedPrepared??(await mayPrepareUnlinkedPublication(project.id,input.waveId,input.entryToken)?await preparePublicationDigest(project.id,input.waveId):undefined)
  return surveyAdmissionGate().run(async()=>{
    try{
      return await prisma.$transaction(async tx=>{
    const wave=await openWaveLocked(tx,project.id,input.waveId,false)
    await validateEntry(tx,project.id,wave.id,input.entryToken)
    // Replay first, before any quota is claimed: the same operation identity
    // recovers the original attempt when the first response was lost. The
    // bearer must match the recorded session hash, so a different or guessed
    // credential cannot recover someone else's attempt. Replay deliberately
    // runs after the wave/entry governance gates: closing a wave, pausing the
    // project or expiring the recruitment token still ends recovery, exactly
    // as it ends new starts. Consent was recorded at creation and the attempt
    // continues under it (mirrors LINKED replay).
    if(operationKeyHash){
      const previous=await tx.surveyWaveAttempt.findFirst({where:{
        projectId:project.id,waveId:wave.id,operationKeyHash,
      }})
      if(previous){
        if(previous.sessionHash!==sessionHash)blocked('开始凭证与本轮记录不匹配')
        await bindSurveyAttemptContent(tx,{projectId:project.id,waveId:wave.id,attemptId:previous.id,publicationId:wave.publicationId!,newAttempt:false,...(prepared??{})})
        return {attemptId:previous.id,waveId:wave.id,status:previous.status,recovered:true,accessCredential:bearer}
      }
    }
    if(input.consentVersion!==wave.consentVersion)blocked('研究说明已更新，请重新确认')
    if(!hasQuota(wave))blocked('本波次参与名额已用尽')
    const row=await tx.surveyWaveAttempt.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      sessionHash,...(operationKeyHash?{operationKeyHash}:{}),status:'STARTED',
    }})
    await tx.surveyConsent.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      attemptId:row.id,consentVersion:wave.consentVersion,accepted:true,
    }})
    await allocateResearchFlowOnAdmission(tx,{
      publicationId:wave.publicationId!,projectId:project.id,waveId:wave.id,
      attemptId:row.id,participantId:null,accessCredential:bearer,...(prepared??{}),
    })
    await bindSurveyAttemptContent(tx,{projectId:project.id,waveId:wave.id,attemptId:row.id,publicationId:wave.publicationId!,newAttempt:true,...(prepared??{})})
    await claimQuota(tx,project.id,wave.id,wave.startsCount)
    return {attemptId:row.id,waveId:wave.id,status:'STARTED',
      recovered:false,accessCredential:bearer}
      })
    }catch(error){
      // The loser of a simultaneous START unique-index race has fully rolled
      // back. Only that rare case opens a fresh transaction for live replay.
      // Normal STARTs gain no extra SQL, locks, or admission gates.
      if(!operationKeyHash||!isUnlinkedStartIdentityConflict(error))throw error
      return prisma.$transaction(async tx=>{
        const wave=await openWaveLocked(tx,project.id,input.waveId,false)
        await validateEntry(tx,project.id,wave.id,input.entryToken)
        const previous=await tx.surveyWaveAttempt.findFirst({where:{
          projectId:project.id,waveId:wave.id,operationKeyHash,
        }})
        if(!previous)blocked('开始操作与已有作答凭证冲突')
        if(previous.sessionHash!==sessionHash)blocked('开始凭证与本轮记录不匹配')
        await bindSurveyAttemptContent(tx,{projectId:project.id,waveId:wave.id,
          attemptId:previous.id,publicationId:wave.publicationId!,newAttempt:false,...(prepared??{})})
        return {attemptId:previous.id,waveId:wave.id,status:previous.status,recovered:true,accessCredential:bearer}
      })
    }
  })
}
type SurveyAttemptProof={publicId:string;attemptId:string;researchCode?:string;accessCredential:string}
type VerifiedSurveyAttempt={attemptId:string;projectId:string;waveId:string;participantId:string|null;
  status:string;publicationId:string;definitionDigest:string;
  compiledSnapshot:ResearchFrozenPublication;generalText:string;finishUntil:Date|null;
  hardStopAt:Date|null}
async function withSurveyReadClient<T>(action: (client: Tx | typeof prisma) => Promise<T>): Promise<T> {
  if (typeof (prisma as any).surveyProject?.findFirst === 'function') {
    return action(prisma)
  }
  return prisma.$transaction(tx => action(tx))
}

/** Read the current bearer and frozen-version locator. Only readers that need
 * the definition outside a later authoritative transaction select its payload. */
async function readVerifiedSurveyAttempt(input:SurveyAttemptProof,includeSnapshot:boolean){
  enabled()
  if(!secretPattern.test(input.accessCredential))blocked()
  return withSurveyReadClient(async client => {
    const project=await projectPublic(client,input.publicId)
    const attempt=await client.surveyWaveAttempt.findFirst({where:{
      id:input.attemptId,projectId:project.id,
    },select:{id:true,waveId:true,participantId:true,status:true,sessionHash:true,
      wave:{select:{generalText:true,finishUntil:true,hardStopAt:true,
        publication:{select:{id:true,definitionDigest:true,compiledSnapshot:false}}}}}})
    if(!attempt||!attempt.wave.publication)blocked()
    if(attempt.participantId){
      if(!input.researchCode)blocked()
      const linked=await recoverLinkedResearchIdentity({
        projectId:project.id,researchCode:input.researchCode,accessCredential:input.accessCredential,
      })
      if(linked.participantId!==attempt.participantId)blocked()
    }else if(attempt.sessionHash!==hashResearchCredential(input.accessCredential))blocked()
    const pub=attempt.wave.publication
    let snapshot:ResearchFrozenPublication|undefined
    if(includeSnapshot){
      const cacheKey=`${pub.id}:${pub.definitionDigest}`
      const cached=verifiedPublicationCache.get(cacheKey)
      if(cached)snapshot=cached
      else{
        const loaded=await client.surveyWaveAttempt.findFirst({where:{
          id:input.attemptId,projectId:project.id,
        },select:{wave:{select:{publication:{select:{compiledSnapshot:true}}}}}})
        const raw=loaded?.wave.publication?.compiledSnapshot as unknown as ResearchFrozenPublication|undefined
        const normalized=raw?JSON.parse(JSON.stringify(raw)) as ResearchFrozenPublication:undefined
        if(!normalized||normalized.runtimeStatus!=='SURVEY_FINAL_V1'
          ||canonicalHash(normalized)!==pub.definitionDigest)
          blocked('研究冻结定义不可用')
        freezeDeep(normalized)
        verifiedPublicationCache.set(cacheKey,normalized)
        snapshot=normalized
      }
    }
    return {attemptId:attempt.id,projectId:project.id,waveId:attempt.waveId,
      participantId:attempt.participantId,status:attempt.status,
      publicationId:pub!.id,definitionDigest:pub!.definitionDigest,compiledSnapshot:snapshot,
      generalText:attempt.wave.generalText,finishUntil:attempt.wave.finishUntil,
      hardStopAt:attempt.wave.hardStopAt}
  })
}
/** Public task/read paths independently verify their full frozen definition. */
export async function verifiedSurveyAttempt(input:SurveyAttemptProof):Promise<VerifiedSurveyAttempt>{
  const result=await readVerifiedSurveyAttempt(input,true)
  return {...result,compiledSnapshot:result.compiledSnapshot!}
}
/** Internal FINAL/checkpoint locator, not a verified definition or cached authority.
 * The caller MUST reload and hash the full current publication under the
 * Project -> Wave -> Attempt locks, before replay or mutation. */
export async function verifiedSurveyFinalLocator(input:SurveyAttemptProof):Promise<Omit<VerifiedSurveyAttempt,'compiledSnapshot'>>{
  const {compiledSnapshot,...locator}=await readVerifiedSurveyAttempt(input,false)
  return locator
}
