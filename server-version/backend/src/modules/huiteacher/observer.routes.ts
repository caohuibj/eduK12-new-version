import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import {
  HuiteacherObserverError,inviteHuiteacherObserver,
  acceptHuiteacherObserver,revokeHuiteacherObserver,listHuiteacherObserverGrants,
  myHuiteacherFieldAssignments,createHuiteacherObservation,
  updateHuiteacherObservation,submitHuiteacherObservation,
  readOwnHuiteacherObservations,readFormalHuiteacherObservations,
} from './observer.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const eventParams=z.object({organizationId:uuid,eventId:uuid})
const invitation=z.object({
  observerUserId:uuid,role:z.enum(['EXPERT','PEER']),
  expiresAt:z.string().datetime(),
}).strict()
const note=z.object({
  kind:z.enum(['FACT','FORMAL_FEEDBACK','PRIVATE_REFLECTION']),
  content:z.string().trim().min(1).max(12000),
}).strict()
const change=z.object({expectedRevision:z.number().int().min(1),
  content:z.string().trim().min(1).max(12000)}).strict()
const submit=z.object({
  expectedRevision:z.number().int().min(1),
  fieldFormId:uuid.optional(),
  answers:z.record(z.string(), z.unknown()).optional(),
}).strict()
const limiter=createRedisRateLimiter({
  name:'huiteacher-observation-writes',limit:90,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(task:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await task(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_OBSERVER_ARGUMENT_INVALID',message:'现场评价参数无效',data:null,
    })
    if(e instanceof HuiteacherObserverError)return res.status(e.statusCode).json({
      code:e.code,message:'观察任务授权、状态或记录版本不符合要求',data:null,
    })
    throw e
  }
})
router.get('/my-field-invitations',authenticateHuiteacher,wrap(req=>
  myHuiteacherFieldAssignments(req.user!.userId)))
router.post('/field-invitations/:invitationId/accept',authenticateHuiteacher,limiter,wrap(req=>
  acceptHuiteacherObserver({
    userId:req.user!.userId,
    invitationId:uuid.parse(req.params.invitationId),
  })))
router.get('/my-field-notes',authenticateHuiteacher,wrap(req=>
  readOwnHuiteacherObservations(req.user!.userId)))
router.post('/field-notes/:noteId/submit',authenticateHuiteacher,limiter,wrap(req=>
  submitHuiteacherObservation({
    id:uuid.parse(req.params.noteId),
    actorUserId:req.user!.userId,...submit.parse(req.body),
  })))
router.put('/field-notes/:noteId',authenticateHuiteacher,limiter,wrap(req=>
  updateHuiteacherObservation({
    id:uuid.parse(req.params.noteId),
    actorUserId:req.user!.userId,...change.parse(req.body),
  })))
router.get('/organizations/:organizationId/evaluation-events/:eventId/observer-grants',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,wrap(req=>
    listHuiteacherObserverGrants({
      ...eventParams.parse(req.params),actorUserId:req.user!.userId,
    })))
router.post('/organizations/:organizationId/evaluation-events/:eventId/observer-grants',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,limiter,wrap(req=>{
    const params=eventParams.parse(req.params),v=invitation.parse(req.body)
    return inviteHuiteacherObserver({
      ...params,actorUserId:req.user!.userId,
      observerUserId:v.observerUserId,role:v.role,expiresAt:new Date(v.expiresAt),
    })
  }))
router.post('/organizations/:organizationId/evaluation-events/:eventId/observer-grants/:observerUserId/revoke',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,limiter,wrap(req=>{
    const params=eventParams.parse(req.params)
    return revokeHuiteacherObserver({
      ...params,actorUserId:req.user!.userId,
      observerUserId:uuid.parse(req.params.observerUserId),
    })
  }))
router.post('/organizations/:organizationId/evaluation-events/:eventId/field-notes',authenticateHuiteacher,
  limiter,wrap(req=>{
    const params=eventParams.parse(req.params)
    return createHuiteacherObservation({
      ...params,actorUserId:req.user!.userId,...note.parse(req.body),
    })
  }))
router.get('/organizations/:organizationId/evaluation-events/:eventId/formal-notes',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,wrap(req=>
    readFormalHuiteacherObservations({
      ...eventParams.parse(req.params),actorUserId:req.user!.userId,
    })))
export default router
