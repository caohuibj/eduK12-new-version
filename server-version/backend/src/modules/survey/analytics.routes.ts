import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success,error } from '../../utils/response'
import * as service from './analytics.read'

export const surveyAnalyticsRouter=Router()
surveyAnalyticsRouter.use(authenticateSurvey)
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
