import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { comparePassword, hashPassword, isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { generateToken } from '../../utils/jwt'
import { success, unauthorized, forbidden } from '../../utils/response'
import { issueHuiteacherCsrfToken, setHuiteacherSessionCookie, clearHuiteacherSessionCookie, getHuiteacherSessionToken } from '../../utils/authCookies'
import { authenticateHuiteacher } from '../../middleware/auth'
import { revokeCurrentSession } from '../../utils/sessionRevocation'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../../middleware/passwordChangeAdmission'
import {
  schoolAccountNeedsMfa, beginSchoolMfaChallenge, getPendingChallenge,
  startSchoolMfaEnrollment, finishSchoolMfa, verifySchoolTotpStepUp,
} from '../campus/mfa.service'
import {
  loginRateLimit, withLoginAccountFailureThrottle, recordLoginFailure,
  clearLoginFailures, withLoginPasswordVerification,
} from '../../middleware/loginRateLimit'
import { isBoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'
import { listEducationProductMemberships } from '../organization/educationProductAccess'

// HUITEACHER authenticates against the same education User/campusAccount as
// Huischool. It never reads training logins or creates a duplicate account.
const loginSchema = z.object({
  username: z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
}).strict()
const changeSchema = z.object({
  oldPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const DUMMY_HASH = '$2a$10$fuhNGsB2Z5/iwZtxlw1usOIb5sbX2OzkV/cccQJRbkSpHu2ZPql.a'
const router = Router()
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })

async function failedLogin(req: Request, res: Response) {
  const budget = await recordLoginFailure(req)
  if (!budget) return res.status(503).json({code:-1,message:'登录服务暂时不可用'})
  if (!budget.accountIpAllowed || !budget.accountGlobalAllowed) {
    res.setHeader('Retry-After', String(budget.retryAfterSeconds))
    return res.status(429).json({code:-1,message:'用户名或密码错误'})
  }
  return unauthorized(res,'用户名或密码错误')
}

router.get('/csrf',(req,res)=>success(res,{csrfToken:issueHuiteacherCsrfToken(req,res)}))
router.post('/login',loginRateLimit,withLoginAccountFailureThrottle(async(req,res)=>{
  try {
    const parsed=loginSchema.safeParse(req.body)
    if(!parsed.success)return failedLogin(req,res)
    const normalizedLogin=parsed.data.username.toLowerCase()
    const match=await withLoginPasswordVerification(async()=>{
      const account=await prisma.campusAccount.findUnique({
        where:{normalizedLogin},include:{user:true},
      })
      const u=account?.user
      const usable=!!u && u.accountDomain==='SCHOOL' && u.isActive && !u.isFrozen
        && (!u.expiresAt || u.expiresAt>new Date())
      const ok=await comparePassword(parsed.data.password,usable?u!.passwordHash:DUMMY_HASH)
      return usable&&ok?account:null
    })
    if(!match)return failedLogin(req,res)
    if(await schoolAccountNeedsMfa(match.userId)){
      const state=await beginSchoolMfaChallenge(req,res,match.userId,match.user.tokenVersion)
      await clearLoginFailures(req)
      return success(res,state,'请完成动态验证码验证')
    }
    await clearLoginFailures(req)
    const u=match.user
    setHuiteacherSessionCookie(req,res,generateToken({
      accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',
      userId:u.id,username:u.username,role:u.role,
      tokenVersion:u.tokenVersion,mustChangePassword:u.mustChangePassword,
    }))
    return success(res,{user:{id:u.id,username:match.loginName,role:u.role},product:'HUITEACHER'},'登录成功')
  }catch(cause:unknown){
    if(isBoundedAdmissionBusyError(cause))res.setHeader('Retry-After',String(cause.retryAfterSeconds))
    return res.status(503).json({code:-1,message:'教育身份服务暂时不可用',data:null})
  }
}))

const mfaLimiter=createRedisRateLimiter({name:'huiteacher-mfa-challenge',limit:25,windowSeconds:900})
const mfaCode=z.object({code:z.string().min(6).max(80)}).strict()
router.post('/mfa/setup',mfaLimiter,async(req,res)=>{
  try{
    const raw=getPendingChallenge(req)
    if(!raw)return unauthorized(res,'二次验证已失效')
    const result=await startSchoolMfaEnrollment(raw)
    return result?success(res,result):forbidden(res,'验证器绑定不可用')
  }catch{return res.status(503).json({code:-1,message:'双因素认证服务暂不可用',data:null})}
})
for(const [route,kind] of [['confirm','ENROLL'],['verify','VERIFY'],['recovery','RECOVERY']] as const){
  router.post('/mfa/'+route,mfaLimiter,async(req,res)=>{
    try{
      const raw=getPendingChallenge(req),parsed=mfaCode.safeParse(req.body)
      if(!raw||!parsed.success)return unauthorized(res,'二次验证已失效或验证码格式错误')
      const result=await finishSchoolMfa(req,res,raw,parsed.data.code,kind,'HUITEACHER')
      return result?success(res,result,'二次认证已完成'):unauthorized(res,'验证码无效或已使用')
    }catch{return res.status(503).json({code:-1,message:'双因素认证服务暂不可用',data:null})}
  })
}
router.post('/mfa/step-up',authenticateHuiteacher,mfaLimiter,async(req,res)=>{
  try{
    const parsed=mfaCode.safeParse(req.body)
    if(!parsed.success||!await verifySchoolTotpStepUp(req.user!.userId,parsed.data.code))
      return unauthorized(res,'验证码无效或已使用')
    const user=await prisma.user.findUnique({where:{id:req.user!.userId}})
    if(!user||user.accountDomain!=='SCHOOL')return unauthorized(res)
    setHuiteacherSessionCookie(req,res,generateToken({
      userId:user.id,username:user.username,role:user.role,
      accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',
      tokenVersion:user.tokenVersion,mustChangePassword:user.mustChangePassword,
      mfaVerifiedAt:Math.floor(Date.now()/1000),
    }))
    return success(res,{stepUp:true})
  }catch{return res.status(503).json({code:-1,message:'动态验证码服务不可用',data:null})}
})
router.get('/me',authenticateHuiteacher,async(req,res)=>{
  try{
    const account=await prisma.campusAccount.findUnique({
      where:{userId:req.user!.userId},select:{loginName:true},
    })
    if(!account)return unauthorized(res)
    const organizations=await listEducationProductMemberships(req.user!.userId,'HUITEACHER')
    return success(res,{
      id:req.user!.userId,username:account.loginName,role:req.user!.role,
      organizations,
      product:'HUITEACHER',accountDomain:'SCHOOL',
      mustChangePassword:req.user!.mustChangePassword,
    })
  }catch{return res.status(503).json({code:-1,message:'产品授权读取暂不可用',data:null})}
})
router.post('/logout',authenticateHuiteacher,async(req,res)=>{
  if(!await revokeCurrentSession(getHuiteacherSessionToken(req)))
    return res.status(503).json({code:-1,message:'退出暂不可用，请稍后重试',data:null})
  clearHuiteacherSessionCookie(req,res)
  return success(res,null,'退出成功')
})
router.post('/change-password',authenticateHuiteacher,passwordChangeRateLimit,withPasswordChangeAdmission(async(req,res)=>{
  const parsed=changeSchema.safeParse(req.body)
  if(!parsed.success||parsed.data.oldPassword===parsed.data.newPassword)
    return res.status(400).json({code:-1,message:'密码格式不符合要求',data:null})
  const user=await prisma.user.findUnique({where:{id:req.user!.userId}})
  if(!user||user.accountDomain!=='SCHOOL')return unauthorized(res)
  if(!await comparePassword(parsed.data.oldPassword,user.passwordHash))
    return unauthorized(res,'当前密码错误')
  const passwordHash=await hashPassword(parsed.data.newPassword)
  const updated=await prisma.user.updateMany({
    where:{id:user.id,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL'},
    data:{passwordHash,tokenVersion:{increment:1},mustChangePassword:false},
  })
  if(updated.count!==1)return res.status(409).json({code:-1,message:'账号状态已改变，请重新登录',data:null})
  clearHuiteacherSessionCookie(req,res)
  return success(res,null,'密码已修改，请在两个产品重新登录')
}))
export default router
