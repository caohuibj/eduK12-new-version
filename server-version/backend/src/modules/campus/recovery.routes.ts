import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { withRegistrationAdmission, registrationRateLimit } from '../../middleware/registrationAdmission'
import { asyncHandler } from '../../middleware/asyncHandler'
import { CampusAdmissionError } from './admission.service'
import {
  issueSchoolStudentRecovery, completeSchoolStudentRecovery,
  requestSchoolMfaReset, approveSchoolMfaReset,
} from './recovery.service'
import { success } from '../../utils/response'
import { isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const ids=z.string().uuid()
const wrap=(handler:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await handler(req,res)}
  catch(err){
    if(err instanceof CampusAdmissionError)
      return res.status(err.statusCode).json({code:err.code,message:'账户操作暂不可用，请联系学校核对',data:null})
    if(err instanceof ZodError)
      return res.status(400).json({code:'BAD_REQUEST',message:'请求信息格式不正确',data:null})
    throw err
  }
})
const privileged=[authenticateSchool,requireRecentSchoolMfa] as const
const recoveryLimiter=createRedisRateLimiter({
  name:'campus-student-recovery-claim',limit:12,windowSeconds:900,
  key:req=>String(req.body?.recoveryCode??'invalid').slice(0,128),
})

router.post('/organizations/:organizationId/classes/:classUnitId/student-recoveries',
  ...privileged,wrap(async(req,res)=>{
    const params=z.object({organizationId:ids,classUnitId:ids}).parse(req.params)
    const data=z.object({
      studentNumber:z.string().min(2).max(40),
      reasonCode:z.enum(['FORGOT_PASSWORD','FORGOT_LOGIN','INCIDENT_CORRECTION']),
      verifiedOffline:z.literal(true),
    }).strict().parse(req.body)
    const result=await issueSchoolStudentRecovery({actor:req.user!,...params,...data})
    return success(res,result,'恢复信息只显示一次，请线下核验并安全交付')
  })
)

router.post('/credentials/redeem',
  recoveryLimiter,registrationRateLimit,
  withRegistrationAdmission(wrap(async(req,res)=>{
    const body=z.object({
      recoveryCode:z.string().min(32).max(64),
      newPassword:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
      newLogin:z.string().trim().min(4).max(32).optional(),
    }).strict().parse(req.body)
    const result=await completeSchoolStudentRecovery(body)
    return success(res,result,'校园账号已恢复，原会话失效，请重新登录')
  }))
)

router.post('/organizations/:organizationId/mfa-resets',
  ...privileged,wrap(async(req,res)=>{
    const params=z.object({organizationId:ids}).parse(req.params)
    const data=z.object({
      targetUserId:ids,
      reasonCode:z.enum(['DEVICE_LOST','SECURITY_INCIDENT']),
    }).strict().parse(req.body)
    return success(res,await requestSchoolMfaReset({
      actor:req.user!,...params,...data,
    }), '恢复请求已登记，需另一名学校管理员独立审批')
  })
)

router.post('/organizations/:organizationId/mfa-resets/:requestId/approve',
  ...privileged,wrap(async(req,res)=>{
    const params=z.object({organizationId:ids,requestId:ids}).parse(req.params)
    return success(res,await approveSchoolMfaReset({
      actor:req.user!,...params,
    }), '验证器重置已批准，旧会话撤销')
  })
)

export default router
