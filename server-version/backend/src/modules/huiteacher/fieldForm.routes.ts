import {Router} from 'express'
import {z,ZodError} from 'zod'
import {authenticateHuiteacher} from '../../middleware/auth'
import {asyncHandler} from '../../middleware/asyncHandler'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success} from '../../utils/response'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from './authority'
import {bindHuiteacherFieldForm,readInvitedHuiteacherFieldForm,readManagerHuiteacherFieldForm,
  readSubmittedHuiteacherFieldFormEvidence,
  HuiteacherFieldFormError} from './fieldForm.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const limit=createRedisRateLimiter({name:'huiteacher-field-form-binding',
  limit:35,windowSeconds:900,key:req=>req.user?.userId||req.ip||'unknown'})
const wrap=(task:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await task(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_FIELD_FORM_ARGUMENT',message:'现场表单参数无效',data:null,
    })
    if(e instanceof HuiteacherFieldFormError)return res.status(e.statusCode).json({
      code:e.code,message:'现场表单来源、任务资格或发布状态不满足要求',data:null,
    })
    throw e
  }
})
router.get('/organizations/:organizationId/evaluation-events/:eventId/field-form',authenticateHuiteacher,
  requireTeacherProductAdmin,wrap(req=>readManagerHuiteacherFieldForm({
    actorUserId:req.user!.userId,
    organizationId:uuid.parse(req.params.organizationId),
    eventId:uuid.parse(req.params.eventId),
  })))
router.post('/organizations/:organizationId/evaluation-events/:eventId/field-form',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,limit,wrap(req=>
    bindHuiteacherFieldForm({
      actorUserId:req.user!.userId,
      organizationId:uuid.parse(req.params.organizationId),
      eventId:uuid.parse(req.params.eventId),
      formId:z.object({formId:uuid}).strict().parse(req.body).formId,
    })))
router.get('/field-invitations/:invitationId/form',authenticateHuiteacher,wrap(req=>
  readInvitedHuiteacherFieldForm({
    invitationId:uuid.parse(req.params.invitationId),
    actorUserId:req.user!.userId,
  })))
router.get('/organizations/:organizationId/evaluation-events/:eventId/field-notes/:recordId/form-evidence',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,wrap(req=>
    readSubmittedHuiteacherFieldFormEvidence({
      actorUserId:req.user!.userId,
      organizationId:uuid.parse(req.params.organizationId),
      eventId:uuid.parse(req.params.eventId),
      recordId:uuid.parse(req.params.recordId),
    })))
export default router
