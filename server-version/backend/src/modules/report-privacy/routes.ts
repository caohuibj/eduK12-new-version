import {Router,type Request,type Response,type NextFunction} from 'express'
import {z,ZodError} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {requireRecentSchoolMfa} from '../campus/mfa.middleware'
import {requireRecentTeacherMfa} from '../huiteacher/authority'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success} from '../../utils/response'
import {privacyScenarioSchema,savePreferenceSchema,
  type EducationProduct} from './schema'
import {readReportPrivacyPreferences,saveReportPrivacyPreferences,
  readReportPrivacyPolicyState,ReportPrivacyError} from './preferences.service'

const id=z.string().uuid()
const rate=createRedisRateLimiter({name:'report-privacy-preference-v1',
  limit:24,windowSeconds:900,key:req=>req.user?.userId??req.ip??'unknown'})

export function createReportPrivacyRoutes(product:EducationProduct){
  const router=Router()
  const featureGuard=(req:Request,res:Response,next:NextFunction)=>{
    res.setHeader('Cache-Control','no-store')
    if(process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED!=='true')
      return res.status(404).json({
        code:'REPORT_PRIVACY_NOT_ENABLED',message:'报告偏好设置尚未启用',data:null})
    next()
  }
  const authenticate=product==='HUISCHOOL'?authenticateSchool:authenticateHuiteacher
  const wrap=(work:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
    try{return success(res,await work(req))}
    catch(e){
      if(e instanceof ZodError)return res.status(400).json({
        code:'PRIVACY_REQUEST_INVALID',message:'偏好设置参数无效',data:null})
      if(e instanceof Error&&e.message==='PRIVACY_SCENARIO_PRODUCT_MISMATCH')
        return res.status(400).json({
          code:'PRIVACY_SCENARIO_PRODUCT_MISMATCH',message:'场景与产品不匹配',data:null})
      if(e instanceof ReportPrivacyError)return res.status(e.statusCode).json({
        code:e.code,message:'当前报告偏好未获授权或版本已改变',data:null})
      const err=e as {statusCode?:number;code?:string}
      if(typeof err?.statusCode==='number'&&err.statusCode>=400&&err.statusCode<500)
        return res.status(err.statusCode).json({
          code:err.code??'PRIVACY_REQUEST_DENIED',
          message:'偏好设置权限或并发状态已改变',data:null})
      throw e
    }
  })
  const root='/organizations/:organizationId/report-privacy'
  const common=(req:Request)=>({
    actor:req.user!,organizationId:id.parse(req.params.organizationId),
    product,scenario:privacyScenarioSchema.parse(req.query.scenario),
  })
  router.get(root+'/preferences',featureGuard,authenticate,wrap(req=>readReportPrivacyPreferences(common(req))))
  router.get(root+'/effective',featureGuard,authenticate,wrap(req=>{
    const query=z.object({scenario:privacyScenarioSchema,runId:id.optional()})
      .strict().parse(req.query)
    return readReportPrivacyPolicyState({
      actor:req.user!,organizationId:id.parse(req.params.organizationId),
      product,scenario:query.scenario,runId:query.runId})
  }))
  const stepUp=(req:Request,res:Response,next:NextFunction)=>{
    const body=savePreferenceSchema.safeParse(req.body)
    if(!body.success)return res.status(400).json({
      code:'PRIVACY_REQUEST_INVALID',message:'偏好设置参数无效',data:null})
    if(body.data.scope==='MY')return next()
    return (product==='HUISCHOOL'?requireRecentSchoolMfa:requireRecentTeacherMfa)(req,res,next)
  }
  router.put(root+'/preferences/:scenario',featureGuard,authenticate,rate,stepUp,wrap(req=>{
    const scenario=privacyScenarioSchema.parse(req.params.scenario)
    return saveReportPrivacyPreferences({
      actor:req.user!,organizationId:id.parse(req.params.organizationId),
      product,scenario,request:savePreferenceSchema.parse(req.body)})
  }))
  return router
}
export const campusReportPrivacyRoutes=createReportPrivacyRoutes('HUISCHOOL')
export const teacherReportPrivacyRoutes=createReportPrivacyRoutes('HUITEACHER')
