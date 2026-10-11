import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import {
  HuiteacherRunError,addTeacherRunTrack,previewTeacherRun,publishTeacherRun,
  progressTeacherRun,closeTeacherRun,cancelTeacherRun,
} from './run.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
const keys=z.object({organizationId:uuid,eventId:uuid}).strict()
const resource=z.object({
  family:z.enum(['BUNDLE','SCALE','FORM','SITUATIONAL']),
  key:z.string().trim().min(1).max(200),
  version:z.string().trim().min(1).max(120),
}).strict()
const track=z.object({
  resource,
  subjectSelector:z.record(z.unknown()).default({}),
  respondentSelector:z.record(z.unknown()).default({}),
  requestedPolicy:z.object({
    targetPolicy:z.object({
      mode:z.enum(['SELF','HOMEROOM_TEACHER','ALL_CLASS_TEACHERS',
        'SELECTED_CLASS_TEACHERS','COURSE_TEACHER']),
      teacherMembershipIds:z.array(z.string()).optional(),
      courseId:z.string().optional(),
    }).strict().optional(),
    subjectRoles:z.array(z.string().min(1)).min(1),
    respondentRoles:z.array(z.string().min(1)).min(1),
    relationshipKinds:z.array(z.string().min(1)).min(1),
    perspectives:z.array(z.string().min(1)).min(1),
    analysisMode:z.string().min(1),
    visibilityPolicyKey:z.string().min(1),
    minimumRespondents:z.number().int().min(1).nullable(),
  }).strict(),
}).strict()
const version=z.object({expectedVersion:z.number().int().min(1)}).strict()
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_RUN_INPUT_INVALID',message:'任务配置参数不合法',data:null,
    })
    if(e instanceof HuiteacherRunError)return res.status(e.statusCode).json({
      code:e.code,message:'任务或其评价活动状态不可用',data:null,
    })
    const known=e as {code?:string;message?:string;statusCode?:number}
    if(known&&typeof known.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
      return res.status(known.statusCode).json({code:known.code??'RUN_INVALID',
        message:'测评资源、版本或任务授权不满足发布条件',data:null})
    throw e
  }
})
const base='/organizations/:organizationId/evaluation-events/:eventId/run'
router.post(base+'/tracks',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await addTeacherRunTrack({
    ...keys.parse(req.params),actorUserId:req.user!.userId,...track.parse(req.body),
  }))))
router.post(base+'/preview',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await previewTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,...version.parse(req.body),
  }))))
router.post(base+'/publish',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await publishTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,...version.parse(req.body),
  }))))
router.get(base+'/progress',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await progressTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
router.post(base+'/close',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await closeTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
router.post(base+'/cancel',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await cancelTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
export default router
