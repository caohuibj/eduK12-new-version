import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success,error } from '../../utils/response'
import * as service from './analytics.read'
import { loadSurveySource } from './analytics.source'
import { describeWave,describePairedScores,describeWaveGroups } from './analytics.descriptive'


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
const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400)
    if(e instanceof service.SurveyAnalyticsError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
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
surveyAnalyticsRouter.get('/:pid/analytics/waves/:wid/items',wrap(async req=>{
  const projectId=id.parse(req.params.pid),waveId=id.parse(req.params.wid)
  const source=await loadSurveySource({actorUserId:req.user!.userId,projectId,
    waveIds:[waveId],maxFinals:250})
  return describeWave(source,waveId)
}))
const groupRequest=z.object({
  groupInstrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  groupItemKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  scoreInstrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  scoreKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
}).strict()
surveyAnalyticsRouter.post('/:pid/analytics/waves/:wid/group-scores',wrap(async req=>{
  const projectId=id.parse(req.params.pid),waveId=id.parse(req.params.wid)
  const input=groupRequest.parse(req.body)
  const source=await loadSurveySource({
    actorUserId:req.user!.userId,projectId,waveIds:[waveId],maxFinals:250,
  })
  try{return describeWaveGroups(source,{waveId,...input})}
  catch(e){throw new service.SurveyAnalyticsError(409,
    e instanceof Error?e.message:'此分组无法计算')}
}))
surveyAnalyticsRouter.post('/:pid/analytics/paired-scores',wrap(async req=>{
  const projectId=id.parse(req.params.pid),input=measurement.parse(req.body)
  const source=await loadSurveySource({
    actorUserId:req.user!.userId,projectId,
    waveIds:[input.baselineWaveId,input.followupWaveId],maxFinals:250,includeWideSchema:true,
  })
  if(source.collectionMode!=='LINKED_WAVES')
    throw new service.SurveyAnalyticsError(409,'此研究未启用跨波次身份关联')
  return describePairedScores(source,input)
}))
