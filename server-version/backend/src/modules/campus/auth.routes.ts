import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { comparePassword, hashPassword, isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { generateToken } from '../../utils/jwt'
import { success, unauthorized, forbidden } from '../../utils/response'
import { issueCsrfToken, setSchoolSessionCookie, clearSchoolSessionCookie } from '../../utils/authCookies'
import { authenticateSchool } from '../../middleware/auth'
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
  return success(res, { csrfToken: issueCsrfToken(req, res) })
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

    // Until mandatory privileged TOTP is provisioned, no SCHOOL management
    // bearer token may be issued on the strength of a password alone.
    const privileged = await prisma.$queryRaw<Array<{ privileged: boolean }>>`
      SELECT (
        ${match.user.role}::text <> 'STUDENT'
        OR EXISTS (
          SELECT 1 FROM "organization_memberships" m
          WHERE m."user_id" = ${match.userId}
            AND m."valid_until" IS NULL AND m."org_role" = 'ORG_ADMIN'
        )
        OR EXISTS (
          SELECT 1 FROM "organization_capability_grants" c
          JOIN "organization_memberships" m ON m."id" = c."membership_id"
          WHERE m."user_id" = ${match.userId}
            AND m."valid_until" IS NULL AND c."revoked_at" IS NULL
            AND c."capability" IN ('PSYCHOLOGY_STAFF', 'PARENT_REPORT_DISCLOSURE', 'REPORT_MEMBER_EXPORT')
        )
      ) AS "privileged"
    `
    if (privileged[0]?.privileged) return forbidden(res, '高权限账户需完成双因素认证')

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
