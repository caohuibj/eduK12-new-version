import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

type Tx=Prisma.TransactionClient
export class ResearchIdentityError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
function fail(message='研究身份或进入凭证无效'): never {
  throw new ResearchIdentityError(403,message)
}
const sha256=(text:string)=>createHash('sha256').update(text).digest('hex')
const opaque=()=>randomBytes(32).toString('base64url')
const code=()=>('R-'+randomBytes(8).toString('hex').toUpperCase())

/** A bearer of a public-entry capability can start recruitment; it is NEVER a
 * participant identity or a way to view previous answers. */
async function activePublicWave(tx:Tx,projectId:string,waveId:string,rawEntry:string,forJoin:boolean){
  if(!/^[A-Za-z0-9_-]{43}$/.test(rawEntry))return fail()
  const rows=await tx.$queryRaw<Array<{
    projectId:string;waveId:string;collectionMode:string;ordinal:number;
    allowNewParticipants:boolean;consentVersion:number;
  }>>`
    SELECT p.id AS "projectId",w.id AS "waveId",
      p.collection_mode AS "collectionMode",w.ordinal,
      w.allow_new_participants AS "allowNewParticipants",
      w.consent_version AS "consentVersion"
    FROM "survey_projects" p
    JOIN "survey_waves" w ON w.project_id=p.id
    JOIN "survey_entry_tokens" t ON t.wave_id=w.id AND t.project_id=p.id
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    WHERE p.id=${projectId} AND w.id=${waveId}
      AND p.status='ACTIVE' AND w.status='OPEN'
      AND w.publication_id IS NOT NULL
      AND (w.opens_at IS NULL OR w.opens_at<=statement_timestamp())
      AND (w.closes_at IS NULL OR w.closes_at>statement_timestamp())
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND g.status='ACTIVE'
      AND t.token_hash=${sha256(rawEntry)} AND t.revoked_at IS NULL
      AND t.expires_at>statement_timestamp()
    FOR SHARE OF p,w,t,u,g
  `
  const row=rows[0]
  if(!row)return fail('研究目前未开放参加')
  if(forJoin&&row.collectionMode==='LINKED_WAVES'&&row.ordinal>1&&!row.allowNewParticipants)
    return fail('此波次暂不接受新的研究编号')
  return row
}

/** Single stable project-local pseudonym, backed by a separate 256-bit proof. */
export async function createLinkedResearchIdentity(input:{
  projectId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean
}):Promise<{researchCode:string;accessCredential:string}>{
  if(!input.consent)return fail('需要先同意研究内跨波次关联说明')
  const secret=opaque(),participantId=randomUUID(),researchCode=code()
  await prisma.$transaction(async tx=>{
    const wave=await activePublicWave(tx,input.projectId,input.waveId,input.entryToken,true)
    if(wave.collectionMode!=='LINKED_WAVES')return fail('当前研究不支持跨波次编号')
    if(input.consentVersion!==wave.consentVersion)return fail('研究说明已经更新，请重新确认')
    await tx.surveyParticipant.create({data:{
      id:participantId,projectId:input.projectId,researchCode,
      credentialHash:sha256(secret),consentVersion:input.consentVersion,
      status:'ACTIVE',
    }})
    await tx.surveyConsent.create({data:{
      id:randomUUID(),projectId:input.projectId,waveId:input.waveId,
      participantId,consentVersion:input.consentVersion,accepted:true,
    }})
  })
  return {researchCode,accessCredential:secret}
}

/** Recovery never accepts the publicly displayable research code alone. */
export async function recoverLinkedResearchIdentity(input:{
  projectId:string;researchCode:string;accessCredential:string
}):Promise<{participantId:string;researchCode:string}>{
  if(!/^R-[A-Z0-9]{8,32}$/.test(input.researchCode)||
    !/^[A-Za-z0-9_-]{43}$/.test(input.accessCredential))return fail()
  const rows=await prisma.$queryRaw<Array<{participantId:string;researchCode:string}>>`
    SELECT sp.id AS "participantId",sp.research_code AS "researchCode"
    FROM "survey_participants" sp
    JOIN "survey_projects" p ON p.id=sp.project_id
    WHERE sp.project_id=${input.projectId}
      AND sp.research_code=${input.researchCode}
      AND sp.credential_hash=${sha256(input.accessCredential)}
      AND sp.status='ACTIVE' AND sp.credential_revoked_at IS NULL
      AND p.collection_mode='LINKED_WAVES'
    LIMIT 1
  `
  if(rows.length!==1)return fail()
  return rows[0]
}

/** Revoke future bearer access. Previously finalized study data are NOT
 * automatically deleted; withdrawal is a distinct, consent-governed process. */
export async function revokeLinkedResearchAccess(input:{
  projectId:string;researchCode:string;accessCredential:string
}):Promise<{revoked:true}>{
  const identity=await recoverLinkedResearchIdentity(input)
  const changed=await prisma.surveyParticipant.updateMany({where:{
    id:identity.participantId,projectId:input.projectId,status:'ACTIVE',
    credentialHash:sha256(input.accessCredential),
  },data:{status:'REVOKED',credentialRevokedAt:new Date()}})
  if(changed.count!==1)return fail()
  return {revoked:true}
}

/** SINGLE_UNLINKED attempt proof, unrelated to a stable participant identity. */
export function freshUnlinkedSession(){
  const accessCredential=opaque()
  return {accessCredential,sessionHash:sha256(accessCredential)}
}

/** Deterministic login/audit digest; passwords and actual bearer tokens must
 * never be emitted in researcher lists, CSV or application logs. */
export const hashResearchCredential=(secret:string)=>sha256(secret)

/** Data withdrawal is separate from merely revoking future access. Frozen
 * FINAL rows remain immutable; all future valid-sample stats/exports exclude
 * attempts marked withdrawn, with an audit trail and retention review.
 */
export async function withdrawLinkedResearchData(input:{
  projectId:string;researchCode:string;accessCredential:string
}):Promise<{excludedAttempts:number;status:'WITHDRAWN';retention:'PENDING_REVIEW'}>{
  const participant=await recoverLinkedResearchIdentity(input)
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`
      SELECT id FROM "survey_participants"
      WHERE "id"=${participant.participantId} AND "project_id"=${input.projectId}
      FOR UPDATE
    `
    const current=await tx.surveyParticipant.findFirst({where:{
      id:participant.participantId,projectId:input.projectId,status:'ACTIVE',
      credentialHash:sha256(input.accessCredential),credentialRevokedAt:null,
    }})
    if(!current)fail()
    const when=new Date()
    await tx.surveyParticipant.update({where:{id:participant.participantId},data:{
      status:'WITHDRAWN',credentialRevokedAt:when,
    }})
    const excluded=await tx.surveyWaveAttempt.updateMany({where:{
      projectId:input.projectId,participantId:participant.participantId,
      excludedAt:null,status:{in:['STARTED','COMPLETED']},
    },data:{excludedAt:when,status:'WITHDRAWN'}})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:null,
      projectId:input.projectId,action:'PARTICIPANT_DATA_WITHDRAWAL',
      metadata:{excludedAttempts:excluded.count,retention:'PENDING_REVIEW'}}})
    return {excludedAttempts:excluded.count,status:'WITHDRAWN',retention:'PENDING_REVIEW'}
  })
}
export async function withdrawSingleResearchAttempt(input:{
  publicId:string;attemptId:string;accessCredential:string
}):Promise<{excludedAttempts:1;status:'WITHDRAWN';retention:'PENDING_REVIEW'}>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(input.accessCredential))fail()
  const proof=sha256(input.accessCredential)
  return prisma.$transaction(async tx=>{
    const project=await tx.surveyProject.findFirst({where:{
      publicId:input.publicId,collectionMode:'SINGLE_UNLINKED',
    },select:{id:true}})
    if(!project)fail()
    await tx.$queryRaw`
      SELECT id FROM survey_wave_attempts WHERE id=${input.attemptId}
        AND project_id=${project.id} FOR UPDATE
    `
    const attempt=await tx.surveyWaveAttempt.findFirst({where:{
      id:input.attemptId,projectId:project.id,participantId:null,sessionHash:proof,
      status:{in:['STARTED','COMPLETED']},excludedAt:null,
    }})
    if(!attempt)fail()
    await tx.surveyWaveAttempt.update({where:{id:attempt.id},data:{
      status:'WITHDRAWN',excludedAt:new Date(),
    }})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:null,
      projectId:project.id,action:'SINGLE_ATTEMPT_DATA_WITHDRAWAL',
      metadata:{waveId:attempt.waveId,retention:'PENDING_REVIEW'}}})
    return {excludedAttempts:1,status:'WITHDRAWN',retention:'PENDING_REVIEW'}
  })
}
