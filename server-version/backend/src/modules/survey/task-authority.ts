import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { verifiedSurveyAttempt } from './admission.service'
import { hashResearchCredential } from './identity.service'
import { ensureSurveyFlowAssignment,assignedSurveySnapshot } from './flow.assignment'
import type { ResearchFrozenPublication } from './publication.service'
export type SurveyTaskProof={publicId:string;attemptId:string;accessCredential:string;researchCode?:string}
export type VerifiedSurveyTask=Awaited<ReturnType<typeof verifiedSurveyAttempt>>
/** Host authority only. Tool-specific eligibility, disclosure and frozen scientific
 * protocol must be checked by the caller before child admission. */
/** All mutating and participant-read paths share the existing Survey lock order.
 * The Project SHARE serializes revocation/withdrawal; Wave SHARE serializes HARD_STOP.
 * Holding Attempt UPDATE serializes starts, restarts, child FINAL and parent FINAL. */
export async function lockSurveyTaskAccess(tx:Prisma.TransactionClient,proof:SurveyTaskProof,known:VerifiedSurveyTask,
  policy:{kind:'COGNITIVE'|'SITUATIONAL';allowCompleted:boolean;fail:(status:number,message:string)=>never}){
  const {allowCompleted,fail}=policy
  const tool=policy.kind==='COGNITIVE'?'认知任务':'情境化测评'
  await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${known.waveId} AND project_id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${known.attemptId}
    AND project_id=${known.projectId} AND wave_id=${known.waveId} FOR UPDATE`
  const attempt=await tx.surveyWaveAttempt.findFirst({where:{
    id:known.attemptId,projectId:known.projectId,waveId:known.waveId,
  },include:{wave:{include:{publication:true}}}})
  if(!attempt||attempt.participantId!==known.participantId||attempt.excludedAt!==null
    ||!(allowCompleted?['STARTED','COMPLETED']:['STARTED']).includes(attempt.status))
    fail(403,'研究作答已经结束、撤回或不属于当前入口')
  const wave=attempt!.wave,publication=wave.publication
  if(!publication||publication.id!==known.publicationId||publication.definitionDigest!==known.definitionDigest
    ||canonicalHash(JSON.parse(JSON.stringify(publication.compiledSnapshot)))!==known.definitionDigest)
    fail(409,`${tool}的冻结研究定义已失效`)
  const end=wave.finishUntil??wave.closesAt
  if(wave.hardStopAt||!end||end<=new Date())fail(403,`研究${tool}完成窗口已经结束`)
  const hash=hashResearchCredential(proof.accessCredential)
  if(attempt!.participantId){
    if(!proof.researchCode)fail(403,'请提供本人研究编号和私密凭证')
    await tx.$queryRaw`SELECT id FROM survey_participants WHERE id=${attempt!.participantId}
      AND project_id=${known.projectId} FOR UPDATE`
    const participant=await tx.surveyParticipant.findFirst({where:{
      id:attempt!.participantId,projectId:known.projectId,researchCode:proof.researchCode,
      credentialHash:hash,status:'ACTIVE',credentialRevokedAt:null,
    },select:{id:true}})
    if(!participant)fail(403,'研究参与凭证已撤回或失效')
  }else if(attempt!.sessionHash!==hash)fail(403,'研究参与凭证无效')
  const consent=await tx.surveyConsent.findFirst({where:{
    projectId:known.projectId,waveId:known.waveId,attemptId:known.attemptId,
    accepted:true,consentVersion:wave.consentVersion,
  },select:{id:true}})
  if(!consent)fail(403,'当前研究缺少有效的知情同意记录')
  const snapshot=publication!.compiledSnapshot as unknown as ResearchFrozenPublication
  const assignment=snapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'
    ?await ensureSurveyFlowAssignment(tx,{projectId:known.projectId,waveId:known.waveId,
      attemptId:known.attemptId,participantId:known.participantId,researchCode:proof.researchCode,
      accessCredential:proof.accessCredential,snapshot}):null
  return {attempt:attempt!,snapshot:assignment?assignedSurveySnapshot(snapshot,assignment):snapshot}
}
