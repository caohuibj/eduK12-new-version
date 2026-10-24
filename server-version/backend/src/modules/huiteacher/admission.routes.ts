import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { registrationRateLimit,withRegistrationAdmission } from '../../middleware/registrationAdmission'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { isValidPassword,PASSWORD_MAX_LENGTH } from '../../utils/password'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import {
  HuiteacherStudentInviteError,issueTeacherStudentInvitations,
  registerInvitedTeacherStudent,joinExistingTeacherStudent,
} from './studentInvitation.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const studentNo=z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/)
const token=z.string().trim().regex(/^[a-zA-Z0-9_-]{43}$/)
const register=z.object({
  inviteCode:token,studentNumber:studentNo,
  username:z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const rate=createRedisRateLimiter({name:'huiteacher-student-invitations',limit:30,windowSeconds:900})
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'学生身份参数无效',data:null})
    if(e instanceof HuiteacherStudentInviteError)
      return res.status(e.statusCode).json({code:e.code,message:'学生邀请无效或暂不可用，请联系学校核实',data:null})
    throw e
  }
})
router.post('/education/register-student',registrationRateLimit,rate,
  withRegistrationAdmission(wrap(async(req,res)=>{
    const input=register.parse(req.body)
    return success(res,await registerInvitedTeacherStudent(input),
      '教育账号已注册并加入班级；不自动激活心理健康业务')
  })))
router.post('/education/join-student',authenticateHuiteacher,rate,wrap(async(req,res)=>{
  const input=z.object({inviteCode:token,studentNumber:studentNo}).strict().parse(req.body)
  return success(res,await joinExistingTeacherStudent({
    actorUserId:req.user!.userId,...input,
  }),'已使用现有学生账号加入教师发展学校')
}))
router.post('/organizations/:organizationId/classes/:classUnitId/student-invitations',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,rate,
  wrap(async(req,res)=>{
    const organizationId=uuid.parse(req.params.organizationId)
    const classUnitId=uuid.parse(req.params.classUnitId)
    const body=z.object({studentNumbers:z.array(studentNo).min(1).max(200)}).strict().parse(req.body)
    return success(res,await issueTeacherStudentInvitations({
      actorUserId:req.user!.userId,organizationId,classUnitId,
      studentNumbers:body.studentNumbers,
    }))
  }))
export default router
