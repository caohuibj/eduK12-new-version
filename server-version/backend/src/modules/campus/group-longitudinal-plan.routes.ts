import {taskArtifactBefore} from '../reporting/task-artifact'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z,ZodError} from 'zod'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success} from '../../utils/response'
import {ReportingError} from '../reporting/types'
import {groupLongitudinalRequestSchema,GroupLongitudinalError} from '../reporting/group-longitudinal'
import {educationGroupSelectionSchema} from '../reporting/education-group-selection'
import {requireRecentSchoolMfa} from './mfa.middleware'
import {schoolPlanGroupCatalog,generateSchoolPlanGroup,readSchoolPlanGroup} from './group-longitudinal-plan.service'

/** Mount at /reports/groups/plans AFTER report.routes' authenticateSchool and
 * no-store middleware. This child does not change the legacy/DOT-owned router. */
export const schoolPlanGroupRouter=Router()
const id=z.string().guid(),scope=z.object({organizationId:id,runId:id}).strict()
const command=groupLongitudinalRequestSchema.extend({specId:id,selection:educationGroupSelectionSchema.optional()})
const budget=createRedisRateLimiter({name:'campus-report-write',limit:30,windowSeconds:900,key:req=>req.user?.userId??'anonymous'})
const handle=(fn:(req:Request)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{
 if(!req.user||req.user.accountDomain!=='SCHOOL')return res.status(401).json({code:'UNAUTHORIZED',message:'请先登录校园账号',data:null})
 void Promise.resolve().then(()=>fn(req)).then(data=>success(res,data)).catch(error=>{
  if(error instanceof ZodError)return res.status(400).json({code:'CAMPUS_REPORT_INPUT_INVALID',message:'报告操作参数不正确',data:null})
  if(error instanceof ReportingError||error instanceof GroupLongitudinalError)return res.status(error.statusCode).json({code:'CAMPUS_PLAN_GROUP_UNAVAILABLE',message:'当前校园纵向群报不可访问，或原披露范围已变化',data:null})
  return next(error)
 })
}
schoolPlanGroupRouter.get('/:organizationId/:runId',handle(req=>schoolPlanGroupCatalog({actor:req.user!,...scope.parse(req.params),before:taskArtifactBefore(req.query)})))
schoolPlanGroupRouter.post('/:organizationId/:runId',requireRecentSchoolMfa,budget,handle(req=>generateSchoolPlanGroup({actor:req.user!,...scope.parse(req.params),...command.parse(req.body)})))
schoolPlanGroupRouter.get('/:organizationId/:runId/:artifactId',handle(req=>readSchoolPlanGroup({actor:req.user!,...scope.extend({artifactId:id}).parse(req.params)})))
