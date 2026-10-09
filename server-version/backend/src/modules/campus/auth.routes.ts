import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { comparePassword, hashPassword, isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { generateToken } from '../../utils/jwt'
import { success, unauthorized, forbidden } from '../../utils/response'
import { issueSchoolCsrfToken, setSchoolSessionCookie, clearSchoolSessionCookie } from '../../utils/authCookies'
import { authenticateSchool } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { schoolAccountNeedsMfa, beginSchoolMfaChallenge, getPendingChallenge, startSchoolMfaEnrollment, finishSchoolMfa, verifySchoolTotpStepUp } from './mfa.service'
import {
  loginRateLimit, withLoginAccountFailureThrottle, recordLoginFailure,
  clearLoginFailures, withLoginPasswordVerification,
} from '../../middleware/loginRateLimit'
import { isBoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'

// An opaque internal User.username and an independent SCHOOL login alias are
// mandatory. Training authentication never looks up this alias table.
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
  if (!budget) return res.status(503).json({ code: -1, message: '登录服务暂时不可用' })
  if (!budget.accountIpAllowed || !budget.accountGlobalAllowed) {
    res.setHeader('Retry-After', String(budget.retryAfterSeconds))
    return res.status(429).json({ code: -1, message: '用户名或密码错误' })
  }
  return unauthorized(res, '用户名或密码错误')
}

router.get('/csrf', (req, res) => {
  return success(res, { csrfToken: issueSchoolCsrfToken(req, res) })
})

router.post('/login', loginRateLimit, withLoginAccountFailureThrottle(async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return failedLogin(req, res)
    const normalizedLogin = parsed.data.username.toLowerCase()
    const match = await withLoginPasswordVerification(async () => {
      const account = await prisma.campusAccount.findUnique({
        where: { normalizedLogin }, include: { user: true },
      })
      const user = account?.user
      const usable = !!user && user.accountDomain === 'SCHOOL'
        && user.isActive && !user.isFrozen && !user.mustChangePassword
        && (!user.expiresAt || user.expiresAt > new Date())
      const matches = await comparePassword(parsed.data.password, usable ? user!.passwordHash : DUMMY_HASH)
      return usable && matches ? account : null
    })
    if (!match) return failedLogin(req, res)

    if (await schoolAccountNeedsMfa(match.userId)) {
      const state = await beginSchoolMfaChallenge(req,res,match.userId,match.user.tokenVersion)
      await clearLoginFailures(req)
      return success(res,state,'请完成动态验证码验证')
    }

    await clearLoginFailures(req)
    const u = match.user
    const token = generateToken({
      accountDomain: 'SCHOOL',
      userId: u.id,
      username: u.username,
      role: u.role,
      tokenVersion: u.tokenVersion,
      mustChangePassword: u.mustChangePassword,
    })
    setSchoolSessionCookie(req, res, token)
    return success(res, {
      user: { id: u.id, username: match.loginName, role: u.role, accountDomain: 'SCHOOL' },
    }, '登录成功')
  } catch (cause: any) {
    if (isBoundedAdmissionBusyError(cause)) res.setHeader('Retry-After', String(cause.retryAfterSeconds))
    return res.status(503).json({ code: -1, message: '登录服务暂时不可用' })
  }
}))

const mfaLimiter=createRedisRateLimiter({name:'campus-mfa-challenge',limit:25,windowSeconds:900})
const mfaCode=z.object({code:z.string().min(6).max(80)}).strict()
const pending=(req:Request)=>getPendingChallenge(req)

router.post('/mfa/setup',mfaLimiter,async(req,res)=>{
  try {
    const raw=pending(req)
    if(!raw)return unauthorized(res,'二次验证已失效，请重新输入密码')
    const result=await startSchoolMfaEnrollment(raw)
    if(!result)return forbidden(res,'无法开始验证器绑定')
    return success(res,result,'请使用验证器扫码后确认')
  }catch{return res.status(503).json({code:-1,message:'验证器绑定暂不可用'})}
})
router.post('/mfa/confirm',mfaLimiter,async(req,res)=>{
  try {
    const raw=pending(req),parsed=mfaCode.safeParse(req.body)
    if(!raw||!parsed.success)return unauthorized(res,'二次验证已失效')
    const result=await finishSchoolMfa(req,res,raw,parsed.data.code,'ENROLL')
    if(!result)return unauthorized(res,'动态验证码错误或已使用')
    return success(res,result,'双因素认证已启用')
  }catch{return res.status(503).json({code:-1,message:'双因素认证暂不可用'})}
})
router.post('/mfa/verify',mfaLimiter,async(req,res)=>{
  try {
    const raw=pending(req),parsed=mfaCode.safeParse(req.body)
    if(!raw||!parsed.success)return unauthorized(res,'二次验证已失效')
    const result=await finishSchoolMfa(req,res,raw,parsed.data.code,'VERIFY')
    if(!result)return unauthorized(res,'动态验证码错误或已使用')
    return success(res,result,'验证成功')
  }catch{return res.status(503).json({code:-1,message:'双因素认证暂不可用'})}
})
router.post('/mfa/recovery',mfaLimiter,async(req,res)=>{
  try {
    const raw=pending(req),parsed=mfaCode.safeParse(req.body)
    if(!raw||!parsed.success)return unauthorized(res,'二次验证已失效')
    const result=await finishSchoolMfa(req,res,raw,parsed.data.code,'RECOVERY')
    if(!result)return unauthorized(res,'恢复码无效或已使用')
    return success(res,result,'恢复码已使用，请及时更新验证器')
  }catch{return res.status(503).json({code:-1,message:'账户恢复暂不可用'})}
})
router.post('/mfa/step-up',authenticateSchool,mfaLimiter,async(req,res)=>{
  try {
    const parsed=mfaCode.safeParse(req.body)
    if(!parsed.success)return unauthorized(res,'动态验证码格式无效')
    const accepted=await verifySchoolTotpStepUp(req.user!.userId,parsed.data.code)
    if(!accepted)return unauthorized(res,'动态验证码错误或已使用')
    const user=await prisma.user.findUnique({where:{id:req.user!.userId}})
    if(!user||user.accountDomain!=='SCHOOL')return unauthorized(res)
    setSchoolSessionCookie(req,res,generateToken({
      accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),
      userId:user.id,username:user.username,role:user.role,
      tokenVersion:user.tokenVersion,mustChangePassword:user.mustChangePassword,
    }))
    return success(res,{stepUp:true},'已重新验证')
  }catch{return res.status(503).json({code:-1,message:'动态验证暂不可用'})}
})

router.get('/me', authenticateSchool, async (req, res) => {
  const account = await prisma.campusAccount.findUnique({
    where: { userId: req.user!.userId }, select: { loginName: true },
  })
  if (!account) return unauthorized(res, '校园账号不存在')
  return success(res, {
    id: req.user!.userId, username: account.loginName,
    role: req.user!.role, accountDomain: 'SCHOOL',
  })
})

router.post('/logout', authenticateSchool, (req, res) => {
  clearSchoolSessionCookie(req, res)
  return success(res, null, '退出成功')
})

router.post('/change-password', authenticateSchool, async (req, res) => {
  const parsed = changeSchema.safeParse(req.body)
  if (!parsed.success || parsed.data.oldPassword === parsed.data.newPassword) {
    return res.status(400).json({ code: -1, message: '密码格式不符合要求' })
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user || user.accountDomain !== 'SCHOOL') return unauthorized(res)
  const verified = await withLoginPasswordVerification(() => comparePassword(parsed.data.oldPassword, user.passwordHash))
  if (!verified) return unauthorized(res, '当前密码错误')
  const passwordHash = await hashPassword(parsed.data.newPassword)
  const updated = await prisma.user.updateMany({
    where: { id: user.id, tokenVersion: user.tokenVersion, accountDomain: 'SCHOOL' },
    data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false },
  })
  if (updated.count !== 1) return res.status(409).json({ code: -1, message: '账号状态已改变，请重新登录' })
  clearSchoolSessionCookie(req, res)
  return success(res, null, '密码已修改，请重新登录')
})

export default router
