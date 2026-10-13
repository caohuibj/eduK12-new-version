import {listMyHuiteacherStudentFeedback,readHuiteacherStudentFeedbackReport,
  StudentFeedbackReportError} from './studentReport.service'
import {HuiteacherGroupReportError} from './groupReport.service'
import { Router,type RequestHandler } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireRecentTeacherMfa,requireTeacherProductAdmin } from './authority'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import {
  configureHuiteacherStudentEvaluation,readHuiteacherStudentEvaluation,
  previewHuiteacherStudentEvaluation,listHuiteacherStudentEvaluationCandidates,
  createHuiteacherStudentEvaluationRun,previewHuiteacherStudentEvaluationRun,
  publishHuiteacherStudentEvaluationRun,
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
const reportLimiter=createRedisRateLimiter({
  name:'huiteacher-student-feedback-group-release',
  limit:8,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_STUDENT_EVAL_ARGUMENT',
      message:'评教目标、班级或 Form 参数无效',data:null,
    })
    if(e instanceof StudentFeedbackReportError)return res.status(e.statusCode).json({
      code:e.code,message:'学生评教结果未达到当前的披露人数、受众或跨轮隐私条件',
      data:null,
    })
    if(e instanceof HuiteacherGroupReportError)return res.status(e.statusCode).json({
      code:e.code,message:'评价结果未通过群体统计来源或隐私一致性核验',data:null,
    })
    if(e instanceof HuiteacherStudentEvaluationError)
      return res.status(e.statusCode).json({
        code:e.code,
        message:'学校评教配置未获授权，或教师任教关系与班级不匹配',
        data:null,
      })
    const known=e as {statusCode?:number;code?:string}
    if(typeof known?.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
      return res.status(known.statusCode).json({
        code:known.code??'HUITEACHER_STUDENT_EVAL_DENIED',
        message:'请求未获授权或任务状态已改变',data:null,
      })
    throw e
  }
})
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
// PR5 remains opt-in until canonical class→teacher Run/FINAL and protected
// disclosure contracts are reviewed. Code deployment alone opens no tasks.
const studentFeedbackGuard:RequestHandler=(_req,res,next)=>{
  if(process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')
    return res.status(404).json({
      code:'HUITEACHER_STUDENT_FEEDBACK_DISABLED',message:'学生评教暂未开放',data:null,
    })
  next()
}
router.get('/my-student-feedback',studentFeedbackGuard,authenticateHuiteacher,wrap(req=>
  listMyHuiteacherStudentFeedback(req.user!.userId)))
const path='/organizations/:organizationId/evaluation-events/:eventId/student-evaluation'
router.get(path+'/candidates',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(req=>listHuiteacherStudentEvaluationCandidates({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.get(path,studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,wrap(req=>
  readHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.get(path+'/eligibility',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(req=>previewHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))

const runVersion=z.object({expectedVersion:z.number().int().positive()}).strict()
const runDraft=z.object({intakeDeadline:z.string().datetime().nullable().optional()}).strict()
router.post(path+'/run',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,limiter,
  wrap(req=>{
    const body=runDraft.parse(req.body)
    return createHuiteacherStudentEvaluationRun({
      ...params.parse(req.params),actorUserId:req.user!.userId,
      intakeDeadline:body.intakeDeadline?new Date(body.intakeDeadline):null,
    })
  }))
router.post(path+'/run/preview',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,limiter,
  wrap(req=>previewHuiteacherStudentEvaluationRun({
    ...params.parse(req.params),actorUserId:req.user!.userId,
    ...runVersion.parse(req.body),
  })))
router.post(path+'/run/publish',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,limiter,
  wrap(req=>publishHuiteacherStudentEvaluationRun({
    ...params.parse(req.params),actorUserId:req.user!.userId,
    ...runVersion.parse(req.body),
  })))

router.post(path+'/report/release',studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  reportLimiter,wrap(req=>readHuiteacherStudentFeedbackReport({
    ...params.parse(req.params),actorUserId:req.user!.userId,publishV2:true,
  })))
router.get(path+'/report',studentFeedbackGuard,authenticateHuiteacher,reportLimiter,wrap(req=>
  readHuiteacherStudentFeedbackReport({
    ...params.parse(req.params),actorUserId:req.user!.userId,
  })))
router.post(path,studentFeedbackGuard,authenticateHuiteacher,requireTeacherProductAdmin,limiter,
  wrap(req=>configureHuiteacherStudentEvaluation({
    ...params.parse(req.params),actorUserId:req.user!.userId,
    ...create.parse(req.body),
  })))
export default router
