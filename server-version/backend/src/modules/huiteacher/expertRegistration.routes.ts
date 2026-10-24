import {Router} from 'express'
import {z,ZodError} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {authenticateHuiteacher} from '../../middleware/auth'
import {registrationRateLimit,withRegistrationAdmission} from '../../middleware/registrationAdmission'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from './authority'
import {success} from '../../utils/response'
import {isValidPassword,PASSWORD_MAX_LENGTH} from '../../utils/password'
import {
  issueHuiteacherExternalExpertInvite,registerHuiteacherExternalExpert,
  joinHuiteacherExternalExpert,HuiteacherExpertError,
} from './expertRegistration.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const token=z.string().regex(/^[a-zA-Z0-9_-]{43}$/)
const newAccount=z.object({
  inviteCode:token,
  username:z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const redeem=z.object({inviteCode:token}).strict()
const limiter=createRedisRateLimiter({
  name:'huiteacher-expert-registration',limit:25,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_EXPERT_ARGUMENT_INVALID',
      message:'专家邀请或注册参数无效',data:null,
    })
    if(e instanceof HuiteacherExpertError)return res.status(e.statusCode).json({
      code:e.code,message:'专家邀请无效、已使用或不符合本次活动权限',data:null,
    })
    throw e
  }
})
router.post('/education/register-expert',registrationRateLimit,limiter,
  withRegistrationAdmission(wrap(req=>registerHuiteacherExternalExpert(
    newAccount.parse(req.body)))))
router.post('/education/join-expert',authenticateHuiteacher,limiter,
  wrap(req=>joinHuiteacherExternalExpert({
    userId:req.user!.userId,...redeem.parse(req.body),
  })))
router.post('/organizations/:organizationId/evaluation-events/:eventId/expert-registration-invites',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  limiter,wrap(req=>issueHuiteacherExternalExpertInvite({
    actorUserId:req.user!.userId,organizationId:uuid.parse(req.params.organizationId),
    eventId:uuid.parse(req.params.eventId),
  })))
export default router
