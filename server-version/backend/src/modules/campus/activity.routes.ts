import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success, notFound, forbidden } from '../../utils/response'
import { prisma } from '../../config/database'
import { hasActiveCourseMembership } from '../../utils/courseAccess'
import { assignmentController } from '../../controllers/assignmentController'
import { checkinController } from '../../controllers/checkinController'
import { allocateCampusActivityParticipants, revokeCampusActivityParticipant } from './activity.allocation'
import { addCampusActivityTask, listCampusStudentTasks } from './activity.tasks'
import {
  CampusActivityError, createCampusActivity, listCampusActivities,readCampusActivity,
  updateCampusActivity, addCampusActivityCollaborator, changeCampusActivityStatus,
} from './activity.service'

const router=Router()
const uuid=z.string().uuid()
const params=z.object({organizationId:uuid})
const activityParams=params.extend({courseId:uuid})
const purpose=z.enum(['STUDENT_WELLBEING','LEARNING_ADAPTATION','SCHOOL_CLIMATE','FAMILY_SUPPORT'])
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const wrap=(f:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await f(req,res)}
  catch(error){
    if(error instanceof CampusActivityError)return res.status(error.statusCode).json({
      code:error.code,message:'当前校园活动状态或权限不允许该操作',data:null,
    })
    if(error instanceof ZodError)return res.status(400).json({
      code:'ACTIVITY_REQUEST_INVALID',message:'校园活动参数无效',data:null,
    })
    throw error
  }
})
router.get('/organizations/:organizationId/activities',authenticateSchool,wrap(async(req,res)=>{
  const p=params.parse(req.params)
  const query=z.object({
    page:z.coerce.number().int().min(1).default(1),
    pageSize:z.coerce.number().int().min(1).max(100).default(20),
  }).parse(req.query)
  return success(res,await listCampusActivities({actor:req.user!,...p,...query}))
}))
router.post('/organizations/:organizationId/activities',authenticateSchool,wrap(async(req,res)=>{
  const p=params.parse(req.params)
  const body=z.object({
    title:z.string().trim().min(1).max(200),
    description:z.string().trim().max(4000).nullable().optional(),
    purpose:purpose.default('STUDENT_WELLBEING'),
  }).strict().parse(req.body)
  return success(res,await createCampusActivity({actor:req.user!,...p,...body}))
}))
router.get('/organizations/:organizationId/activities/:courseId',authenticateSchool,wrap(async(req,res)=>{
  return success(res,await readCampusActivity({actor:req.user!,...activityParams.parse(req.params)}))
}))
router.patch('/organizations/:organizationId/activities/:courseId',authenticateSchool,wrap(async(req,res)=>{
  const body=z.object({
    title:z.string().trim().min(1).max(200),
    description:z.string().trim().max(4000).nullable().optional(),
    expectedVersion:z.number().int().positive(),
  }).strict().parse(req.body)
  return success(res,await updateCampusActivity({actor:req.user!,...activityParams.parse(req.params),...body}))
}))
router.post('/organizations/:organizationId/activities/:courseId/collaborators',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const body=z.object({membershipId:uuid}).strict().parse(req.body)
    return success(res,await addCampusActivityCollaborator({
      actor:req.user!,...activityParams.parse(req.params),...body,
    }))
  }))
router.post('/organizations/:organizationId/activities/:courseId/submit',
  authenticateSchool,wrap(async(req,res)=>{
    const body=z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body)
    return success(res,await changeCampusActivityStatus({
      actor:req.user!,...activityParams.parse(req.params),...body,action:'SUBMIT',
    }))
  }))
const governorAction=z.enum(['OPEN','PAUSE','RESUME','CLOSE'])
router.post('/organizations/:organizationId/activities/:courseId/govern',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const body=z.object({action:governorAction,expectedVersion:z.number().int().positive()})
      .strict().parse(req.body)
    return success(res,await changeCampusActivityStatus({
      actor:req.user!,...activityParams.parse(req.params),...body,
    }))
  }))

router.post('/organizations/:organizationId/activities/:courseId/participants',
  authenticateSchool,wrap(async(req,res)=>{
    const p=activityParams.parse(req.params)
    const body=z.object({
      classUnitIds:z.array(uuid).min(1).max(40),
      membershipIds:z.array(uuid).max(500).optional(),
      requestKey:z.string().min(8).max(100),
      expectedVersion:z.number().int().positive(),
    }).strict().parse(req.body)
    return success(res,await allocateCampusActivityParticipants({actor:req.user!,...p,...body}))
  }))
router.post('/organizations/:organizationId/activities/:courseId/participants/revoke',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const p=activityParams.parse(req.params)
    const body=z.object({membershipId:uuid}).strict().parse(req.body)
    return success(res,await revokeCampusActivityParticipant({actor:req.user!,...p,...body}))
  }))
router.post('/organizations/:organizationId/activities/:courseId/tasks',
  authenticateSchool,wrap(async(req,res)=>{
    const p=activityParams.parse(req.params)
    const body=z.object({
      kind:z.enum(['ASSIGNMENT','READING','CHECKIN']),
      title:z.string().trim().min(1).max(200),
      description:z.string().max(4000).nullable().optional(),
      content:z.string().max(25000).nullable().optional(),
      deadline:z.string().datetime().nullable().optional(),
    }).strict().parse(req.body)
    return success(res,await addCampusActivityTask({
      actor:req.user!,...p,...body,
      deadline:body.deadline?new Date(body.deadline):null,
    }))
  }))

router.get('/my/activity-tasks',authenticateSchool,wrap(async(req,res)=>{
  const query=z.object({
    page:z.coerce.number().int().min(1).default(1),
    pageSize:z.coerce.number().int().min(1).max(100).default(25),
    activityId:uuid.optional(),
  }).parse(req.query)
  return success(res,await listCampusStudentTasks(req.user!,query))
}))

// Existing Submission/CheckinSubmission runtimes remain authoritative;
// reauthenticate product, enrollment and exact Activity<->Task parent before
// delegating to their existing controller. SQL triggers recheck at commit.
async function requireStudentActivityTask(
  req:import('express').Request,res:import('express').Response,
  next:import('express').NextFunction,kind:'assignment'|'checkin',
){
  try {
    if(req.user?.accountDomain!=='SCHOOL'||req.user.role!=='STUDENT')
      return forbidden(res,'需要校园学生身份')
    const p=z.object({courseId:uuid,id:uuid}).safeParse(req.params)
    if(!p.success)return notFound(res,'当前任务不存在')
    const record=kind==='assignment'
      ? await prisma.assignment.findUnique({where:{id:p.data.id},select:{courseId:true}})
      : await prisma.checkin.findUnique({where:{id:p.data.id},select:{courseId:true}})
    if(record?.courseId!==p.data.courseId)return notFound(res,'当前任务不存在')
    if(!await hasActiveCourseMembership(p.data.courseId,req.user.userId))
      return notFound(res,'当前任务不可访问')
    next()
  }catch(error){next(error)}
}
const studentAssignment=(req:import('express').Request,res:import('express').Response,
  next:import('express').NextFunction)=>requireStudentActivityTask(req,res,next,'assignment')
const studentCheckin=(req:import('express').Request,res:import('express').Response,
  next:import('express').NextFunction)=>requireStudentActivityTask(req,res,next,'checkin')
router.get('/activities/:courseId/assignments/:id',
  authenticateSchool,studentAssignment,assignmentController.detail)
router.post('/activities/:courseId/assignments/:id/submit',
  authenticateSchool,studentAssignment,assignmentController.submit)
router.get('/activities/:courseId/checkins/:id',
  authenticateSchool,studentCheckin,checkinController.detail)
router.post('/activities/:courseId/checkins/:id/submit',
  authenticateSchool,studentCheckin,checkinController.submit)

export default router
