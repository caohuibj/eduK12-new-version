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
/** Project -> Wave -> owner/token guards are ordered consistently with
 * public START, PAUSE/CLOSE and the finalization lifecycle.
 */
async function activePublicWave(tx:Tx,projectId:string,waveId:string,rawEntry:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(rawEntry))return fail()
  const projects=await tx.$queryRaw<Array<{id:string;collectionMode:string}>>`
    SELECT id,collection_mode AS "collectionMode" FROM "survey_projects"
    WHERE id=${projectId} AND status='ACTIVE' FOR SHARE
  `
  if(!projects.length||projects[0].collectionMode!=='LINKED_WAVES')
    return fail('研究项目当前不接受新的多波次参与者')
  const rows=await tx.$queryRaw<Array<{
    waveId:string;ordinal:number;allowNewParticipants:boolean;
    consentVersion:number;startsCount:number;quotaStarts:number|null
  }>>`
    SELECT w.id AS "waveId",w.ordinal,
      w.allow_new_participants AS "allowNewParticipants",
      w.consent_version AS "consentVersion",
      w.starts_count AS "startsCount",w.quota_starts AS "quotaStarts"
    FROM "survey_waves" w
    JOIN "survey_entry_tokens" t ON t.wave_id=w.id AND t.project_id=w.project_id
    JOIN "survey_projects" p ON p.id=w.project_id
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE w.id=${waveId} AND w.project_id=${projectId}
      AND p.status='ACTIVE' AND w.status='OPEN'
      AND w.publication_id IS NOT NULL AND w.hard_stop_at IS NULL
      AND (w.opens_at IS NULL OR w.opens_at<=statement_timestamp())
      AND (w.closes_at IS NULL OR w.closes_at>statement_timestamp())
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled=TRUE
      AND t.token_hash=${sha256(rawEntry)} AND t.revoked_at IS NULL
      AND t.expires_at>statement_timestamp()
    FOR UPDATE OF w FOR SHARE OF t,u,g,m
  `
  const wave=rows[0]
  if(!wave)return fail('研究目前未开放参加')
  if(wave.ordinal>1&&!wave.allowNewParticipants)
    return fail('此波次暂不接受新的研究编号')
  if(wave.quotaStarts!==null&&wave.startsCount>=wave.quotaStarts)
    return fail('研究名额已用尽，请勿领取无法启动的研究编号')
  return wave
}

/** Initial LINKED enrollment atomically claims exactly one Wave Attempt.
 * The first subsequent START recovers it; issuing unstartable identities is
 * prohibited. This follows the contract that quota counts parent Attempts.
 */
export async function createLinkedResearchIdentity(input:{
  projectId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean
}):Promise<{researchCode:string;accessCredential:string;attemptId:string}>{
  if(!input.consent)return fail('需要先同意研究内跨波次关联说明')
  const secret=opaque(),participantId=randomUUID(),researchCode=code(),attemptId=randomUUID()
  await prisma.$transaction(async tx=>{
    const wave=await activePublicWave(tx,input.projectId,input.waveId,input.entryToken)
    if(input.consentVersion!==wave.consentVersion)
      return fail('研究说明已经更新，请重新确认')
    const claimed=await tx.surveyWave.updateMany({
      where:{id:input.waveId,projectId:input.projectId,status:'OPEN',
        startsCount:wave.startsCount},
      data:{startsCount:{increment:1}},
    })
    if(claimed.count!==1)return fail('研究名额出现并发竞争，请重新领取')
    await tx.surveyParticipant.create({data:{
      id:participantId,projectId:input.projectId,researchCode,
      credentialHash:sha256(secret),consentVersion:input.consentVersion,
      status:'ACTIVE',
    }})
    await tx.surveyWaveAttempt.create({data:{
      id:attemptId,projectId:input.projectId,waveId:input.waveId,
      participantId,status:'STARTED',
    }})
    await tx.surveyConsent.create({data:{
      id:randomUUID(),projectId:input.projectId,waveId:input.waveId,
      participantId,attemptId,consentVersion:input.consentVersion,accepted:true,
    }})
  })
  return {researchCode,accessCredential:secret,attemptId}
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
    // Lock the owning project before exclusion to serialize with any
    // pending sensitive export ticket creation.
    await tx.$queryRaw`SELECT id FROM "survey_projects"
      WHERE id=${input.projectId} FOR UPDATE`
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
    // An already-created export may still contain withdrawn responses.
    // Revoke future downloads atomically with the participant exclusion.
    await tx.surveyExportTicket.updateMany({where:{
      projectId:input.projectId,status:'READY',
    },data:{status:'REVOKED'}})
    await tx.surveyProject.update({where:{id:input.projectId},
      data:{revision:{increment:1}}})
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
    await tx.$queryRaw`SELECT id FROM "survey_projects"
      WHERE id=${project.id} FOR UPDATE`
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
    await tx.surveyExportTicket.updateMany({where:{
      projectId:project.id,status:'READY',
    },data:{status:'REVOKED'}})
    await tx.surveyProject.update({where:{id:project.id},
      data:{revision:{increment:1}}})
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:null,
      projectId:project.id,action:'SINGLE_ATTEMPT_DATA_WITHDRAWAL',
      metadata:{waveId:attempt.waveId,retention:'PENDING_REVIEW'}}})
    return {excludedAttempts:1,status:'WITHDRAWN',retention:'PENDING_REVIEW'}
  })
}
