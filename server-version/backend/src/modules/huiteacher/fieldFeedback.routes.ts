import {Router} from 'express'
import {z,ZodError} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {authenticateHuiteacher} from '../../middleware/auth'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from './authority'
import {success} from '../../utils/response'
import {
  HuiteacherFeedbackError,releaseHuiteacherFieldFeedback,
  readOwnHuiteacherFieldFeedback,
} from './fieldFeedback.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().uuid()
const release=z.object({
  sourceKind:z.enum(['FORMAL_FEEDBACK','CONSENSUS']),sourceId:id,
}).strict()
const rate=createRedisRateLimiter({
  name:'huiteacher-subject-feedback-release',limit:30,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_FEEDBACK_ARGUMENT_INVALID',message:'发布目标或来源参数无效',data:null,
    })
    if(e instanceof HuiteacherFeedbackError)return res.status(e.statusCode).json({
      code:e.code,message:'反馈内容未发布、不是本人或当前无权限读取',data:null,
    })
    throw e
  }
})
router.use(authenticateHuiteacher)
router.get('/my-field-feedback',wrap(req=>
  readOwnHuiteacherFieldFeedback(req.user!.userId)))
router.post('/organizations/:organizationId/evaluation-events/:eventId/field-feedback-release',
  requireTeacherProductAdmin,requireRecentTeacherMfa,rate,wrap(req=>
    releaseHuiteacherFieldFeedback({
      actorUserId:req.user!.userId,
      organizationId:id.parse(req.params.organizationId),
      eventId:id.parse(req.params.eventId),
      ...release.parse(req.body),
    })))
export default router
