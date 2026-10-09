import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { withRegistrationAdmission, registrationRateLimit } from '../../middleware/registrationAdmission'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { CampusAdmissionError } from './admission.service'
import { createCampusStaffInvitation, registerCampusStaff } from './staff.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const rate=createRedisRateLimiter({name:'campus-staff-invite-claim',limit:30,windowSeconds:900})
const response=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'请求信息格式不正确',data:null})
    if(e instanceof CampusAdmissionError)return res.status(e.statusCode).json({code:e.code,message:'校园成员操作暂不可用',data:null})
    throw e
  }
})

router.post('/organizations/:organizationId/staff-invitations',
  authenticateSchool,requireRecentSchoolMfa,response(async(req,res)=>{
    const params=z.object({organizationId:z.string().uuid()}).parse(req.params)
    const body=z.object({
      persona:z.enum(['TEACHER','COUNSELOR']),adminRole:z.boolean().default(false),
      psychologyStaff:z.boolean().default(false),
    }).strict().parse(req.body)
    return success(res,await createCampusStaffInvitation({actor:req.user!,...params,...body}))
  })
)

router.post('/staff/register',rate,registrationRateLimit,
  withRegistrationAdmission(response(async(req,res)=>{
    const body=z.object({
      inviteCode:z.string().min(28).max(64),
      username:z.string().min(4).max(32),
      password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
    }).strict().parse(req.body)
    return success(res,await registerCampusStaff(body),'校园账号已建立，请登录')
  }))
)

export default router
