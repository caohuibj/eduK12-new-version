import {readHuiteacherTargetTimeline,HuiteacherTimelineError} from './timeline.service'
import { Router, type RequestHandler } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import {
  createHuiteacherTarget,listHuiteacherTargets,archiveHuiteacherTarget,
  createHuiteacherEvent,listHuiteacherEvents,transitionHuiteacherEvent,HuiteacherEvaluationError,
  createHuiteacherEventRunDraft,readHuiteacherEventRun,
} from './evaluation.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().guid()
const targetCreate=z.object({
  kind:z.enum(['PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT']),
  name:z.string().trim().min(1).max(200),
  subjectUserId:id.optional(),
}).strict()
const eventCreate=z.object({
  targetId:id,kind:z.enum(['ASSESSMENT','CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT','OTHER']),
  title:z.string().trim().min(1).max(200),
  notes:z.string().max(12000).optional(),
  scheduledAt:z.string().datetime().optional(),
}).strict()
const handler=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'评价对象／活动参数不合法',data:null})
    if(e instanceof HuiteacherTimelineError)return res.status(e.statusCode).json({
      code:e.code,message:'没有权限查看此对象的纵向记录或游标已失效',data:null,
    })
    if(e instanceof HuiteacherEvaluationError)
      return res.status(e.statusCode).json({code:e.code,message:'评价对象或活动状态不可用',data:null})
    throw e
  }
})
router.get('/organizations/:organizationId/evaluation-targets',
  authenticateHuiteacher,requireTeacherProductAdmin,handler(async(req,res)=>{
    const organizationId=id.parse(req.params.organizationId)
    const query=z.object({cursor:id.optional()}).strict().parse(req.query)
    return success(res,await listHuiteacherTargets({
      actorUserId:req.user!.userId,organizationId,cursor:query.cursor,
    }))
  }))
router.post('/organizations/:organizationId/evaluation-targets',
  authenticateHuiteacher,requireTeacherProductAdmin,
  handler(async(req,res)=>success(res,await createHuiteacherTarget({
    actorUserId:req.user!.userId,organizationId:id.parse(req.params.organizationId),
    ...targetCreate.parse(req.body),
  }))))
router.get('/organizations/:organizationId/evaluation-targets/:targetId/timeline',
  authenticateHuiteacher,requireTeacherProductAdmin,handler(async(req,res)=>{
    const params=z.object({organizationId:id,targetId:id}).strict().parse(req.params)
    const query=z.object({cursor:id.optional()}).strict().parse(req.query)
    return success(res,await readHuiteacherTargetTimeline({
      ...params,...query,actorUserId:req.user!.userId,
    }))
  }))
router.post('/organizations/:organizationId/evaluation-targets/:targetId/archive',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  handler(async(req,res)=>success(res,await archiveHuiteacherTarget({
    actorUserId:req.user!.userId,organizationId:id.parse(req.params.organizationId),
    targetId:id.parse(req.params.targetId),
  }))))
router.get('/organizations/:organizationId/evaluation-events',
  authenticateHuiteacher,requireTeacherProductAdmin,handler(async(req,res)=>{
    const organizationId=id.parse(req.params.organizationId)
    const query=z.object({targetId:id.optional(),cursor:id.optional()}).strict().parse(req.query)
    return success(res,await listHuiteacherEvents({
      actorUserId:req.user!.userId,organizationId,...query,
    }))
  }))
router.post('/organizations/:organizationId/evaluation-events',
  authenticateHuiteacher,requireTeacherProductAdmin,
  handler(async(req,res)=>{
    const data=eventCreate.parse(req.body)
    return success(res,await createHuiteacherEvent({
      actorUserId:req.user!.userId,organizationId:id.parse(req.params.organizationId),
      ...data,scheduledAt:data.scheduledAt?new Date(data.scheduledAt):undefined,
    }))
  }))
// Ordinary OPEN/CLOSE are lifecycle operations. Cancellation remains a
// separately verified destructive action; the service still checks versions.
const requireEventCancellationStepUp:RequestHandler=(req,res,next)=>
  req.body?.action==='CANCEL'?requireRecentTeacherMfa(req,res,next):next()
router.post('/organizations/:organizationId/evaluation-events/:eventId/transition',
  authenticateHuiteacher,requireTeacherProductAdmin,requireEventCancellationStepUp,
  handler(async(req,res)=>{
    const body=z.object({
      action:z.enum(['OPEN','CLOSE','CANCEL']),expectedVersion:z.number().int().min(1),
    }).strict().parse(req.body)
    return success(res,await transitionHuiteacherEvent({
      actorUserId:req.user!.userId,organizationId:id.parse(req.params.organizationId),
      eventId:id.parse(req.params.eventId),...body,
    }))
  }))
router.post('/organizations/:organizationId/evaluation-events/:eventId/run',
  authenticateHuiteacher,requireTeacherProductAdmin,
  handler(async(req,res)=>{
    const data=z.object({
      name:z.string().trim().min(1).max(200),
      intakeDeadline:z.string().datetime().nullable().optional(),
    }).strict().parse(req.body)
    return success(res,await createHuiteacherEventRunDraft({
      organizationId:id.parse(req.params.organizationId),
      eventId:id.parse(req.params.eventId),actorUserId:req.user!.userId,
      name:data.name,intakeDeadline:data.intakeDeadline?new Date(data.intakeDeadline):null,
    }))
  }))
router.get('/organizations/:organizationId/evaluation-events/:eventId/run',
  authenticateHuiteacher,requireTeacherProductAdmin,handler(async(req,res)=>
    success(res,await readHuiteacherEventRun({
      organizationId:id.parse(req.params.organizationId),
      eventId:id.parse(req.params.eventId),actorUserId:req.user!.userId,
    }))))
export default router
