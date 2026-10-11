import { Router } from 'express'
import { z,ZodError } from 'zod'
import { authenticateHuiteacher } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import {
  TeacherPersonalAssessmentError,listPersonalTeacherScales,
  listOwnPersonalTeacherScales,startPersonalTeacherScale,
  readOwnPersonalTeacherScale,submitOwnPersonalTeacherScale,
  readOwnPersonalTeacherScaleReport,
} from './personalScale.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().uuid()
const admissionLimiter=createRedisRateLimiter({
  name:'huiteacher-personal-scale-admission',limit:12,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const finalLimiter=createRedisRateLimiter({
  name:'huiteacher-personal-scale-final',limit:40,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const finalPayload=z.object({
  submissionId:z.string().min(16).max(120),
  attemptEpoch:z.number().int().min(1),
  definitionHash:z.string().regex(/^[0-9a-f]{64}$/),
  answers:z.array(z.object({
    itemCode:z.string().min(1).max(80),
    responseValue:z.union([z.string(),z.number().finite()]),
    responseTimeMs:z.number().nonnegative().max(86400000).optional(),
    changeCount:z.number().int().nonnegative().max(100000).optional(),
  }).strict()).max(500),
}).strict()
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_PERSONAL_ARGUMENT_INVALID',
      message:'个人量表请求不符合格式要求',data:null,
    })
    if(e instanceof TeacherPersonalAssessmentError)
      return res.status(e.statusCode).json({code:e.code,
        message:'个人资源资格或正式测评状态不可用',data:null,
      })
    const err=e as {statusCode?:number;code?:string}
    if(err&&typeof err.statusCode==='number'
      &&err.statusCode>=400&&err.statusCode<500)
      return res.status(err.statusCode).json({
        code:err.code??'PERSONAL_ASSESSMENT_DENIED',
        message:'正式量表作答未通过资格／版本校验',data:null,
      })
    throw e
  }
})
// Independent of Organization membership: a per-person explicit grant and
// Teacher browser session are both required for each action.
router.use(authenticateHuiteacher)
router.get('/personal-scale/catalog',wrap(req=>
  listPersonalTeacherScales(req.user!.userId)))
router.get('/personal-scale/assessments',wrap(req=>
  listOwnPersonalTeacherScales(req.user!.userId)))
router.post('/personal-scale/assessments',admissionLimiter,wrap(req=>
  startPersonalTeacherScale({
    userId:req.user!.userId,
    resourceId:z.object({resourceId:id}).strict().parse(req.body).resourceId,
  })))
router.get('/personal-scale/assessments/:assessmentId',wrap(req=>
  readOwnPersonalTeacherScale({
    userId:req.user!.userId,assessmentId:id.parse(req.params.assessmentId),
  })))
router.post('/personal-scale/assessments/:assessmentId/final',finalLimiter,wrap(req=>
  submitOwnPersonalTeacherScale({
    userId:req.user!.userId,assessmentId:id.parse(req.params.assessmentId),
    ...finalPayload.parse(req.body),
  })))
router.get('/personal-scale/assessments/:assessmentId/report',wrap(req=>
  readOwnPersonalTeacherScaleReport({
    userId:req.user!.userId,assessmentId:id.parse(req.params.assessmentId),
  })))
export default router
