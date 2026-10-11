import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { prepareCanonicalSubmission,assertCanonicalSubmissionPayloadSize } from '../../services/instrumentFinalSubmit'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { verifiedSurveyAttempt } from './admission.service'
import { ensureSurveyFlowAssignment } from './flow.assignment'
import { computeSurveyFinal,SurveyFinalValidationError } from './final.compute'
import { SurveyFinalError,type FinalInput } from './final.service'
import type { ResearchFrozenPublication } from './publication.service'

/** Screen-out is NOT FINAL. Only a coarse Attempt state survives; incomplete
 * qualifying Form answers are neither scored nor written to SurveyWaveFinal.
 */
export async function screenOutResearchAttempt(input:FinalInput){
  if(process.env.SURVEY_PUBLICATION_ENABLED!=='true')
    throw new SurveyFinalError(403,'研究参与未开放')
  const own=await verifiedSurveyAttempt(input)
  if(!own.compiledSnapshot.flow)
    throw new SurveyFinalError(400,'当前冻结研究没有资格筛除流程')
  const canonical=prepareCanonicalSubmission({
    publicationId:own.publicationId,definitionDigest:own.definitionDigest,answers:input.answers,
  })
  assertCanonicalSubmissionPayloadSize(canonical,1024*1024,'研究筛除核验')
  return withFinalOnlyCompletionTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM survey_projects
      WHERE id=${own.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_waves
      WHERE id=${own.waveId} AND project_id=${own.projectId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM survey_wave_attempts
      WHERE id=${own.attemptId} AND project_id=${own.projectId} FOR UPDATE`
    const attempt=await tx.surveyWaveAttempt.findFirst({where:{
      id:own.attemptId,projectId:own.projectId,waveId:own.waveId,
    },include:{wave:{include:{publication:true}}}})
    if(!attempt||attempt.participantId!==own.participantId)
      throw new SurveyFinalError(403,'研究身份已失效')
    if(attempt.status==='SCREENED_OUT')return {
      status:'SCREENED_OUT' as const,idempotent:true,
    }
    if(attempt.status!=='STARTED')
      throw new SurveyFinalError(409,'研究作答已经完成或停止')
    const wave=attempt.wave,publication=wave.publication
    if(!publication||publication.id!==own.publicationId||
      publication.definitionDigest!==own.definitionDigest)
      throw new SurveyFinalError(409,'冻结版本已经变化')
    const now=new Date()
    const deadline=wave.finishUntil??wave.closesAt
    if(wave.hardStopAt||!deadline||deadline<=now)
      throw new SurveyFinalError(403,'研究窗口已关闭')
    const consent=await tx.surveyConsent.findFirst({where:{
      projectId:own.projectId,waveId:own.waveId,attemptId:own.attemptId,
      accepted:true,consentVersion:wave.consentVersion,
    },select:{id:true}})
    if(!consent)throw new SurveyFinalError(403,'研究参与缺少有效同意记录')
    const frozen=publication.compiledSnapshot as unknown as ResearchFrozenPublication
    if(canonicalHash(JSON.parse(JSON.stringify(frozen)))!==publication.definitionDigest)
      throw new SurveyFinalError(409,'冻结研究摘要校验失败')
    const assignment=await ensureSurveyFlowAssignment(tx,{
      projectId:own.projectId,waveId:own.waveId,attemptId:own.attemptId,
      participantId:own.participantId,researchCode:input.researchCode,
      accessCredential:input.accessCredential,snapshot:frozen,
    })
    if(!assignment)throw new SurveyFinalError(400,'筛除必须来自冻结 Flow')
    let result
    try{
      result=computeSurveyFinal(frozen,input.answers,assignment,
        input.presentation?.shownBlocks,'SCREEN_OUT')
    }catch(e){
      if(e instanceof SurveyFinalValidationError)
        throw new SurveyFinalError(400,e.path+'：'+e.message)
      throw e
    }
    if(result.executionTrace?.termination!=='SCREEN_OUT')
      throw new SurveyFinalError(400,'当前研究路径并未筛除')
    const updated=await tx.surveyWaveAttempt.updateMany({where:{
      id:own.attemptId,projectId:own.projectId,status:'STARTED',
    },data:{status:'SCREENED_OUT',completedAt:now}})
    if(updated.count!==1)throw new SurveyFinalError(409,'重复结束作答请求')
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:null,projectId:own.projectId,
      action:'SURVEY_FLOW_SCREENED_OUT',
      metadata:{waveId:own.waveId,flowDigest:frozen.flow!.flowDigest,
        outcome:'SCREENED_OUT',rawAnswersPersisted:false},
    }})
    return {status:'SCREENED_OUT' as const,idempotent:false}
  })
}
