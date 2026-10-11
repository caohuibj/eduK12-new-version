import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success,error } from '../../utils/response'
import { createSurveyExport,downloadSurveyExport } from './analytics.export.service'
import { SurveyAnalyticsError } from './analytics.read'

export const surveyExportsRouter=Router()
const pid=z.string().uuid(), eid=z.string().uuid()
const create=z.object({
  format:z.enum(['RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE']),
  waveId:pid.optional(),includeFreeText:z.boolean().optional(),
  completedFrom:z.string().datetime().optional(),completedBefore:z.string().datetime().optional(),
}).strict()
surveyExportsRouter.use(authenticateSurvey)
surveyExportsRouter.use((req,res,next)=>{
  if(process.env.SURVEY_ANALYTICS_ENABLED!=='true'){
    return res.status(404).json({code:-1,message:'研究分析仍未完成正式验收',data:null})
  }
  res.setHeader('Cache-Control','no-store')
  next()
})
const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'导出字段格式无效',-1,400)
    if(e instanceof SurveyAnalyticsError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
surveyExportsRouter.post('/:projectId/exports',
  createRedisRateLimiter({name:'survey-export-create',limit:3,windowSeconds:900}),
  wrap(req=>createSurveyExport(req,{projectId:pid.parse(req.params.projectId),...create.parse(req.body)})))
surveyExportsRouter.get('/:projectId/exports/:exportId/download',
  createRedisRateLimiter({name:'survey-export-download',limit:20,windowSeconds:900}),
  wrap(req=>downloadSurveyExport(req,{projectId:pid.parse(req.params.projectId),
    exportId:eid.parse(req.params.exportId)})))
