import { Router } from 'express'
import { z, ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { registrationRateLimit, withRegistrationAdmission } from '../../middleware/registrationAdmission'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { requireTeacherProductAdmin, requireRecentTeacherMfa } from './authority'
import {
  issueTeacherStaffInvitation,registerInvitedTeacher,joinInvitedTeacher,HuiteacherInviteError,
} from './staffInvitation.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
const bearer=z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/)
const register=z.object({
  inviteCode:bearer,username:z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const rate=createRedisRateLimiter({name:'huiteacher-staff-invitations',limit:30,windowSeconds:900})
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'注册或邀请参数无效',data:null})
    if(e instanceof HuiteacherInviteError)
      return res.status(e.statusCode).json({code:e.code,message:'学校邀请无效或暂不可用，请核实并重试',data:null})
    throw e
  }
})
router.post('/education/register-staff',registrationRateLimit,rate,
  withRegistrationAdmission(wrap(async(req,res)=>{
    const input=register.parse(req.body)
    const result=await registerInvitedTeacher(input)
    return success(res,result,'账号创建成功，已加入教师发展学校')
  })))
router.post('/education/join-staff',authenticateHuiteacher,rate,wrap(async(req,res)=>{
  const {inviteCode}=z.object({inviteCode:bearer}).strict().parse(req.body)
  return success(res,await joinInvitedTeacher({
    actorUserId:req.user!.userId,inviteCode,
  }), '已使用现有教育账号加入学校')
}))
router.post('/organizations/:organizationId/staff-invitations',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,rate,
  wrap(async(req,res)=>success(res,await issueTeacherStaffInvitation({
    organizationId:uuid.parse(req.params.organizationId),inviterUserId:req.user!.userId,
  }))))
export default router
