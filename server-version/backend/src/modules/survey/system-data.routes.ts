import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../../middleware/auth'
import {success,error} from '../../utils/response'
import {requireRecentAdminKey,requireSystemAdmin} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {SurveyAnalyticsError} from './analytics.errors'
import * as service from './system-data.service'
export const surveySystemDataRouter=Router()
surveySystemDataRouter.use(createRedisRateLimiter({name:'survey-system-data',limit:60,windowSeconds:300,key:req=>req.ip??'unknown'}))
surveySystemDataRouter.use(authenticate,requireSystemAdmin,requireRecentAdminKey,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{try{return success(res,await fn(req))}catch(e){if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400);if(e instanceof AdminPermissionError||e instanceof SurveyAnalyticsError)return error(res,e.message,-1,e.statusCode);next(e)}}
const reason=z.string().trim().min(1).max(1000),uuid=z.string().uuid(),projectId=uuid
const scope=z.object({projectId,reason}),paged=scope.extend({afterId:uuid.optional()}).strict()
surveySystemDataRouter.post('/projects',handle(req=>{const input=z.object({reason,page:z.number().int().min(1).max(10000).default(1)}).strict().parse(req.body);return service.listSystemSurveyProjects(req.user!.userId,req.user!,input.reason,input.page)}))
surveySystemDataRouter.post('/answers',handle(req=>service.viewSystemSurveyAnswers(req.user!.userId,req.user!,paged.parse(req.body))))
surveySystemDataRouter.post('/report',handle(req=>service.viewSystemSurveyReport(req.user!.userId,req.user!,scope.extend({waveId:uuid,finalId:uuid,instrumentKey:z.string().min(1).max(240)}).strict().parse(req.body))))
surveySystemDataRouter.post('/export-grants',handle(req=>service.issueSurveyExportGrant(req.user!.userId,req.user!,scope.extend({userId:uuid,hours:z.number().int().min(1).max(24)}).strict().parse(req.body))))
surveySystemDataRouter.post('/export-grants/list',handle(req=>{const input=z.object({projectId}).strict().parse(req.body);return service.listSurveyExportGrants(req.user!.userId,req.user!,input.projectId)}))
surveySystemDataRouter.post('/export-grants/revoke',handle(req=>service.revokeSurveyExportGrant(req.user!.userId,req.user!,z.object({grantId:uuid,reason}).strict().parse(req.body))))
surveySystemDataRouter.post('/export',handle(req=>service.exportDeidentifiedSurvey(req.user!.userId,req.user!,paged.extend({grantId:uuid}).strict().parse(req.body))))

surveySystemDataRouter.post('/package-reports',handle(req=>service.viewSystemPackageReports(req.user!.userId,req.user!,scope.extend({waveId:uuid,finalId:uuid}).strict().parse(req.body))))
