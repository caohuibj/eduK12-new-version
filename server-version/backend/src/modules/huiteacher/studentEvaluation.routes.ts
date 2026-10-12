import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireRecentTeacherMfa,requireTeacherProductAdmin } from './authority'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import {
  configureHuiteacherStudentEvaluation,readHuiteacherStudentEvaluation,
  previewHuiteacherStudentEvaluation,listHuiteacherStudentEvaluationCandidates,
  HuiteacherStudentEvaluationError,
} from './studentEvaluation.service'

const router=Router()
const uuid=z.string().uuid()
const params=z.object({organizationId:uuid,eventId:uuid}).strict()
const create=z.object({
  classUnitId:uuid,staffAssignmentId:uuid,formId:uuid,
}).strict()
const limiter=createRedisRateLimiter({
  name:'huiteacher-student-evaluation-configuration',
  limit:30,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_STUDENT_EVAL_ARGUMENT',
      message:'评教目标、班级或 Form 参数无效',data:null,
    })
    if(e instanceof HuiteacherStudentEvaluationError)
      return res.status(e.statusCode).json({
        code:e.code,
        message:'学校评教配置未获授权，或教师任教关系与班级不匹配',
        data:null,
      })
    throw e
  }
})
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
// PR5 remains opt-in until canonical class→teacher Run/FINAL and protected
// disclosure contracts are reviewed. Code deployment alone opens no tasks.
router.use((_req,res,next)=>{
  if(process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')
    return res.status(404).json({
      code:'HUITEACHER_STUDENT_FEEDBACK_DISABLED',message:'学生评教暂未开放',data:null,
    })
  next()
})
router.use(authenticateHuiteacher)
const path='/organizations/:organizationId/evaluation-events/:eventId/student-evaluation'
router.get(path+'/candidates',requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(req=>listHuiteacherStudentEvaluationCandidates({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.get(path,requireTeacherProductAdmin,wrap(req=>
  readHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.get(path+'/eligibility',requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(req=>previewHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.post(path,requireTeacherProductAdmin,requireRecentTeacherMfa,limiter,
  wrap(req=>configureHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
    ...create.parse(req.body),
  })))
export default router
