import {issueAdminContentRoot,revokeAdminContentGrant,readAdminContentGrant} from '../measurement-content/admin-authority.service'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { loginRateLimit, withLoginAccountFailureThrottle, withLoginPasswordVerification, recordLoginFailure } from '../../middleware/loginRateLimit'
import { comparePassword } from '../../utils/password'
import { getSessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { success, error } from '../../utils/response'
import { ADMIN_ENTRIES, AdminPermissionError, changeEntryGrant } from './service'
import { beginAdminRegistration, finishAdminRegistration, beginAdminLogin, finishAdminAuthentication, adminWebAuthnConfig } from './security'
import { requireRecentAdminKey, requireSystemAdmin } from './guards'

const handle = (work: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await work(req, res)) }
  catch (e) {
    if (e instanceof z.ZodError) return error(res, '输入格式不合法', -1, 400)
    if (e instanceof AdminPermissionError) return error(res, e.message, -1, e.statusCode)
    next(e)
  }
}
const originGuard = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { origin } = adminWebAuthnConfig()
    if (req.get('Origin') !== origin && (req.get('Origin') || !['GET','HEAD','OPTIONS'].includes(req.method)))
      return error(res, '管理操作需要受信任的来源', -1, 403)
    if (req.get('Sec-Fetch-Site') === 'cross-site') return error(res, '管理操作不能跨站发起', -1, 403)
    next()
  } catch (e) { next(e) }
}
const limiter = createRedisRateLimiter({ name: 'admin-security', limit: 30, windowSeconds: 300, key: req => req.user?.userId ?? req.ip ?? 'unknown' })
const encoded = z.string().min(1).max(65536)
const credential = z.object({ id: z.string().min(1).max(2048), rawId: z.string().min(1).max(2048),
  type: z.literal('public-key'), clientExtensionResults: z.record(z.unknown()),
  authenticatorAttachment: z.enum(['platform','cross-platform']).optional() }).strict()
const registration = z.object({ response: credential.extend({ response: z.object({
  clientDataJSON: encoded, attestationObject: encoded,
  transports: z.array(z.enum(['usb','nfc','ble','internal','hybrid','cable','smart-card'])).optional(),
}).strict() }) }).strict()
const assertion = z.object({ response: credential.extend({ response: z.object({
  clientDataJSON: encoded, authenticatorData: encoded, signature: encoded, userHandle: encoded.optional(),
}).strict() }) }).strict()
export const adminSecurityRouter = Router()
adminSecurityRouter.use(originGuard, limiter)
adminSecurityRouter.post('/registration/options', loginRateLimit, withLoginAccountFailureThrottle(handle(async (req, res) => {
  const input = z.object({ username: z.string().min(1).max(320), password: z.string().min(1).max(128), enrollmentToken: z.string().length(43) }).strict().parse(req.body)
  const user = await prisma.user.findUnique({ where: { username: input.username } })
  const ok = await withLoginPasswordVerification(() => comparePassword(input.password, user?.passwordHash ?? '$2a$10$fuhNGsB2Z5/iwZtxlw1usOIb5sbX2OzkV/cccQJRbkSpHu2ZPql.a'))
  if (!ok || !user) { await recordLoginFailure(req); throw new AdminPermissionError(403, '登记凭据无效') }
  return beginAdminRegistration(req, res, user.id, input.enrollmentToken)
})))
adminSecurityRouter.post('/registration/verify', handle(req => finishAdminRegistration(req, registration.parse(req.body).response)))
adminSecurityRouter.post('/authentication/verify', handle((req, res) => finishAdminAuthentication(req, res, assertion.parse(req.body).response)))
adminSecurityRouter.post('/step-up/options', authenticate, handle((req, res) => {
  z.object({}).strict().parse(req.body)
  const claims = verifyToken(getSessionToken(req)!)!
  if (!claims.adminSessionId) throw new AdminPermissionError(403, '当前会话不可重新认证')
  return beginAdminLogin(req, res, req.user!.userId, claims.adminSessionId)
}))
adminSecurityRouter.post('/step-up/verify', authenticate, handle((req, res) => {
  const claims = verifyToken(getSessionToken(req)!)!
  if (!claims.adminSessionId) throw new AdminPermissionError(403, '当前会话不可重新认证')
  return finishAdminAuthentication(req, res, assertion.parse(req.body).response, claims.adminSessionId)
}))

export const adminPermissionsRouter = Router()
adminPermissionsRouter.use(authenticate, originGuard, requireSystemAdmin, limiter)
adminPermissionsRouter.get('/accounts', handle(async req => {
  const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), keyword: z.string().trim().max(100).default('') }).strict().parse(req.query)
  const users = await prisma.user.findMany({ where: { accountDomain: { in: ['LEGACY','TRAINING'] },
    ...(query.keyword ? { username: { contains: query.keyword } } : {}) }, take: 25, skip: (query.page - 1) * 25, orderBy: { id: 'asc' },
    select: { id: true, username: true, role: true, platformRole: true, isActive: true } })
  const grants = await prisma.adminEntryGrant.findMany({ where: { userId: { in: users.map(u => u.id) } } })
  const byUser = new Map<string, typeof grants>()
  for (const g of grants) byUser.set(g.userId, [...(byUser.get(g.userId) ?? []), g])
  return { page: query.page, pageSize: 25, accounts: users.map(u => ({ ...u, entries: ADMIN_ENTRIES.map(entry => {
    const grant = byUser.get(u.id)?.find(g => g.entry === entry)
    return { entry, active: Boolean(grant && !grant.revokedAt), version: grant?.version ?? 0 }
  }) })) }
}))
adminPermissionsRouter.put('/accounts/:id/entries/:entry', requireRecentAdminKey, handle(req => {
  const body = z.object({ active: z.boolean(), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(1).max(500) }).strict().parse(req.body)
  return changeEntryGrant({ actorUserId: req.user!.userId, targetUserId: z.string().uuid().parse(req.params.id),
    entry: z.enum(ADMIN_ENTRIES).parse(req.params.entry), actorSession: req.user!, ...body })
}))
adminPermissionsRouter.get('/audit', handle(req => {
  const input = z.object({ targetUserId: z.string().uuid(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().parse(req.query)
  return prisma.adminAuthorizationAudit.findMany({ where: { targetUserId: input.targetUserId }, take: 25, skip: (input.page - 1) * 25,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
}))

// Fixed first-wave content domains only. Uses the existing management session,
// origin and rate boundaries; the transaction rechecks strong authentication.
adminPermissionsRouter.post('/content-grants',requireRecentAdminKey,handle(req=>
  issueAdminContentRoot(req.user!.userId,req.user!,req.body)))
adminPermissionsRouter.post('/content-grants/:id/revoke',requireRecentAdminKey,handle(req=>
  revokeAdminContentGrant(req.user!.userId,req.user!,z.string().uuid().parse(req.params.id),req.body)))

adminPermissionsRouter.get('/content-grants/:id',requireRecentAdminKey,handle(req=>
  readAdminContentGrant(req.user!.userId,req.user!,z.string().uuid().parse(req.params.id))))
