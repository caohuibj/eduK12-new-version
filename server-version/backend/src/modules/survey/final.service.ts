import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { prepareCanonicalSubmission, assertCanonicalSubmissionPayloadSize, validateSubmissionId } from '../../services/instrumentFinalSubmit'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { canonicalHash } from '../assessment-runtime/canonical'
import { computeSurveyFinal, SurveyFinalValidationError } from './final.compute'
import { SurveyScaleTimingError } from './timing.definition'
import { ensureSurveyFlowAssignment } from './flow.assignment'
import { hashResearchCredential } from './identity.service'
import { verifiedSurveyAttempt } from './admission.service'
import { SurveyWaveError } from './waves.service'
import type { ResearchFrozenPublication } from './publication.service'

export class SurveyFinalError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
function blocked(message:string): never {throw new SurveyFinalError(403,message)}
function invalid(message:string): never {throw new SurveyFinalError(409,message)}
const proofShape=/^[A-Za-z0-9_-]{43}$/
export interface FinalInput {
  publicId:string
  attemptId:string
  accessCredential:string
  researchCode?:string
  submissionId:string
  answers:Record<string,unknown>
  itemTimings?:unknown
  presentation?:{shownBlocks:string[]}
}
/** No per-item network scoring or database writes; a complete attempt makes
 * one atomic encrypted FINAL with the same canonical submit utilities used
 * by formal Scale/SJT/Composite execution paths.
 */
export async function submitResearchFinal(input:FinalInput){
  if(process.env.SURVEY_PUBLICATION_ENABLED!=='true')
    blocked('Survey 研究提交尚未启用')
  if(!proofShape.test(input.accessCredential))blocked('作答凭证无效')
  validateSubmissionId(input.submissionId)
  // Zero business identity authority is inferred from a Study Code.
  const known=await verifiedSurveyAttempt({
    publicId:input.publicId,attemptId:input.attemptId,
    researchCode:input.researchCode,accessCredential:input.accessCredential,
  })
  const canonical=prepareCanonicalSubmission({
    publicationId:known.publicationId,definitionDigest:known.definitionDigest,
    answers:input.answers,
  })
  assertCanonicalSubmissionPayloadSize(canonical,1024*1024,'研究 FINAL 作答')
  return withFinalOnlyCompletionTransaction(async tx=>{
    // Match Project -> Wave -> Attempt ordering used by pause/close/hard-stop.
    // The Wave SHARE lock serializes the FINAL decision with HARD_STOP's
    // Wave UPDATE; a stop committed before this lock must reject the FINAL.
    await tx.$queryRaw`SELECT id FROM survey_projects
      WHERE id=${known.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_waves
      WHERE id=${known.waveId} AND project_id=${known.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_wave_attempts
      WHERE id=${input.attemptId} AND project_id=${known.projectId}
        AND wave_id=${known.waveId} FOR UPDATE`
    const attempt=await tx.surveyWaveAttempt.findFirst({where:{
      id:input.attemptId,projectId:known.projectId,waveId:known.waveId,
    },include:{wave:{include:{publication:true}}}})
    if(!attempt||!attempt.wave.publication||attempt.participantId!==known.participantId)
      blocked('作答记录不属于此研究入口')
    const wave=attempt.wave
    const publication=wave.publication
    if(!publication)blocked('冻结研究版本已失效')
    if(publication.id!==known.publicationId||
      publication.definitionDigest!==known.definitionDigest)
      invalid('提交时研究冻结版本已经发生变化')
    const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
    if(canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==publication.definitionDigest)
      blocked('冻结研究定义校验失败')
    // Flow assignment is fixed to this Attempt while serialized with the
    // Wave/Attempt and participant's current credential and revocation locks.
    const assignment=snapshot.flow?await ensureSurveyFlowAssignment(tx,{
      projectId:known.projectId,waveId:known.waveId,attemptId:input.attemptId,
      participantId:known.participantId,researchCode:input.researchCode,
      accessCredential:input.accessCredential,snapshot,
    }):null
    if(!snapshot.flow&&attempt.participantId){
      if(!input.researchCode)blocked('需再次提供本人研究编号与私密凭证')
      // Serialize this committed FINAL decision against REVOKE_ACCESS and
      // WITHDRAW_DATA. A cached pre-transaction credential check is insufficient.
      await tx.$queryRaw`SELECT id FROM survey_participants
        WHERE id=${attempt.participantId} AND project_id=${known.projectId} FOR SHARE`
      const person=await tx.surveyParticipant.findFirst({where:{
        id:attempt.participantId,projectId:known.projectId,
        researchCode:input.researchCode,status:'ACTIVE',
        credentialHash:hashResearchCredential(input.accessCredential),credentialRevokedAt:null,
      }})
      if(!person)blocked('研究身份已失效')
    }else if(!snapshot.flow&&attempt.sessionHash!==hashResearchCredential(input.accessCredential))
      blocked('单次研究作答凭证已失效')
    const existing=await tx.surveyWaveFinal.findUnique({where:{attemptId:attempt.id}})
    if(existing){
      if(existing.payloadHash!==canonical.hash||existing.submissionId!==input.submissionId)
        invalid('此波次已有不同的正式 FINAL，不能再次覆盖')
      return {attemptId:attempt.id,receiptId:existing.id,completedAt:existing.completedAt,
        status:'COMPLETED' as const,idempotent:true,
        generalText:wave.generalText||'感谢参与研究，您的回答已完整提交。'}
    }
    if(attempt.status!=='STARTED')invalid('这份作答已经关闭或终止')
    const now=new Date()
    const finishUntil=wave.finishUntil||wave.closesAt
    if(wave.hardStopAt||!finishUntil||finishUntil<=now)
      blocked('研究作答提交窗口已结束')
    const consent=await tx.surveyConsent.findFirst({where:{
      projectId:known.projectId,waveId:wave.id,attemptId:attempt.id,
      accepted:true,consentVersion:wave.consentVersion,
    },select:{id:true}})
    if(!consent)blocked('当前研究缺少有效的知情同意记录')
    let calculated
    try{
      calculated=computeSurveyFinal(snapshot,input.answers,assignment,
        input.presentation?.shownBlocks,'FINAL',input.itemTimings)
    }catch(e){
      if(e instanceof SurveyFinalValidationError||e instanceof SurveyScaleTimingError)
        throw new SurveyFinalError(400,e.path+'：'+e.message)
      throw e
    }
    if(calculated.definitionDigest!==publication.definitionDigest)
      blocked('所提交作答与冻结内容不一致')
    const resultsHash=canonicalHash(JSON.parse(JSON.stringify(calculated)))
    const resultsCipher=encryptUnifiedRuntimePayload(calculated)
    const receipt=await tx.surveyWaveFinal.create({data:{
      id:randomUUID(),attemptId:attempt.id,projectId:known.projectId,waveId:wave.id,
      publicationId:publication.id,submissionId:input.submissionId,
      definitionDigest:publication.definitionDigest,payloadHash:canonical.hash,
      resultsCipher,resultsHash,
    }})
    const updated=await tx.surveyWaveAttempt.updateMany({
      where:{id:attempt.id,projectId:known.projectId,status:'STARTED'},
      data:{status:'COMPLETED',completedAt:receipt.completedAt},
    })
    if(updated.count!==1)invalid('作答状态变更发生冲突')
    await tx.surveyAttemptCheckpoint.deleteMany({where:{attemptId:attempt.id}})
    return {attemptId:attempt.id,receiptId:receipt.id,completedAt:receipt.completedAt,
      status:'COMPLETED' as const,idempotent:false,
      generalText:wave.generalText||'感谢参与研究，您的回答已完整提交。'}
  })
}
export async function readGeneralForOwnAttempt(input:{
  publicId:string;attemptId:string;researchCode?:string;accessCredential:string
}){
  const valid=await verifiedSurveyAttempt(input)
  const final=await prisma.surveyWaveFinal.findFirst({where:{
    attemptId:valid.attemptId,projectId:valid.projectId,waveId:valid.waveId,
  },select:{completedAt:true,id:true,definitionDigest:true}})
  if(!final||valid.status!=='COMPLETED')invalid('本波次尚未完成正式提交')
  if(final.definitionDigest!==valid.definitionDigest)blocked('冻结研究报告来源校验失败')
  // ALLOWLIST: no scoring, raw answers, canonical SJT weights, or longitudinal
  // psychological interpretation may be exposed via participant General.
  return {kind:'GENERAL_ONLY' as const,completedAt:final.completedAt,
    text:valid.generalText||'感谢参与研究。研究结果将按研究说明进行汇总分析，不构成个人心理诊断。',
    disclaimer:'本研究反馈仅作一般说明，不提供未经验证的常模、诊断或个体能力等级。'}
}
