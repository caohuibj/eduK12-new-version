import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { withRegistrationAdmission,registrationRateLimit } from '../../middleware/registrationAdmission'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { isValidPassword,PASSWORD_MAX_LENGTH } from '../../utils/password'
import { CampusAdmissionError } from './admission.service'
import {
  campusParentConsent,createCampusParentInvitation,registerCampusParent,
  readCampusParentLinks,approveCampusParentLink,revokeCampusParentLink,
  claimAdditionalCampusChild,
} from './parent.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().uuid()
const invite=z.string().regex(/^[a-zA-Z0-9_-]{24}$/)
const rate=createRedisRateLimiter({name:'campus-parent-links',limit:20,windowSeconds:900,
  key:req=>req.user?.userId??'anonymous'})
const handle=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(error){
    if(error instanceof CampusAdmissionError)return res.status(error.statusCode).json({
      code:error.code,message:'校园亲子关联暂不可用，请核实邀请码或联系学校',data:null,
    })
    if(error instanceof ZodError)return res.status(400).json({
      code:'CAMPUS_PARENT_INPUT_INVALID',message:'校园亲子关联信息格式不正确',data:null,
    })
    throw error
  }
})
router.get('/parent-links/consent',authenticateSchool,handle(async(_req,res)=>
  success(res,campusParentConsent())
))
router.post('/parent-links/invitations',authenticateSchool,rate,handle(async(req,res)=>{
  const {organizationId}=z.object({organizationId:id}).strict().parse(req.body)
  return success(res,await createCampusParentInvitation(req.user!,organizationId))
}))
// Parent registration is the ONLY campus endpoint which may create a parent.
// No role is inferred from a public username or from a training account.
router.post('/parents/register',registrationRateLimit,withRegistrationAdmission(
  handle(async(req,res)=>{
    const body=z.object({
      inviteCode:invite,username:z.string().min(4).max(32),
      password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
      guardianAcknowledged:z.literal(true),
    }).strict().parse(req.body)
    return success(res,await registerCampusParent(body),
      '家长独立校园账号已建立，请等待学生确认亲子关系')
  })
))
router.get('/parent-links',authenticateSchool,handle(async(req,res)=>
  success(res,await readCampusParentLinks(req.user!))
))
router.post('/parent-links/claims',authenticateSchool,rate,handle(async(req,res)=>{
  const {inviteCode}=z.object({inviteCode:invite}).strict().parse(req.body)
  return success(res,await claimAdditionalCampusChild(req.user!,inviteCode))
}))
router.post('/parent-links/:relationshipId/approve',authenticateSchool,rate,handle(async(req,res)=>{
  const {relationshipId}=z.object({relationshipId:id}).parse(req.params)
  const {consentVersion}=z.object({consentVersion:z.string().max(128)}).strict().parse(req.body)
  return success(res,await approveCampusParentLink(req.user!,relationshipId,consentVersion))
}))
router.post('/parent-links/:relationshipId/revoke',authenticateSchool,rate,handle(async(req,res)=>{
  const {relationshipId}=z.object({relationshipId:id}).parse(req.params)
  const {reason}=z.object({reason:z.string().trim().min(2).max(200)}).strict().parse(req.body)
  return success(res,await revokeCampusParentLink(req.user!,relationshipId,reason))
}))
export default router
