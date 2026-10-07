import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { HEX_32_BYTE_KEY } from '../../utils/encryption'
import { decryptPublicAccessToken } from '../../services/publicAccessTokenCrypto'
import * as composite from '../composite/composite.service'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { compositeExportService } from '../composite/composite-export.service'
import { projectCompositeExportData, resolveCompositeExportProjectionBinding } from '../composite/composite-export-projection'

type Db = Prisma.TransactionClient
const hidden = (): never => { throw compositeNotFound('研究记录不存在或无访问权限') }
const validCredential = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)
export const createStudyCredential = () => randomBytes(32).toString('base64url')
export const deriveStudyRecovery = (participantId: string, waveId: string) => {
  const source = process.env.DATA_PSEUDONYM_KEY
  if (!source || !HEX_32_BYTE_KEY.test(source)) throw new Error('DATA_PSEUDONYM_KEY must be exactly 64 hex characters')
  const token = createHmac('sha256', Buffer.from(source,'hex')).update(`anonymous-study-attempt-v1\0${participantId}\0${waveId}`).digest('base64url')
  return {token,hash:hashRecoveryToken(token),participantKey:`study-wave:${participantId}:${waveId}`,anonymousCode:`ANON-${hashRecoveryToken(token).slice(0,8).toUpperCase()}`}
}

async function currentOwner(db: Db, userId: string, studyId: string) {
  const rows = await db.$queryRaw<Array<{id:string;title:string;status:string}>>`
    SELECT s.id,s.title,s.status FROM anonymous_studies s JOIN users u ON u.id=s.owner_user_id
    WHERE s.id=${studyId} AND s.owner_user_id=${userId} AND u.is_active=true AND u.is_frozen=false
      AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) LIMIT 1
  `
  if (!rows[0]) return hidden()
  return rows[0]
}
export async function createStudy(userId: string, title: string) {
  const owner = await prisma.user.findUnique({where:{id:userId},select:{role:true,isActive:true,isFrozen:true,expiresAt:true}})
  if (!owner || !['TEACHER','ADMIN'].includes(owner.role) || !owner.isActive || owner.isFrozen || (owner.expiresAt && owner.expiresAt<=new Date())) return hidden()
  const id=randomUUID()
  await prisma.$executeRaw`INSERT INTO anonymous_studies(id,owner_user_id,title) VALUES(${id},${userId},${title})`
  return {id,title,status:'ACTIVE'}
}
export async function listStudies(userId: string) {
  const list = await prisma.$queryRaw<Array<{id:string;title:string;status:string}>>`
    SELECT id,title,status FROM anonymous_studies WHERE owner_user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT 200
  `
  return {list}
}
export async function closeStudy(userId:string,studyId:string) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    await currentOwner(tx,userId,studyId)
    await tx.$executeRaw`UPDATE anonymous_studies SET status='CLOSED' WHERE id=${studyId} AND owner_user_id=${userId}`
    // A wave's ordinary public URL also admits single visitors. Stop both
    // entry paths together while leaving existing recovery credentials valid.
    await tx.$executeRaw`
      UPDATE composite_assessment_access_tokens t SET is_active=false
      FROM anonymous_study_waves w
      WHERE w.access_token_id=t.id AND w.study_id=${studyId} AND t.created_by=${userId}
    `
    return {status:'CLOSED'}
  })
}
export async function addWave(userId:string,role:UserRole,studyId:string, input:{compositeId:string;tokenId:string;title:string}) {
  // Both the study and underlying public delivery must belong to this publisher.
  const token=await composite.revealAccessToken(userId,role,input.compositeId,input.tokenId)
  await composite.getPublicCompositeInfo(token.token)
  return prisma.$transaction(tx=>insertWave(tx,userId,studyId,input,randomUUID(),token.token))
}
async function insertWave(tx:Db,userId:string,studyId:string,input:{compositeId:string;tokenId:string;title:string},id:string,token:string) {
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    const study=await currentOwner(tx,userId,studyId)
    if(study.status!=='ACTIVE') throw compositeForbidden('研究已结束')
    const binding=await tx.$queryRaw<Array<{id:string}>>`
      SELECT t.id FROM composite_assessment_access_tokens t JOIN composite_assessments c ON c.id=t.composite_assessment_id
      WHERE t.id=${input.tokenId} AND t.created_by=${userId} AND c.created_by=${userId} AND c.id=${input.compositeId} AND t.used_count=0 AND t.is_active=true
        AND NOT EXISTS(SELECT 1 FROM composite_assessment_attempts a WHERE a.access_token_id=t.id) FOR UPDATE OF t
    `
    if(!binding[0]) return hidden()
    const counts=await tx.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM anonymous_study_waves WHERE study_id=${studyId}`
    if(counts[0].count>=100) throw compositeBadRequest('每项研究最多 100 个波次')
    const existing=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_waves WHERE access_token_id=${input.tokenId}`
    if(existing.length) throw compositeBadRequest('该链接已绑定研究波次，请使用新的公开链接')
    const ordinal=counts[0].count+1
    await tx.$executeRaw`INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES(${id},${studyId},${input.tokenId},${input.title},${ordinal})`
    return {id,studyId,title:input.title,ordinal,tokenId:input.tokenId,entryPath:`/public/studies/waves/${id}/${encodeURIComponent(token)}`}
}
/** One durable request creates both objects or neither. A lost response can
 * replay the same UUID without consuming another link or wave ordinal. */
export async function createWaveWithLink(userId:string,role:UserRole,studyId:string,input:{requestId:string;compositeId:string;title:string;expiresAt:string;maxUses:number}) {
  const parsedExpiry=new Date(input.expiresAt)
  if(!Number.isFinite(parsedExpiry.getTime())) throw compositeBadRequest('请选择有效的波次有效期')
  const expiresAt=parsedExpiry.toISOString()
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
    const study=await currentOwner(tx,userId,studyId)
    if(study.status!=='ACTIVE') throw compositeForbidden('研究已结束')
    const previous=await tx.$queryRaw<Array<{studyId:string;compositeId:string;title:string;ordinal:number;tokenId:string;token:string|null;tokenEncrypted:string|null;expiresAt:Date;maxUses:number}>>`
      SELECT w.study_id AS "studyId",t.composite_assessment_id AS "compositeId",w.title,w.ordinal,t.id AS "tokenId",t.token,t.token_encrypted AS "tokenEncrypted",t.expires_at AS "expiresAt",t.max_uses AS "maxUses"
      FROM anonymous_study_waves w JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id WHERE w.id=${input.requestId}
    `
    if(previous[0]) {
      const row=previous[0]
      if(row.studyId!==studyId || row.compositeId!==input.compositeId || row.title!==input.title || row.expiresAt.toISOString()!==expiresAt || row.maxUses!==input.maxUses) throw compositeConflict('同一建立波次请求不能更换内容，请刷新后重试')
      const token=row.token || (row.tokenEncrypted ? decryptPublicAccessToken(row.tokenEncrypted) : null)
      if(!token) return hidden()
      return {id:input.requestId,studyId,title:row.title,ordinal:row.ordinal,tokenId:row.tokenId,entryPath:`/public/studies/waves/${input.requestId}/${encodeURIComponent(token)}`}
    }
    await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${input.compositeId} FOR UPDATE`
    const token=await composite.createAccessTokenForComposite(userId,role,input.compositeId,expiresAt,input.maxUses,tx)
    await composite.getPublicCompositeInfo(token.token,tx)
    return insertWave(tx,userId,studyId,{compositeId:input.compositeId,tokenId:token.id,title:input.title},input.requestId,token.token)
  })
}

type Wave = {id:string;studyId:string;studyTitle:string;studyStatus:string;title:string;ordinal:number;tokenId:string;compositeId:string;token:string|null;tokenEncrypted:string|null;active:boolean;expiresAt:Date;status:string;publicEnabled:boolean;ownerActive:boolean}
async function readWave(db:Db,waveId:string):Promise<Wave> {
  const rows=await db.$queryRaw<Wave[]>`
    SELECT w.id,w.study_id AS "studyId",s.title AS "studyTitle",s.status AS "studyStatus",w.title,w.ordinal,
      t.id AS "tokenId",c.id AS "compositeId",t.token,t.token_encrypted AS "tokenEncrypted",t.is_active AS active,t.expires_at AS "expiresAt",
      c.status::text AS status,c.public_enabled AS "publicEnabled",(u.is_active AND NOT u.is_frozen AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)) AS "ownerActive"
    FROM anonymous_study_waves w JOIN anonymous_studies s ON s.id=w.study_id JOIN users u ON u.id=s.owner_user_id
      JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id JOIN composite_assessments c ON c.id=t.composite_assessment_id
    WHERE w.id=${waveId} AND t.created_by=s.owner_user_id AND c.created_by=s.owner_user_id LIMIT 1
  `
  if(!rows[0] || !rows[0].ownerActive) return hidden()
  return rows[0]
}
const waveToken=(w:Wave):string => w.token || (w.tokenEncrypted ? (decryptPublicAccessToken(w.tokenEncrypted) ?? hidden()) : hidden())
function assertAdmission(w:Wave) {
  if(w.studyStatus!=='ACTIVE' || !w.active || w.expiresAt<=new Date() || w.status!=='PUBLISHED' || !w.publicEnabled) throw compositeForbidden('本波次暂不接受新作答')
}
export async function publicWaveInfo(waveId:string,token:string) {
  const w=await readWave(prisma,waveId)
  if(hashRecoveryToken(token)!==hashRecoveryToken(waveToken(w))) return hidden()
  let accepting=true
  try {assertAdmission(w);await composite.getPublicCompositeInfo(token)} catch(e) {
    const status=(e as {statusCode?:number}).statusCode
    if(!status || status<400 || status>=500)throw e
    accepting=false
  }
  // Even an expired entry can identify the study for explicit own-history login.
  return {id:w.id,studyId:w.studyId,studyTitle:w.studyTitle,title:w.title,ordinal:w.ordinal,accepting}
}
export async function joinStudy(waveId:string,token:string,consent:boolean) {
  if(!consent) throw compositeBadRequest('请先确认保存身份及研究内历史关联')
  const info=await publicWaveInfo(waveId,token)
  if(!info.accepting)throw compositeForbidden('本波次暂不接受新加入')
  const credential=createStudyCredential(),id=randomUUID(),displayCode=`P-${randomBytes(6).toString('hex').toUpperCase()}`
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${info.studyId} FOR UPDATE`
    const w=await readWave(tx,waveId);assertAdmission(w)
    await tx.$executeRaw`INSERT INTO anonymous_study_participants(id,study_id,credential_hash,display_code) VALUES(${id},${info.studyId},${hashRecoveryToken(credential)},${displayCode})`
  })
  return {studyId:info.studyId,credential,displayCode}
}
async function participant(db:Db,studyId:string,credential:string) {
  if(!validCredential(credential)) return hidden()
  const rows=await db.$queryRaw<Array<{id:string;displayCode:string;title:string;status:string}>>`
    SELECT p.id,p.display_code AS "displayCode",s.title,s.status FROM anonymous_study_participants p
    JOIN anonymous_studies s ON s.id=p.study_id JOIN users u ON u.id=s.owner_user_id
    WHERE p.study_id=${studyId} AND p.credential_hash=${hashRecoveryToken(credential)} AND p.status='ACTIVE'
      AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) LIMIT 1
  `
  if(!rows[0]) return hidden()
  return rows[0]
}
export async function participantHome(studyId:string,credential:string) {
  const p=await participant(prisma,studyId,credential)
  const rows=await prisma.$queryRaw<Array<{id:string;title:string;ordinal:number;attemptId:string|null;state:string|null;completedAt:Date|null;accepting:boolean}>>`
    SELECT w.id,w.title,w.ordinal,a.id AS "attemptId",a.status::text AS state,a.completed_at AS "completedAt",
      (s.status='ACTIVE' AND t.is_active AND t.expires_at>CURRENT_TIMESTAMP AND c.status='PUBLISHED' AND c.public_enabled
        AND (c.opens_at IS NULL OR c.opens_at<=CURRENT_TIMESTAMP) AND (c.expires_at IS NULL OR c.expires_at>CURRENT_TIMESTAMP)
        AND (t.max_uses=0 OR t.used_count<t.max_uses)) AS accepting
    FROM anonymous_study_waves w JOIN anonymous_studies s ON s.id=w.study_id
    JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id JOIN composite_assessments c ON c.id=t.composite_assessment_id
    LEFT JOIN anonymous_study_attempts sa ON sa.wave_id=w.id AND sa.participant_id=${p.id}
    LEFT JOIN composite_assessment_attempts a ON a.id=sa.attempt_id AND a.user_id IS NULL AND a.access_token_id=w.access_token_id
    WHERE w.study_id=${studyId} AND t.created_by=s.owner_user_id AND c.created_by=s.owner_user_id ORDER BY w.ordinal LIMIT 100
  `
  await participant(prisma,studyId,credential)
  return {studyId,title:p.title,displayCode:p.displayCode,waves:rows,limitations:['身份码只用于本研究；同一研究内多次作答可关联。','历史个人报告不等于可比较的长期变化；不同测验、版本和条件不能直接作差。']}
}
export async function startStudyWave(studyId:string,waveId:string,credential:string) {
  const p=await participant(prisma,studyId,credential), w=await readWave(prisma,waveId)
  if(w.studyId!==studyId) return hidden()
  assertAdmission(w)
  const recovery=deriveStudyRecovery(p.id,w.id)
  const data=await composite.startPublicAttempt(waveToken(w),undefined,{
    credential:recovery,
    beforeAdmission:async tx=>{
      // Lock study first, then identity: close and withdrawal serialize with start.
      await tx.$queryRaw`SELECT id FROM anonymous_studies WHERE id=${studyId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM anonymous_study_participants WHERE id=${p.id} FOR UPDATE`
      const current=await participant(tx,studyId,credential)
      if(current.id!==p.id) return hidden()
      assertAdmission(await readWave(tx,waveId))
      const existing=await tx.$queryRaw<Array<{attemptId:string}>>`SELECT attempt_id AS "attemptId" FROM anonymous_study_attempts WHERE wave_id=${waveId} AND participant_id=${p.id}`
      return existing[0]?.attemptId ?? null
    },
    afterAdmission:async(tx,attemptId)=>{
      await tx.$executeRaw`INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id) VALUES(${studyId},${waveId},${p.id},${attemptId})`
    },
  })
  await participant(prisma,studyId,credential)
  return {attemptId:data.attempt.id,state:data.attempt.status,recoveryToken:recovery.token}
}
export async function recoverStudyWave(studyId:string,waveId:string,credential:string) {
  const p=await participant(prisma,studyId,credential), w=await readWave(prisma,waveId)
  if(w.studyId!==studyId) return hidden()
  const rows=await prisma.$queryRaw<Array<{id:string;state:string}>>`
    SELECT a.id,a.status::text AS state FROM anonymous_study_attempts sa JOIN composite_assessment_attempts a ON a.id=sa.attempt_id
    WHERE sa.study_id=${studyId} AND sa.wave_id=${waveId} AND sa.participant_id=${p.id} AND a.user_id IS NULL AND a.access_token_id=${w.tokenId}
  `
  if(!rows[0]) return hidden()
  const recovery=deriveStudyRecovery(p.id,waveId)
  const own=await prisma.compositeAssessmentAttempt.findFirst({where:{id:rows[0].id,userId:null,recoveryTokenHash:recovery.hash},select:{id:true}})
  if(!own) return hidden()
  await participant(prisma,studyId,credential)
  return {attemptId:own.id,state:rows[0].state,recoveryToken:recovery.token}
}
export async function revokeStudyIdentity(studyId:string,credential:string) {
  const p=await participant(prisma,studyId,credential)
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM anonymous_study_participants WHERE id=${p.id} FOR UPDATE`
    await participant(tx,studyId,credential)
    await tx.$executeRaw`UPDATE anonymous_study_participants SET status='REVOKED' WHERE id=${p.id}`
    // Revoke embedded Cognitive capabilities as well as the parent attempt.
    await tx.$executeRaw`UPDATE cognitive_sessions SET recovery_token_hash=NULL
      WHERE composite_attempt_id IN (SELECT attempt_id FROM anonymous_study_attempts WHERE participant_id=${p.id}) AND user_id IS NULL`
    // Previously issued per-attempt capabilities cease authorizing resume/report.
    await tx.$executeRaw`UPDATE composite_assessment_attempts SET recovery_token_hash=NULL
      WHERE id IN (SELECT attempt_id FROM anonymous_study_attempts WHERE participant_id=${p.id}) AND user_id IS NULL`
  })
  return {status:'REVOKED'}
}
export async function waveStatistics(userId:string,studyId:string) {
  await currentOwner(prisma,userId,studyId)
  const list=await prisma.$queryRaw<Array<{id:string;title:string;ordinal:number;tokenId:string;participants:number;completedParticipants:number;attempts:number;completedAttempts:number;abandonedAttempts:number}>>`
    SELECT w.id,w.title,w.ordinal,w.access_token_id AS "tokenId",count(DISTINCT COALESCE(sa.participant_id,a.participant_key))::int AS participants,
      count(DISTINCT COALESCE(sa.participant_id,a.participant_key)) FILTER(WHERE a.status='COMPLETED')::int AS "completedParticipants",
      count(a.id)::int AS attempts,count(a.id) FILTER(WHERE a.status='COMPLETED')::int AS "completedAttempts",
      count(a.id) FILTER(WHERE a.status='ABANDONED')::int AS "abandonedAttempts"
    FROM anonymous_study_waves w JOIN anonymous_studies s ON s.id=w.study_id
    JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id JOIN composite_assessments c ON c.id=t.composite_assessment_id
    LEFT JOIN composite_assessment_attempts a ON a.access_token_id=w.access_token_id AND a.user_id IS NULL AND a.assignment_ref IS NULL
    LEFT JOIN anonymous_study_attempts sa ON sa.attempt_id=a.id AND sa.wave_id=w.id AND sa.study_id=w.study_id
    WHERE w.study_id=${studyId} AND t.created_by=${userId} AND c.created_by=${userId}
    GROUP BY w.id,w.title,w.ordinal,w.access_token_id ORDER BY w.ordinal LIMIT 100
  `
  await currentOwner(prisma,userId,studyId)
  return {list,countMeaning:'人数按研究内身份去重；单次访客仅按本次随机身份计数，不能识别同一人换设备或重复参与。CSV 仅含该波次已完成作答。'}
}
export async function exportWaveCsv(userId:string,role:UserRole,studyId:string,waveId:string) {
  await currentOwner(prisma,userId,studyId)
  const w=await readWave(prisma,waveId)
  if(w.studyId!==studyId) return hidden()
  await composite.getExportContext(userId,role,w.compositeId)
  const binding=await resolveCompositeExportProjectionBinding(w.compositeId,'teacher')
  const raw=await compositeExportService.getExportData(w.compositeId,{detail:'summary',anonymize:true,accessTokenId:w.tokenId,actor:{userId,role}})
  const data=projectCompositeExportData(raw,binding)
  const links=await prisma.$queryRaw<Array<{attemptId:string;displayCode:string}>>`
    SELECT sa.attempt_id AS "attemptId",p.display_code AS "displayCode" FROM anonymous_study_attempts sa
      JOIN anonymous_study_participants p ON p.id=sa.participant_id AND p.study_id=sa.study_id
    WHERE sa.study_id=${studyId} AND sa.wave_id=${waveId}
  `
  const codes=new Map(links.map(l=>[l.attemptId,l.displayCode]))
  data.fields.push({name:'study_participant_code',label:'研究内被试显示码（非登录凭证）',type:'string',width:80})
  for(const row of data.rows) row.study_participant_code=codes.get(String(row.A_attempt_id)) ?? null
  await currentOwner(prisma,userId,studyId)
  await composite.getExportContext(userId,role,w.compositeId)
  const current=await resolveCompositeExportProjectionBinding(w.compositeId,'teacher')
  const currentWave=await readWave(prisma,waveId)
  if(currentWave.studyId!==studyId || currentWave.tokenId!==w.tokenId || current.fingerprint!==binding.fingerprint) return hidden()
  return '\uFEFF'+compositeExportService.exportToCSV(data)
}
