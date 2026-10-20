import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate,authenticateSurvey} from '../../middleware/auth'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success,error} from '../../utils/response'
import {SurveyBuilderError} from '../survey/builder.service'
import {SurveyAnalyticsError} from '../survey/analytics.errors'
import {assertRecentSurveyMfa} from '../survey/analytics.export.service'
import {platformSurveyOriginGuard} from '../survey/originGuard'
import {ContentAuthorityError} from './content-authority'
import {ContentReleaseError} from './release'
import {
  submitFormalReferenceCandidate,readFormalReferenceCandidate,reviewFormalReferenceCandidate,publishFormalReferenceCandidate,readFormalReferenceAuthorities,
} from './formal-reference.service'

const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await work(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400)
    if(e instanceof ContentAuthorityError)return error(res,'没有对应的正式参考科学能力',-1,403)
    if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
    if(e instanceof SurveyBuilderError||e instanceof SurveyAnalyticsError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
const noStore=(_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','no-store');next()}
const limiter=createRedisRateLimiter({name:'formal-reference-governance',limit:30,windowSeconds:300,key:req=>req.user?.userId??req.ip??'unknown'})

/** Training account authentication is the single platform governance entry.
 * Strong-auth root grants are a separate management workflow, not a route role.
 * Global API CSRF protection still applies. */
export const formalReferenceRouter=Router()
formalReferenceRouter.use(authenticate,platformSurveyOriginGuard,limiter,noStore)
formalReferenceRouter.get('/capabilities',handle(req=>readFormalReferenceAuthorities(req.user!.userId)))
formalReferenceRouter.post('/submissions',handle(req=>submitFormalReferenceCandidate(req.user!.userId,'TRAINING',req.body)))
formalReferenceRouter.post('/read',handle(req=>readFormalReferenceCandidate(req.user!.userId,req.body)))
formalReferenceRouter.post('/reviews',handle(req=>reviewFormalReferenceCandidate(req.user!.userId,req.body)))
formalReferenceRouter.post('/publish',handle(req=>publishFormalReferenceCandidate(req.user!.userId,req.body)))

/** Survey users can explicitly contribute their own aggregate proposal. This
 * does not expose platform review/publish or another project's candidate. */
export const surveyFormalReferenceRouter=Router()
surveyFormalReferenceRouter.use(authenticateSurvey,limiter,noStore)
surveyFormalReferenceRouter.post('/submissions',handle(req=>{
  if(process.env.SURVEY_ANALYTICS_ENABLED!=='true')throw new SurveyAnalyticsError(404,'研究分析仍未完成正式验收')
  assertRecentSurveyMfa(req)
  return submitFormalReferenceCandidate(req.user!.userId,'SURVEY',req.body)
}))
