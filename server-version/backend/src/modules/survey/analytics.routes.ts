import {createSurveyReferenceCandidate,readSurveyReferenceCandidate,reviewSurveyReferenceCandidate,publishSurveyReferenceCandidate,
  referenceCandidateView,surveyReferenceCreateSchema,surveyReferenceReviewSchema,surveyReferencePublishSchema} from './reference-candidates.service'
import {ContentReleaseError} from '../measurement-content/release'
import {createSurveyReinterpretation,readSurveyReinterpretation} from './reinterpretation.service'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {SurveyBuilderError} from './builder.service'
import {SurveyWaveError} from './waves.service'
import {readSurveyStoredReport,listSurveyStoredReports} from './report-results.service'
import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { surveyAnalyticsItemRequestSchema } from './analytics.request'
import { authenticateSurvey } from '../../middleware/auth'
import { success,error } from '../../utils/response'
import * as service from './analytics.read'
import {listSampleQuality,listSampleQualityHistory,setSampleQuality} from './sample-quality.service'
import {describeSurveyPairedScoresPaged,describeSurveyWaveItemPaged,describeSurveyWaveGroupsPaged} from './analytics.paged'
import { loadSurveyItemDictionary,loadSurveySource } from './analytics.source'
import { describeWave } from './analytics.descriptive'
import { describeSurveyFlowOperations } from './analytics.flow-operations'
import { assertRecentSurveyMfa } from './analytics.export.service'


export const surveyAnalyticsRouter=Router()
surveyAnalyticsRouter.use('/:pid/analytics',authenticateSurvey)
surveyAnalyticsRouter.use('/:pid/analytics',(_req,res,next)=>{
  if(process.env.SURVEY_ANALYTICS_ENABLED!=='true')
    return res.status(404).json({code:-1,message:'研究分析仍未完成正式验收',data:null})
  res.setHeader('Cache-Control','no-store')
  next()
})
const id=z.string().uuid()
const matched=z.object({baselineWaveId:id,followupWaveId:id}).strict()
const qualityPage=z.coerce.number().int().min(1).max(1000).default(1)
const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400)
    if(e instanceof service.SurveyAnalyticsError||e instanceof SurveyBuilderError||e instanceof SurveyWaveError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof ContentAuthorityError)return error(res,'没有此内容或数据解释能力',-1,403)
    if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
    next(e)
  }
}
// Researcher review is an analysis policy: never update immutable FINAL rows.
const review=z.object({
  revision:z.number().int().nonnegative(),
  verdict:z.enum(['INCLUDED','EXCLUDED']),
  reason:z.string().trim().min(2).max(1000),
}).strict()
surveyAnalyticsRouter.get('/:pid/analytics/quality/attempts',wrap(req=>
  listSampleQuality(req.user!.userId,id.parse(req.params.pid),
    qualityPage.parse(req.query.page))))
surveyAnalyticsRouter.get('/:pid/analytics/quality/attempts/:attemptId/history',wrap(req=>
  listSampleQualityHistory(req.user!.userId,id.parse(req.params.pid),
    id.parse(req.params.attemptId),qualityPage.parse(req.query.page))))
surveyAnalyticsRouter.post('/:pid/analytics/quality/attempts/:attemptId',wrap(req=>
  setSampleQuality({actorUserId:req.user!.userId,
    projectId:id.parse(req.params.pid),attemptId:id.parse(req.params.attemptId),
    ...review.parse(req.body)})))

const key=z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const flowCohortInput=z.object({
  category:z.object({instrumentKey:key,itemKey:key}).strict().optional(),
  score:z.object({instrumentKey:key,scoreKey:key}).strict().optional(),
}).strict()
surveyAnalyticsRouter.post('/:pid/analytics/waves/:wid/flow-cohort',wrap(req=>{
  const details=flowCohortInput.parse(req.body)
  return describeSurveyFlowOperations(req,{
    projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),
    ...details,
  })
}))
surveyAnalyticsRouter.get('/:pid/analytics/overview',wrap(req=>
  service.waveOverview(req.user!.userId,id.parse(req.params.pid))))
surveyAnalyticsRouter.post('/:pid/analytics/paired-counts',wrap(req=>{
  const params=matched.parse(req.body)
  return service.matchedWaveCounts({
    actorUserId:req.user!.userId,projectId:id.parse(req.params.pid),...params,
  })
}))

const measurement=z.object({
  baselineWaveId:id,followupWaveId:id,
  instrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  scoreKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
}).strict()

surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/items/dictionary',wrap(async req=>{
  assertRecentSurveyMfa(req)
  const projectId=id.parse(req.params.pid),waveId=id.parse(req.params.wid)
  return loadSurveyItemDictionary({actorUserId:req.user!.userId,projectId,waveId})
}))
surveyAnalyticsRouter.post('/:pid/analytics/waves/:wid/items/paged',wrap(req=>{
  assertRecentSurveyMfa(req)
  return describeSurveyWaveItemPaged({
    actorUserId:req.user!.userId,projectId:id.parse(req.params.pid),
    waveId:id.parse(req.params.wid),...surveyAnalyticsItemRequestSchema.parse(req.body),
  })
}))
surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/items',wrap(async req=>{
  const projectId=id.parse(req.params.pid),waveId=id.parse(req.params.wid)
  const source=await loadSurveySource({actorUserId:req.user!.userId,projectId,
    waveIds:[waveId],maxFinals:250,includeWideSchema:true})
  return describeWave(source,waveId)
}))
const groupRequest=z.object({
  groupInstrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  groupItemKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  scoreInstrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  scoreKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
}).strict()
surveyAnalyticsRouter.post('/:pid/analytics/waves/:wid/group-scores',wrap(async req=>{
  assertRecentSurveyMfa(req)
  const projectId=id.parse(req.params.pid),waveId=id.parse(req.params.wid)
  const input=groupRequest.parse(req.body)
  try{
    return await describeSurveyWaveGroupsPaged({
      actorUserId:req.user!.userId,projectId,waveId,...input,
    })
  }catch(e){
    if(e instanceof service.SurveyAnalyticsError)throw e
    throw new service.SurveyAnalyticsError(409,
      e instanceof Error?e.message:'此分组无法计算')
  }
}))
surveyAnalyticsRouter.post('/:pid/analytics/paired-scores',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return describeSurveyPairedScoresPaged({
    actorUserId:req.user!.userId,
    projectId:id.parse(req.params.pid),...measurement.parse(req.body),
  })
}))


surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/finals/:finalId/reports/:instrumentKey',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return readSurveyStoredReport(req.user!.userId,{projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),
    finalId:id.parse(req.params.finalId),instrumentKey:key.parse(req.params.instrumentKey)})
}))

const reinterpretBody=z.object({requestId:id,grantId:id,instrumentKey:key,reportReleaseId:id.optional(),
  references:z.array(z.object({releaseId:id,entryKey:z.string().regex(/^[a-f0-9]{64}$/),priority:z.number().int().safe()}).strict()).max(100)}).strict()
surveyAnalyticsRouter.post('/:pid/analytics/waves/:wid/finals/:finalId/interpretations',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return createSurveyReinterpretation(req.user!.userId,{...reinterpretBody.parse(req.body),projectId:id.parse(req.params.pid),
    waveId:id.parse(req.params.wid),finalId:id.parse(req.params.finalId)})
}))
surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/finals/:finalId/interpretations/:artifactId',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return readSurveyReinterpretation(req.user!.userId,{projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),
    finalId:id.parse(req.params.finalId),artifactId:id.parse(req.params.artifactId)})
}))

surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/reports',wrap(async req=>{
  assertRecentSurveyMfa(req)
  const query=z.object({afterId:id.optional()}).strict().parse(req.query)
  return listSurveyStoredReports(req.user!.userId,{projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),...query})
}))

const candidatePath='/:pid/analytics/waves/:wid/reference-candidates'
const referenceCreateBody=surveyReferenceCreateSchema.omit({projectId:true,waveId:true})
const referenceReviewBody=surveyReferenceReviewSchema.omit({projectId:true,waveId:true,candidateId:true})
const referencePublishBody=surveyReferencePublishSchema.omit({projectId:true,waveId:true,candidateId:true})
surveyAnalyticsRouter.post(candidatePath,wrap(async req=>{
  assertRecentSurveyMfa(req)
  const result=await createSurveyReferenceCandidate(req.user!.userId,{...referenceCreateBody.parse(req.body),
    projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid)})
  return {candidateId:result.candidateId,...referenceCandidateView(result.candidate),exclusionCounts:result.exclusionCounts}
}))
surveyAnalyticsRouter.get(candidatePath+'/:candidateId',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return readSurveyReferenceCandidate(req.user!.userId,{...z.object({grantId:id}).strict().parse(req.query),
    projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),candidateId:id.parse(req.params.candidateId)})
}))
surveyAnalyticsRouter.post(candidatePath+'/:candidateId/reviews',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return reviewSurveyReferenceCandidate(req.user!.userId,{...referenceReviewBody.parse(req.body),
    projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),candidateId:id.parse(req.params.candidateId)})
}))
surveyAnalyticsRouter.post(candidatePath+'/:candidateId/publish',wrap(async req=>{
  assertRecentSurveyMfa(req)
  return publishSurveyReferenceCandidate(req.user!.userId,{...referencePublishBody.parse(req.body),
    projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),candidateId:id.parse(req.params.candidateId)})
}))
