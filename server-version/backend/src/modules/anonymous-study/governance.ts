import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { compositeBadRequest, compositeConflict, compositeNotFound } from '../composite/composite.errors'

type Db = Prisma.TransactionClient
export interface StudyResearchScope {purpose:string;dataCategories:Array<'FORM'|'SCALE'|'COGNITIVE'|'SJT'>;waveCoverage:'EXISTING_AND_FUTURE'}
export interface StudyConsentVersion {scopeId:string;scopeHash:string;scope:StudyResearchScope;id:string;studyId:string;version:number;body:string;bodyHash:string;publishedAt:Date}
type State = {status:'CONSENTED'|'WITHDRAWAL_PENDING'|'EXCLUDED';revision:number;acceptanceId:string|null}
const hidden=():never=>{throw compositeNotFound('研究记录不存在或无访问权限')}
const conflict=():never=>{throw compositeConflict('研究同意或审核版本已变化，请刷新后重试')}
async function governanceTransaction<T>(work:(tx:Db)=>Promise<T>):Promise<T> {
  return prisma.$transaction(work).catch((error:unknown)=>{
    const e=error as {code?:string;meta?:{code?:string}}
    if(e.code==='P2002'||(e.code==='P2010'&&e.meta?.code==='23505')) conflict()
    throw error
  })
}
export const studyConsentBodyHash=(body:string)=>createHash('sha256').update(body,'utf8').digest('hex')
async function owner(tx:Db,userId:string,studyId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT s.id FROM anonymous_studies s JOIN users u ON u.id=s.owner_user_id
    WHERE s.id=${studyId} AND s.owner_user_id=${userId} AND u.role::text IN ('TEACHER','ADMIN') AND u.is_active AND NOT u.is_frozen
    AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)`
  if(!rows.length) hidden()
}
async function participant(tx:Db,studyId:string,credential:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(credential)) hidden()
  // The original identity revocation boundary remains absolute.
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT p.id FROM anonymous_study_participants p
    JOIN anonymous_studies s ON s.id=p.study_id JOIN users u ON u.id=s.owner_user_id
    WHERE p.study_id=${studyId} AND p.status='ACTIVE' AND p.credential_hash=${hashRecoveryToken(credential)}
    AND u.is_active AND NOT u.is_frozen AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)`
  if(!rows[0]) hidden()
  return rows[0].id
}
export async function currentStudyConsent(tx:Db,studyId:string) {
  const rows=await tx.$queryRaw<StudyConsentVersion[]>`SELECT id,study_id AS "studyId",version,body,scope,scope_id AS "scopeId",scope_hash AS "scopeHash",body_hash AS "bodyHash",published_at AS "publishedAt"
    FROM anonymous_study_consent_versions WHERE study_id=${studyId} ORDER BY version DESC LIMIT 1`
  return rows[0]??null
}
async function state(tx:Db,participantId:string) {
  const rows=await tx.$queryRaw<State[]>`SELECT status,revision,acceptance_id AS "acceptanceId" FROM anonymous_study_research_states WHERE participant_id=${participantId}`
  return rows[0]??null
}
async function view(tx:Db,studyId:string,participantId:string) {
  const version=await currentStudyConsent(tx,studyId), current=await state(tx,participantId)
  const rows=current?.acceptanceId ? await tx.$queryRaw<Array<{id:string;versionId:string;bodyHash:string;acceptedAt:Date}>>`
    SELECT id,version_id AS "versionId",body_hash AS "bodyHash",accepted_at AS "acceptedAt" FROM anonymous_study_consent_acceptances
    WHERE id=${current.acceptanceId} AND participant_id=${participantId} AND study_id=${studyId}` : []
  const acceptance=rows[0]??null
  const eligible=current?.status==='CONSENTED' && !!acceptance
  const reason=eligible?null:current?.status==='WITHDRAWAL_PENDING'?'RESEARCH_WITHDRAWAL_PENDING':current?.status==='EXCLUDED'?'RESEARCH_EXCLUDED':'RESEARCH_CONSENT_UNKNOWN'
  const acceptedVersions=acceptance ? await tx.$queryRaw<StudyConsentVersion[]>`SELECT id,study_id AS "studyId",version,body,scope,scope_id AS "scopeId",scope_hash AS "scopeHash",body_hash AS "bodyHash",published_at AS "publishedAt"
    FROM anonymous_study_consent_versions WHERE id=${acceptance.versionId} AND study_id=${studyId}` : []
  return {version,acceptedVersion:acceptedVersions[0]??null,acceptance,state:current?.status??'UNKNOWN',revision:current?.revision??0,eligible,reason}
}
export async function ownerStudyConsent(userId:string,studyId:string) {await owner(prisma,userId,studyId);return {version:await currentStudyConsent(prisma,studyId)}}
export async function participantStudyConsent(studyId:string,credential:string) {
  return prisma.$transaction(async tx=>view(tx,studyId,await participant(tx,studyId,credential)),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
export async function publishStudyConsent(userId:string,studyId:string,input:{requestId:string;expectedVersionId:string|null;body:string;scope:Pick<StudyResearchScope,'purpose'|'dataCategories'>}) {
  if(input.body.length<20||input.body.length>20000) throw compositeBadRequest('研究说明须为20–20000字')
  const scope:StudyResearchScope={purpose:input.scope.purpose.trim(),dataCategories:[...new Set(input.scope.dataCategories)].sort(),waveCoverage:'EXISTING_AND_FUTURE'}
  if(scope.purpose.length<2||scope.purpose.length>1000||!scope.dataCategories.length||scope.dataCategories.some(c=>!['FORM','SCALE','COGNITIVE','SJT'].includes(c))) throw compositeBadRequest('请选择明确的研究用途与数据类型')
  const scopeHash=canonicalHash({scopeId:studyId,...scope})
  return governanceTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    await owner(tx,userId,studyId)
    const rows=await tx.$queryRaw<Array<StudyConsentVersion & {publishedBy:string}>>`SELECT id,study_id AS "studyId",version,body,scope,scope_id AS "scopeId",scope_hash AS "scopeHash",body_hash AS "bodyHash",published_at AS "publishedAt",published_by AS "publishedBy"
      FROM anonymous_study_consent_versions WHERE id=${input.requestId}`
    if(rows[0]){
      const row=rows[0]
      if(row.studyId!==studyId||row.body!==input.body||row.publishedBy!==userId||row.scopeHash!==scopeHash) conflict()
      // The request binds the preceding immutable version, including null.
      const predecessor=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_consent_versions WHERE study_id=${studyId} AND version=${row.version-1}`
      if((predecessor[0]?.id??null)!==input.expectedVersionId) conflict()
      const {publishedBy:_,...version}=row; return version
    }
    const previous=await currentStudyConsent(tx,studyId)
    if((previous?.id??null)!==input.expectedVersionId) conflict()
    if(previous && previous.scopeHash!==scopeHash) throw compositeConflict('研究用途与数据范围发布后不可扩大或变更，请另建研究')
    await tx.$executeRaw`INSERT INTO anonymous_study_consent_versions(id,study_id,version,body,body_hash,published_by,scope_id,scope,scope_hash)
      VALUES(${input.requestId},${studyId},${(previous?.version??0)+1},${input.body},${studyConsentBodyHash(input.body)},${userId},${studyId},${JSON.stringify(scope)}::jsonb,${scopeHash})`
    return (await currentStudyConsent(tx,studyId))!
  })
}
async function writeState(tx:Db,studyId:string,participantId:string,old:State|null,input:{requestId:string;status:State['status'];acceptanceId:string|null;actorUserId?:string;reason?:string}) {
  const revision=(old?.revision??0)+1
  if(old) {
    const changed=await tx.$executeRaw`UPDATE anonymous_study_research_states SET status=${input.status},acceptance_id=${input.acceptanceId},revision=${revision},updated_at=CURRENT_TIMESTAMP
      WHERE participant_id=${participantId} AND revision=${old.revision}`
    if(changed!==1) conflict()
  }else await tx.$executeRaw`INSERT INTO anonymous_study_research_states(participant_id,study_id,status,acceptance_id,revision) VALUES(${participantId},${studyId},${input.status},${input.acceptanceId},${revision})`
  await tx.$executeRaw`INSERT INTO anonymous_study_research_audit(id,study_id,participant_id,acceptance_id,status,previous_status,revision,actor_user_id,reason)
    VALUES(${input.requestId},${studyId},${participantId},${input.acceptanceId},${input.status},${old?.status??'UNKNOWN'},${revision},${input.actorUserId??null},${input.reason??null})`
  await tx.$executeRaw`SET CONSTRAINTS anonymous_study_research_requires_audit IMMEDIATE`
}
export async function acceptStudyConsent(studyId:string,credential:string,input:{requestId:string;versionId:string;bodyHash:string}) {
  return governanceTransaction(async tx=>{
    // Same lock order as admission; publication and withdrawal linearize here.
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    const participantId=await participant(tx,studyId,credential)
    await tx.$queryRaw`SELECT id FROM anonymous_study_participants WHERE id=${participantId} FOR UPDATE`
    if(await participant(tx,studyId,credential)!==participantId) hidden()
    const prior=await tx.$queryRaw<Array<{studyId:string;participantId:string;versionId:string;bodyHash:string}>>`SELECT study_id AS "studyId",participant_id AS "participantId",version_id AS "versionId",body_hash AS "bodyHash" FROM anonymous_study_consent_acceptances WHERE id=${input.requestId}`
    if(prior[0]) {
      const row=prior[0]
      if(row.studyId!==studyId||row.participantId!==participantId||row.versionId!==input.versionId||row.bodyHash!==input.bodyHash) conflict()
      return view(tx,studyId,participantId)
    }
    const version=await currentStudyConsent(tx,studyId),old=await state(tx,participantId)
    if(!version||version.id!==input.versionId||version.bodyHash!==input.bodyHash||old?.status==='WITHDRAWAL_PENDING'||old?.status==='EXCLUDED') conflict()
    const accepted=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_consent_acceptances WHERE participant_id=${participantId} AND version_id=${version.id}`
    if(accepted.length) conflict() // New request ID is not the original replay.
    await tx.$executeRaw`INSERT INTO anonymous_study_consent_acceptances(id,study_id,participant_id,version_id,body_hash) VALUES(${input.requestId},${studyId},${participantId},${version.id},${version.bodyHash})`
    await writeState(tx,studyId,participantId,old,{requestId:input.requestId,status:'CONSENTED',acceptanceId:input.requestId})
    return view(tx,studyId,participantId)
  })
}
export async function withdrawStudyResearch(studyId:string,credential:string,input:{requestId:string;expectedRevision:number}) {
  return governanceTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    const participantId=await participant(tx,studyId,credential)
    await tx.$queryRaw`SELECT id FROM anonymous_study_participants WHERE id=${participantId} FOR UPDATE`
    if(await participant(tx,studyId,credential)!==participantId) hidden()
    const prior=await tx.$queryRaw<Array<{studyId:string;participantId:string;revision:number;status:string}>>`SELECT study_id AS "studyId",participant_id AS "participantId",revision,status FROM anonymous_study_research_audit WHERE id=${input.requestId}`
    if(prior[0]){
      const row=prior[0];if(row.studyId!==studyId||row.participantId!==participantId||row.status!=='WITHDRAWAL_PENDING'||row.revision!==input.expectedRevision+1) conflict()
      return view(tx,studyId,participantId)
    }
    const old=await state(tx,participantId)
    if((old?.revision??0)!==input.expectedRevision||old?.status==='WITHDRAWAL_PENDING'||old?.status==='EXCLUDED') conflict()
    await writeState(tx,studyId,participantId,old,{requestId:input.requestId,status:'WITHDRAWAL_PENDING',acceptanceId:old?.acceptanceId??null})
    return view(tx,studyId,participantId)
  })
}
export async function reviewStudyWithdrawal(userId:string,studyId:string,participantId:string,input:{requestId:string;expectedRevision:number;reason:string}) {
  if(input.reason.trim().length<2||input.reason.length>1000) throw compositeBadRequest('请提供2–1000字审核理由')
  return governanceTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    await owner(tx,userId,studyId)
    const found=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_participants WHERE id=${participantId} AND study_id=${studyId} FOR UPDATE`
    if(!found.length) hidden()
    const prior=await tx.$queryRaw<Array<{studyId:string;participantId:string;revision:number;status:string;reason:string;actorUserId:string}>>`SELECT study_id AS "studyId",participant_id AS "participantId",revision,status,reason,actor_user_id AS "actorUserId" FROM anonymous_study_research_audit WHERE id=${input.requestId}`
    if(prior[0]){
      const row=prior[0];if(row.studyId!==studyId||row.participantId!==participantId||row.status!=='EXCLUDED'||row.revision!==input.expectedRevision+1||row.reason!==input.reason||row.actorUserId!==userId) conflict()
      return {state:'EXCLUDED',revision:row.revision}
    }
    const old=await state(tx,participantId)
    if(old?.revision!==input.expectedRevision||old.status!=='WITHDRAWAL_PENDING') conflict()
    await writeState(tx,studyId,participantId,old,{requestId:input.requestId,status:'EXCLUDED',acceptanceId:old.acceptanceId,actorUserId:userId,reason:input.reason})
    return {state:'EXCLUDED',revision:old.revision+1}
  })
}

export async function listStudyWithdrawals(userId:string,studyId:string,page=1) {
  if(!Number.isInteger(page)||page<1||page>240) throw compositeBadRequest('页码无效')
  await owner(prisma,userId,studyId)
  const list=await prisma.$queryRaw<Array<{participantId:string;displayCode:string;state:string;revision:number}>>`
    SELECT r.participant_id AS "participantId",p.display_code AS "displayCode",r.status AS state,r.revision
    FROM anonymous_study_research_states r JOIN anonymous_study_participants p ON p.id=r.participant_id AND p.study_id=r.study_id
    WHERE r.study_id=${studyId} AND r.status IN ('WITHDRAWAL_PENDING','EXCLUDED') ORDER BY r.participant_id LIMIT 25 OFFSET ${(page-1)*25}`
  await owner(prisma,userId,studyId)
  return {list,page,pageSize:25}
}
