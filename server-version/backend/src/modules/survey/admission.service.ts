import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  createLinkedResearchIdentity,recoverLinkedResearchIdentity,
  freshUnlinkedSession,hashResearchCredential,
} from './identity.service'
import { SurveyWaveError } from './waves.service'
import type { ResearchFrozenPublication } from './publication.service'
import { allocateResearchFlowOnAdmission } from './flow.assignment'
import { canonicalHash } from '../assessment-runtime/canonical'

type Tx=Prisma.TransactionClient
function blocked(message='研究准入或个人凭证无效'): never {throw new SurveyWaveError(403,message)}
const enabled=()=>{
  if(process.env.SURVEY_WORKSPACE_ENABLED!=='true'||process.env.SURVEY_PUBLICATION_ENABLED!=='true')
    blocked('Survey 匿名研究尚未启用')
}
const publicIdFormat=/^[a-f0-9-]{36}$/i
const secretPattern=/^[A-Za-z0-9_-]{43}$/
const codePattern=/^R-[A-Z0-9]{8,32}$/
async function projectPublic(tx:Tx,publicId:string){
  if(!publicIdFormat.test(publicId))blocked('研究入口无效')
  const project=await tx.surveyProject.findFirst({where:{publicId},
    select:{id:true,title:true,description:true,collectionMode:true,status:true}})
  if(!project)blocked('研究入口无效')
  return project!
}
async function openWaveLocked(tx:Tx,projectId:string,waveId:string,linked:boolean){
  // Admission and project pause/close acquire locks in the same order:
  // Project -> Wave. A committed PAUSE cannot race a newly created Attempt.
  const [project]=await tx.$queryRaw<Array<{
    ownerUserId:string;status:string;collectionMode:string
  }>>`SELECT "owner_user_id" AS "ownerUserId","status","collection_mode" AS "collectionMode"
    FROM "survey_projects" WHERE "id"=${projectId} FOR SHARE`
  if(!project||project.status!=='ACTIVE')blocked('研究项目暂停或已结束')
  await tx.$queryRaw`SELECT id FROM "survey_waves"
    WHERE id=${waveId} AND project_id=${projectId} FOR UPDATE`
  const wave=await tx.surveyWave.findFirst({where:{id:waveId,projectId}})
  if(!wave||!wave.publicationId||wave.status!=='OPEN')
    blocked('研究波次尚未开放')
  const now=new Date()
  if((wave.opensAt&&wave.opensAt>now)||(wave.closesAt&&wave.closesAt<=now)||wave.hardStopAt)
    blocked('本波次未在允许的采集时间内')
  const owners=await tx.$queryRaw<Array<{id:string}>>`
    SELECT u.id FROM "users" u
      JOIN "survey_researcher_grants" g ON g.user_id=u.id
      JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE u.id=${project.ownerUserId} AND u.account_domain='SURVEY'
      AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
    FOR SHARE OF u,g,m
  `
  if(!owners.length)blocked('研究发布者暂不可用')
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
const claimQuota=async(tx:Tx,waveId:string,startsCount:number)=>{
  const updated=await tx.surveyWave.updateMany({where:{id:waveId,startsCount},
    data:{startsCount:{increment:1}}})
  if(updated.count!==1)blocked('研究名额出现竞争，请重新进入')
}
export async function getPublicResearchInfo(publicId:string){
  enabled()
  return prisma.$transaction(async tx=>{
    const project=await projectPublic(tx,publicId)
    const now=new Date()
    const waves=project.status==='ACTIVE'?await tx.surveyWave.findMany({where:{projectId:project.id,
      status:'OPEN',publicationId:{not:null},hardStopAt:null,
      OR:[{opensAt:null},{opensAt:{lte:now}}],
      AND:[{OR:[{closesAt:null},{closesAt:{gt:now}}]}]},
      orderBy:{ordinal:'asc'},take:100,select:{
        id:true,title:true,ordinal:true,status:true,consentText:true,consentVersion:true,
        opensAt:true,closesAt:true,allowNewParticipants:true,
      }}):[]
    return {project:{name:project.title,description:project.description,
      collectionMode:project.collectionMode,status:project.status},
      waves}
  })
}
/** Opt-in pseudonymous T1 or late-join only, using a separate high-entropy
 * recruitment bearer. The private participant secret is shown only once.
 */
export async function joinLinkedStudy(input:{
  publicId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean
}){
  enabled()
  const project=await prisma.$transaction(tx=>projectPublic(tx,input.publicId))
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
  publicId:string;researchCode:string;accessCredential:string
}){
  enabled()
  const project=await prisma.$transaction(tx=>projectPublic(tx,input.publicId))
  if(project.collectionMode!=='LINKED_WAVES')blocked('此项目没有稳定的研究编号')
  const identity=await recoverLinkedResearchIdentity({
    projectId:project.id,researchCode:input.researchCode,
    accessCredential:input.accessCredential,
  })
  const waves=await prisma.surveyWave.findMany({where:{
    projectId:project.id,publicationId:{not:null},
    status:{in:['OPEN','PAUSED','CLOSED']},
  },take:100,orderBy:{ordinal:'asc'},select:{
    id:true,title:true,ordinal:true,status:true,opensAt:true,closesAt:true,
    consentText:true,consentVersion:true,allowNewParticipants:true,
  }})
  const attempts=await prisma.surveyWaveAttempt.findMany({where:{
    projectId:project.id,participantId:identity.participantId,
  },select:{id:true,waveId:true,status:true,completedAt:true}})
  const state=new Map(attempts.map(a=>[a.waveId,a]))
  const now=new Date()
  // Freezing a T2/T3 Publication is not consent to reveal future-wave
  // titles or disclosures. Only the current open Wave or own history appears.
  const visible=waves.filter(w=>state.has(w.id)||
    (project.status==='ACTIVE'&&w.status==='OPEN'
      &&(!w.opensAt||w.opensAt<=now)&&(!w.closesAt||w.closesAt>now)))
  return {collectionMode:'LINKED_WAVES',waves:visible.map(w=>({
    ...w,attempt:state.get(w.id)||null,
  }))}
}
export async function startLinkedWave(input:{
  publicId:string;waveId:string;researchCode:string;
  accessCredential:string;consentVersion:number;consent:boolean
}){
  enabled()
  if(!input.consent||!codePattern.test(input.researchCode)||!secretPattern.test(input.accessCredential))
    blocked('研究参与身份或知情同意不合法')
  const project=await prisma.$transaction(tx=>projectPublic(tx,input.publicId))
  const identity=await recoverLinkedResearchIdentity({
    projectId:project.id,researchCode:input.researchCode,
    accessCredential:input.accessCredential,
  })
  return prisma.$transaction(async tx=>{
    const wave=await openWaveLocked(tx,project.id,input.waveId,true)
    // Project-scoped credential remains valid at the moment of admission.
    // Revocation cannot commit between the admission credential check and
    // its newly allocated Attempt; preserve Project -> Wave -> Person locks.
    // Exclusive from the start: taking SHARE and later promoting to UPDATE
    // for an encrypted group assignment can deadlock across T2/T3 requests.
    await tx.$queryRaw`SELECT id FROM survey_participants
      WHERE id=${identity.participantId} AND project_id=${project.id} FOR UPDATE`
    const live=await tx.surveyParticipant.findFirst({where:{
      id:identity.participantId,projectId:project.id,status:'ACTIVE',
      credentialHash:hashResearchCredential(input.accessCredential),credentialRevokedAt:null,
    }})
    if(!live)blocked('研究编号的私密凭证已经失效')
    if(input.consentVersion!==wave.consentVersion)
      blocked('研究说明已更新，请重新确认')
    const previous=await tx.surveyWaveAttempt.findFirst({where:{
      projectId:project.id,waveId:wave.id,participantId:identity.participantId,
    }})
    if(previous)return {attemptId:previous.id,waveId:wave.id,status:previous.status,recovered:true}
    if(!hasQuota(wave))blocked('本波次参与名额已用尽')
    await claimQuota(tx,wave.id,wave.startsCount)
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
      researchCode:input.researchCode,accessCredential:input.accessCredential,
    })
    return {attemptId:row.id,waveId:wave.id,status:'STARTED',recovered:false}
  })
}
export async function startSingleUnlinkedWave(input:{
  publicId:string;waveId:string;entryToken:string;consentVersion:number;consent:boolean
}){
  enabled()
  if(!input.consent)blocked('必须先同意本研究的参与说明')
  const project=await prisma.$transaction(tx=>projectPublic(tx,input.publicId))
  const proof=freshUnlinkedSession()
  return prisma.$transaction(async tx=>{
    const wave=await openWaveLocked(tx,project.id,input.waveId,false)
    await validateEntry(tx,project.id,wave.id,input.entryToken)
    if(input.consentVersion!==wave.consentVersion)blocked('研究说明已更新，请重新确认')
    if(!hasQuota(wave))blocked('本波次参与名额已用尽')
    await claimQuota(tx,wave.id,wave.startsCount)
    const row=await tx.surveyWaveAttempt.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      sessionHash:proof.sessionHash,status:'STARTED',
    }})
    await tx.surveyConsent.create({data:{
      id:randomUUID(),projectId:project.id,waveId:wave.id,
      attemptId:row.id,consentVersion:wave.consentVersion,accepted:true,
    }})
    await allocateResearchFlowOnAdmission(tx,{
      publicationId:wave.publicationId!,projectId:project.id,waveId:wave.id,
      attemptId:row.id,participantId:null,accessCredential:proof.accessCredential,
    })
    return {attemptId:row.id,waveId:wave.id,status:'STARTED',
      accessCredential:proof.accessCredential}
  })
}
/** Called by private FINAL and public task read; every request proves current
 * Survey participant authority independently of Researcher/Training cookies.
 */
export async function verifiedSurveyAttempt(input:{
  publicId:string;attemptId:string;researchCode?:string;accessCredential:string
}):Promise<{attemptId:string;projectId:string;waveId:string;participantId:string|null;
  status:string;publicationId:string;definitionDigest:string;
  compiledSnapshot:ResearchFrozenPublication;generalText:string;finishUntil:Date|null;
  hardStopAt:Date|null}> {
  enabled()
  if(!secretPattern.test(input.accessCredential))blocked()
  const project=await prisma.$transaction(tx=>projectPublic(tx,input.publicId))
  const result=await prisma.$transaction(async tx=>{
    const attempt=await tx.surveyWaveAttempt.findFirst({where:{
      id:input.attemptId,projectId:project.id,
    },include:{wave:{include:{publication:true}}}})
    if(!attempt||!attempt.wave.publication)blocked()
    if(attempt.participantId){
      if(!input.researchCode)blocked()
      const linked=await recoverLinkedResearchIdentity({
        projectId:project.id,researchCode:input.researchCode,accessCredential:input.accessCredential,
      })
      if(linked.participantId!==attempt.participantId)blocked()
    }else if(attempt.sessionHash!==hashResearchCredential(input.accessCredential))blocked()
    const pub=attempt.wave.publication
    const snapshot=pub!.compiledSnapshot as unknown as ResearchFrozenPublication
    if(snapshot.runtimeStatus!=='SURVEY_FINAL_V1'||canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==pub!.definitionDigest)
      blocked('研究冻结定义不可用')
    return {attemptId:attempt.id,projectId:project.id,waveId:attempt.waveId,
      participantId:attempt.participantId,status:attempt.status,
      publicationId:pub!.id,definitionDigest:pub!.definitionDigest,compiledSnapshot:snapshot,
      generalText:attempt.wave.generalText,finishUntil:attempt.wave.finishUntil,
      hardStopAt:attempt.wave.hardStopAt}
  })
  return result
}
