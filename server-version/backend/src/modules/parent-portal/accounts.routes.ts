import { Router, type Request, type Response } from 'express'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import {
  AccountAuthorityError,
  assertCurrentSystemAdmin,
  assertAccountUsabilityMutationSafe,
} from '../../services/accountAuthorityService'
import {
  BoundedAdmissionGate,
  isBoundedAdmissionBusyError,
} from '../../services/boundedAdmissionGate'
import {
  hashPassword,
  isValidPassword,
  PASSWORD_MAX_LENGTH,
} from '../../utils/password'
import { success } from '../../utils/response'
import { appendAudit, executeCommand } from '../organization/service'
import { OrganizationDomainError } from '../organization/types'

const budget = createRedisRateLimiter({
  name: 'parent-account-create',
  limit: 10,
  windowSeconds: 15 * 60,
  key: (req) => req.user?.userId ?? 'anonymous',
})
const admission = new BoundedAdmissionGate({
  name: 'parent_account_create',
  maxConcurrent: 1,
  maxQueue: 4,
  maxWaitMs: 1000,
  retryAfterSeconds: 2,
})
const inputSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_-]{4,32}$/,
        '用户名须为4至32位字母、数字、下划线或连字符',
      ),
    nickname: z.string().trim().min(1).max(100),
    password: z
      .string()
      .max(PASSWORD_MAX_LENGTH)
      .refine(isValidPassword, '初始密码至少8位，包含字母和数字'),
    commandKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict()
const querySchema = z.object({
  keyword: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
const fields = {
  id: true,
  username: true,
  nickname: true,
  role: true,
  platformRole: true,
  isActive: true,
  isFrozen: true,
  expiresAt: true,
  mustChangePassword: true,
  teacherApproved: true,
  createdAt: true,
} as const
async function accountActor(
  tx: Parameters<typeof assertCurrentSystemAdmin>[0],
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR SHARE`
  await assertCurrentSystemAdmin(tx, userId)
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true, role: true, teacherApproved: true },
  })
  if (
    !user ||
    user.mustChangePassword ||
    (user.role === 'TEACHER' && !user.teacherApproved)
  )
    throw new AccountAuthorityError(
      'ACCOUNT_NOT_READY',
      '请先完成账号密码或审批流程',
      403,
    )
}
function sendError(res: Response, err: unknown) {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({
        code: 'PARENT_ACCOUNT_INPUT',
        message: err.errors[0].message,
        data: null,
      })
  if (
    err instanceof AccountAuthorityError ||
    err instanceof OrganizationDomainError
  )
    return res
      .status(err.statusCode)
      .json({ code: err.code, message: err.message, data: null })
  if (isBoundedAdmissionBusyError(err)) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds))
    return res
      .status(503)
      .json({
        code: 'PARENT_ACCOUNT_BUSY',
        message: '账号管理繁忙，请稍后核对列表再重试',
        data: null,
      })
  }
  if ((err as { code?: string })?.code === 'P2002')
    return res
      .status(409)
      .json({
        code: 'PARENT_USERNAME_EXISTS',
        message: '用户名已存在，请核对账号列表',
        data: null,
      })
  return res
    .status(500)
    .json({
      code: 'PARENT_ACCOUNT_FAILED',
      message: '账号操作失败，请核对列表后重试',
      data: null,
    })
}
async function list(req: Request, res: Response, parentsOnly: boolean) {
  try {
    await accountActor(prisma, req.user!.userId)
    const { keyword, page, pageSize } = querySchema.parse(req.query)
    const where = {
      ...(parentsOnly ? { role: 'PARENT' as const } : {}),
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword, mode: 'insensitive' as const } },
              { nickname: { contains: keyword, mode: 'insensitive' as const } },
              { id: keyword },
            ],
          }
        : {}),
    }
    const [rows, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: fields,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ])
    return success(res, { list: rows, total, page, pageSize })
  } catch (err) {
    return sendError(res, err)
  }
}
export const parentAccountsRouter = Router()
parentAccountsRouter.use(authenticate, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
parentAccountsRouter.get('/', (req, res) => {
  void list(req, res, true)
})
parentAccountsRouter.post('/', budget, async (req, res) => {
  try {
    await accountActor(prisma, req.user!.userId)
    const input = inputSchema.parse(req.body),
      actorUserId = req.user!.userId
    return await admission.run(async () => {
      // Receipt fingerprint includes a keyed password fingerprint, never plaintext.
      const credentialFingerprint = createHmac('sha256', config.jwtSecret)
        .update(input.password)
        .digest('hex')
      const result = await executeCommand({
        organizationId: null,
        meta: { actorUserId, commandKey: input.commandKey },
        payload: {
          action: 'PARENT_ACCOUNT_CREATE',
          username: input.username,
          nickname: input.nickname,
          credentialFingerprint,
        },
        work: async (tx, domainEventId) => {
          await accountActor(tx, actorUserId)
          const user = await tx.user.create({
            data: {
              username: input.username,
              nickname: input.nickname,
              passwordHash: await hashPassword(input.password),
              role: 'PARENT',
              platformRole: 'STANDARD',
              mustChangePassword: true,
            },
            select: fields,
          })
          await appendAudit(tx, {
            organizationId: null,
            actorUserId,
            action: 'PARENT_ACCOUNT_CREATED',
            targetType: 'USER',
            targetId: user.id,
            domainEventId,
            payload: { role: 'PARENT' },
          })
          return user
        },
      })
      return success(res, result, '家长账号已建立，首次登录需修改密码')
    })
  } catch (err) {
    return sendError(res, err)
  }
})
export const platformUsersRouter = Router()
platformUsersRouter.use(authenticate, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
platformUsersRouter.get('/', (req, res) => {
  void list(req, res, false)
})

parentAccountsRouter.post('/:id/reset-password', budget, async (req, res) => {
  try {
    const actorUserId = req.user!.userId
    await accountActor(prisma, actorUserId)
    const input = inputSchema
      .pick({ password: true, commandKey: true })
      .parse(req.body)
    return await admission.run(async () => {
      const credentialFingerprint = createHmac('sha256', config.jwtSecret)
        .update(input.password)
        .digest('hex')
      const result = await executeCommand({
        organizationId: null,
        meta: { actorUserId, commandKey: input.commandKey },
        payload: {
          action: 'PARENT_PASSWORD_RESET',
          targetId: req.params.id,
          credentialFingerprint,
        },
        work: async (tx, domainEventId) => {
          await accountActor(tx, actorUserId)
          const rows = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM users WHERE id=${req.params.id} AND role='PARENT' FOR UPDATE`
          if (!rows[0])
            throw new AccountAuthorityError(
              'PARENT_ACCOUNT_NOT_FOUND',
              '家长账号不存在',
              404,
            )
          await assertAccountUsabilityMutationSafe(tx, rows[0].id)
          await tx.user.update({
            where: { id: rows[0].id },
            data: {
              passwordHash: await hashPassword(input.password),
              mustChangePassword: true,
              tokenVersion: { increment: 1 },
            },
          })
          await appendAudit(tx, {
            organizationId: null,
            actorUserId,
            action: 'PARENT_PASSWORD_RESET',
            targetType: 'USER',
            targetId: rows[0].id,
            domainEventId,
            payload: {},
          })
          return { id: rows[0].id }
        },
      })
      return success(res, result, '密码已重置，首次登录需修改密码')
    })
  } catch (err) {
    return sendError(res, err)
  }
})
