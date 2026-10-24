import { assertSurveyScaleCollectionAllowed } from './scale-collection-guard'
import {rawParticipantFeedback} from './participant-feedback'
import {interpretSurveyFinal} from './final-interpretation.service'
import { verifySurveyCognitiveReferences,loadSurveyCognitiveResults,assertSurveyCognitiveLockedAnswers } from './cognitive.results'
import type { SurveyCognitiveReference } from './cognitive.definition'
import { cognitiveParentUnit,cognitiveParticipantFeedback } from './measurement.result'
import type { FrozenUnitResult,SurveyComputedFinal } from './final.compute'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { prepareCanonicalSubmission, assertCanonicalSubmissionPayloadSize, validateSubmissionId } from '../../services/instrumentFinalSubmit'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { canonicalHash } from '../assessment-runtime/canonical'
import { verifySurveyFinalPublication, SurveyFinalValidationError } from './final.compute'
import { SurveyScaleTimingError } from './timing.definition'
import { ensureSurveyFlowAssignment,assignedSurveySnapshot } from './flow.assignment'
import { hashResearchCredential } from './identity.service'
import { verifiedSurveyAttempt,verifiedSurveyFinalLocator } from './admission.service'
import { SurveyWaveError } from './waves.service'
import type { ResearchFrozenPublication } from './publication.service'

export class SurveyFinalError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
function blocked(message:string): never {throw new SurveyFinalError(403,message)}
function invalid(message:string): never {throw new SurveyFinalError(409,message)}
const proofShape=/^[A-Za-z0-9_-]{43}$/
const defaultGeneralText='感谢参与研究。研究结果将按研究说明进行汇总分析，不构成个人心理诊断。'
// Explicit participant allowlist shared by first-commit and independently
// authorized GENERAL reads. Never pass FINAL results or authority through it.
function generalReceipt(text:string|null|undefined,completedAt:Date){
  return {text:text||defaultGeneralText,
    disclaimer:'本研究反馈仅作一般说明，不提供未经验证的常模、诊断或个体能力等级。',completedAt}
}
export interface FinalInput {
  publicId:string
  attemptId:string
  accessCredential:string
  researchCode?:string
  submissionId:string
  answers:Record<string,unknown>
  itemTimings?:unknown
  cognitiveReferences?:SurveyCognitiveReference[]
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
  const known=await verifiedSurveyFinalLocator({
    publicId:input.publicId,attemptId:input.attemptId,
    researchCode:input.researchCode,accessCredential:input.accessCredential,
  })
  const canonical=prepareCanonicalSubmission({
    publicationId:known.publicationId,definitionDigest:known.definitionDigest,
    answers:input.answers,
    ...(input.cognitiveReferences!==undefined?{cognitiveReferences:input.cognitiveReferences}:{}),
    ...(input.itemTimings!==undefined?{itemTimings:input.itemTimings}:{}),
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
    },select:{id:true,participantId:true,status:true,excludedAt:true,sessionHash:true,
      wave:{select:{id:true,consentVersion:true,generalText:true,finishUntil:true,closesAt:true,hardStopAt:true,
        publication:{select:{id:true,definitionDigest:true,compiledSnapshot:true}}}}}})
    if(!attempt||!attempt.wave.publication||attempt.participantId!==known.participantId)
      blocked('作答记录不属于此研究入口')
    const wave=attempt.wave
    const publication=wave.publication
    if(!publication)blocked('冻结研究版本已失效')
    if(publication.id!==known.publicationId||
      publication.definitionDigest!==known.definitionDigest)
      invalid('提交时研究冻结版本已经发生变化')
    if((publication.compiledSnapshot as unknown as ResearchFrozenPublication)?.runtimeStatus!=='SURVEY_FINAL_V1')
      blocked('冻结研究定义校验失败')
    const verified=verifySurveyFinalPublication(
      publication.compiledSnapshot as unknown as ResearchFrozenPublication,publication.definitionDigest)
    if(!verified)
      blocked('冻结研究定义校验失败')
    const snapshot=verified.snapshot
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
      },select:{id:true}})
      if(!person)blocked('研究身份已失效')
    }else if(!snapshot.flow&&attempt.sessionHash!==hashResearchCredential(input.accessCredential))
      blocked('单次研究作答凭证已失效')
    // Withdrawal retains immutable FINAL data for audit, but its old bearer
    // must not recover a successful receipt after the Attempt is excluded.
    if(!['STARTED','COMPLETED'].includes(attempt.status)||attempt.excludedAt!==null)
      invalid('这份作答已经关闭或撤回')
    const hasCognitive=snapshot.units.some(unit=>unit.kind==='COGNITIVE')
    // New cognitive parents recheck current consent/window even for receipt
    // replay. Historical noncognitive replay behavior remains unchanged.
    if(hasCognitive){
      const end=wave.finishUntil??wave.closesAt
      if(wave.hardStopAt||!end||end<=new Date())blocked('研究作答提交窗口已结束')
      const liveConsent=await tx.surveyConsent.findFirst({where:{projectId:known.projectId,waveId:wave.id,
        attemptId:attempt.id,accepted:true,consentVersion:wave.consentVersion},select:{id:true}})
      if(!liveConsent)blocked('当前研究缺少有效的知情同意记录')
    }
    const existing=await tx.surveyWaveFinal.findUnique({where:{attemptId:attempt.id},
      select:{id:true,completedAt:true,payloadHash:true,submissionId:true}})
    if(existing){
      if(existing.payloadHash!==canonical.hash||existing.submissionId!==input.submissionId)
        invalid('此波次已有不同的正式 FINAL，不能再次覆盖')
      return {attemptId:attempt.id,receiptId:existing.id,completedAt:existing.completedAt,
        status:'COMPLETED' as const,idempotent:true,
        generalText:wave.generalText||defaultGeneralText}
    }
    // Reuse only this transaction's selected immutable definition. Current
    // authority was checked above; computation still consumes the frozen union.
    const selectedSnapshot=assignedSurveySnapshot(snapshot,assignment)
    await assertSurveyScaleCollectionAllowed(tx,selectedSnapshot)
    if(attempt.status!=='STARTED')invalid('这份作答已经关闭或终止')
    const now=new Date()
    const finishUntil=wave.finishUntil||wave.closesAt
    if(wave.hardStopAt||!finishUntil||finishUntil<=now)
      blocked('研究作答提交窗口已结束')
    const consent=hasCognitive||await tx.surveyConsent.findFirst({where:{
      projectId:known.projectId,waveId:wave.id,attemptId:attempt.id,
      accepted:true,consentVersion:wave.consentVersion,
    },select:{id:true}})
    if(!consent)blocked('当前研究缺少有效的知情同意记录')
    const cognitiveResults=new Map<string,FrozenUnitResult>()
    if(snapshot.units.some(unit=>unit.kind==='COGNITIVE')||input.cognitiveReferences?.length){
      await assertSurveyCognitiveLockedAnswers(tx,attempt.id,input.answers)
      const references=await verifySurveyCognitiveReferences(tx,{projectId:known.projectId,waveId:wave.id,
        attemptId:attempt.id,publicationId:publication.id,snapshot:selectedSnapshot,references:input.cognitiveReferences??[]})
      const results=await loadSurveyCognitiveResults(tx,{projectId:known.projectId,waveId:wave.id,
        attemptId:attempt.id,publicationId:publication.id,references})
      for(const loaded of results){
        const unit=snapshot.units.find(unit=>unit.instrumentKey===loaded.reference.slotKey)!
        cognitiveResults.set(unit.instrumentKey,cognitiveParentUnit(unit,loaded))
      }
    }
    let calculated
    try{
      calculated=verified.compute(input.answers,assignment,
        input.presentation?.shownBlocks,'FINAL',input.itemTimings,cognitiveResults)
    }catch(e){
      if(e instanceof SurveyFinalValidationError||e instanceof SurveyScaleTimingError)
        throw new SurveyFinalError(400,e.path+'：'+e.message)
      throw e
    }
    const reachedCognitive=calculated.units.filter(unit=>unit.kind==='COGNITIVE'&&!unit.notExecuted)
    if(reachedCognitive.length!==cognitiveResults.size||
      reachedCognitive.some(unit=>!cognitiveResults.has(unit.instrumentKey)))
      invalid('认知结果引用集合与最终可达路径不一致')
    if(calculated.definitionDigest!==publication.definitionDigest)
      blocked('所提交作答与冻结内容不一致')
    const interpretation=await interpretSurveyFinal(tx,{projectId:known.projectId,waveId:wave.id,attemptId:attempt.id,
      publicationId:publication.id,definitionDigest:publication.definitionDigest,selectedSnapshot,calculated})
    if(interpretation)calculated.interpretation=interpretation
    const resultsHash=canonicalHash(JSON.parse(JSON.stringify(calculated)))
    const resultsCipher=encryptUnifiedRuntimePayload(calculated)
    const receipt=await tx.surveyWaveFinal.create({data:{
      id:randomUUID(),attemptId:attempt.id,projectId:known.projectId,waveId:wave.id,
      publicationId:publication.id,submissionId:input.submissionId,
      definitionDigest:publication.definitionDigest,payloadHash:canonical.hash,
      resultsCipher,resultsHash,
    },select:{id:true,completedAt:true}})
    const updated=await tx.surveyWaveAttempt.updateMany({
      where:{id:attempt.id,projectId:known.projectId,status:'STARTED'},
      data:{status:'COMPLETED',completedAt:receipt.completedAt},
    })
    if(updated.count!==1)invalid('作答状态变更发生冲突')
    await tx.surveyAttemptCheckpoint.deleteMany({where:{attemptId:attempt.id}})
    // This is the validated submission-time receipt, returned only after the
    // enclosing transaction commits. Replays and independent reads must still
    // use current authorization; no receipt or participant authority is cached.
    const general=generalReceipt(wave.generalText,receipt.completedAt)
    return {attemptId:attempt.id,receiptId:receipt.id,completedAt:receipt.completedAt,
      status:'COMPLETED' as const,idempotent:false,
      generalText:general.text,generalReceipt:general}
  })
}
export async function readGeneralForOwnAttempt(input:{
  publicId:string;attemptId:string;researchCode?:string;accessCredential:string
}){
  const valid=await verifiedSurveyAttempt(input)
  const hasFeedback=valid.compiledSnapshot.units.some(unit=>unit.kind==='COGNITIVE'||unit.participantFeedback?.mode==='DESCRIPTIVE')
  if(hasFeedback)return prisma.$transaction(async tx=>{
    // Serialize disclosure with current withdrawal/credential/window governance.
    await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${valid.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${valid.waveId}
      AND project_id=${valid.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${valid.attemptId}
      AND project_id=${valid.projectId} FOR SHARE`
    const attempt=await tx.surveyWaveAttempt.findFirst({where:{id:valid.attemptId,projectId:valid.projectId,
      waveId:valid.waveId},select:{status:true,excludedAt:true,participantId:true,sessionHash:true,
        wave:{select:{consentVersion:true,generalText:true,finishUntil:true,closesAt:true,hardStopAt:true}}}})
    if(!attempt||attempt.status!=='COMPLETED'||attempt.excludedAt!==null||
      attempt.participantId!==valid.participantId)blocked('研究反馈不可访问')
    if(attempt.participantId){
      await tx.$queryRaw`SELECT id FROM survey_participants WHERE id=${attempt.participantId}
        AND project_id=${valid.projectId} FOR SHARE`
      const person=await tx.surveyParticipant.findFirst({where:{id:attempt.participantId,
        projectId:valid.projectId,researchCode:input.researchCode,status:'ACTIVE',credentialRevokedAt:null,
        credentialHash:hashResearchCredential(input.accessCredential)},select:{id:true}})
      if(!person)blocked('研究身份已失效')
    }else if(attempt.sessionHash!==hashResearchCredential(input.accessCredential))blocked('研究凭证已失效')
    const consent=await tx.surveyConsent.findFirst({where:{projectId:valid.projectId,waveId:valid.waveId,
      attemptId:valid.attemptId,accepted:true,consentVersion:attempt.wave.consentVersion},select:{id:true}})
    if(!consent)blocked('当前研究缺少有效的知情同意记录')
    const final=await tx.surveyWaveFinal.findUnique({where:{attemptId:valid.attemptId},
      select:{definitionDigest:true,resultsCipher:true,resultsHash:true,completedAt:true}})
    if(!final||final.definitionDigest!==valid.definitionDigest)blocked('研究反馈来源校验失败')
    const result=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
    if(canonicalHash(result)!==final.resultsHash||result.definitionDigest!==valid.definitionDigest)
      blocked('研究反馈结果摘要校验失败')
    const collectionEnd=attempt.wave.finishUntil??attempt.wave.closesAt
    const collectionClosed=attempt.wave.hardStopAt!==null||
      (collectionEnd!==null&&collectionEnd<=new Date())
    const measurements=[];let pending=false
    for(const unit of valid.compiledSnapshot.units.filter(unit=>unit.kind==='COGNITIVE'||unit.participantFeedback?.mode==='DESCRIPTIVE')){
      const stored=result.units.find(candidate=>candidate.instrumentKey===unit.instrumentKey)
      if(!stored)blocked('研究反馈工具来源缺失')
      const feedback=unit.kind==='COGNITIVE'?cognitiveParticipantFeedback(unit,stored,collectionClosed):
        rawParticipantFeedback(unit,stored,collectionClosed)
      if(feedback?.pending)pending=true
      else if(feedback)measurements.push(feedback)
    }
    const general=generalReceipt(attempt.wave.generalText,final.completedAt)
    return measurements.length||pending?{kind:'DESCRIPTIVE' as const,...general,measurements,pending}:
      {kind:'GENERAL_ONLY' as const,...general}
  })
  const final=await prisma.surveyWaveFinal.findFirst({where:{
    attemptId:valid.attemptId,projectId:valid.projectId,waveId:valid.waveId,
  },select:{completedAt:true,id:true,definitionDigest:true}})
  if(!final||valid.status!=='COMPLETED')invalid('本波次尚未完成正式提交')
  if(final.definitionDigest!==valid.definitionDigest)blocked('冻结研究报告来源校验失败')
  // ALLOWLIST: no scoring, raw answers, canonical SJT weights, or longitudinal
  // psychological interpretation may be exposed via participant General.
  return {kind:'GENERAL_ONLY' as const,...generalReceipt(valid.generalText,final.completedAt)}
}
