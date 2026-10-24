import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success,error } from '../../utils/response'
import { createSurveyExport,downloadSurveyExport } from './analytics.export.service'
import { SurveyAnalyticsError } from './analytics.read'

export const surveyExportsRouter=Router()
const pid=z.string().guid(), eid=z.string().guid()
const downloadSelection=z.object({part:z.enum(['csv','codebook','manifest']).optional()}).strict()
const create=z.object({
  format:z.enum(['INTERPRETATION_LONG','RAW_WAVE','RAW_LONG','RAW_WIDE','SCORE_LONG','SCORE_WIDE','COGNITIVE_TRIAL_LONG']),
  waveId:pid.optional(),includeFreeText:z.boolean().optional(),cursor:z.string().max(1300).optional(),
  completedFrom:z.string().datetime().optional(),completedBefore:z.string().datetime().optional(),
}).strict()
surveyExportsRouter.use('/:projectId/exports',authenticateSurvey)
surveyExportsRouter.use('/:projectId/exports',(req,res,next)=>{
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
// Keep fresh export creation narrow, but permit bounded signed continuation.
// All endpoints authenticate Survey first, so per-researcher budgets do not
// collide behind a school's NAT. Invalid cursors are rejected before any data
// read by decodeSurveyExportCursor; their request still consumes page budget.
const researcherKey=(req:Request)=>req.user?.userId||req.ip||'unknown'
const newExportLimit=createRedisRateLimiter({
  name:'survey-export-create',limit:3,windowSeconds:900,key:researcherKey,
})
const pageExportLimit=createRedisRateLimiter({
  name:'survey-export-page',limit:40,windowSeconds:900,key:researcherKey,
})
const downloadLimit=createRedisRateLimiter({
  name:'survey-export-download',limit:40,windowSeconds:900,key:researcherKey,
})
surveyExportsRouter.post('/:projectId/exports',
  (req,res,next)=>{
    const limiter=typeof req.body?.cursor==='string'?pageExportLimit:newExportLimit
    return limiter(req,res,next)
  },
  wrap(req=>createSurveyExport(req,{projectId:pid.parse(req.params.projectId),...create.parse(req.body)})))
surveyExportsRouter.get('/:projectId/exports/:exportId/download',
  downloadLimit,
  wrap(async req=>{
    const {part}=downloadSelection.parse(req.query)
    // Authorize, decrypt, verify and audit every read using the existing service.
    // Only serialize the requested file; old clients can still read the bundle.
    const artifact=await downloadSurveyExport(req,{projectId:pid.parse(req.params.projectId),
      exportId:eid.parse(req.params.exportId)})
    return part?{id:artifact.id,format:artifact.format,[part]:artifact[part]}:artifact
  }))
