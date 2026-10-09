import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
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
export default router
