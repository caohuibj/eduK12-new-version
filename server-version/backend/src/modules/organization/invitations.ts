import { Router, type Request, type Response } from 'express'
import { Prisma } from '@prisma/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { resolveOrganizationAccessContext } from './access'
import { appendAudit, executeCommand } from './service'
import { OrganizationDomainError, type OrganizationPersona } from './types'

type Tx = Prisma.TransactionClient
type Invite = {
  id: string
  organizationId: string
  invitedByUserId: string
  persona: OrganizationPersona | null
  status: string
  expiresAt: Date
  consumedByUserId: string | null
  membershipId: string | null
}
const digest = (code: string) =>
  createHash('sha256')
    .update('organization-member-invite-v1:' + code)
    .digest('hex')
const denied = () => {
  throw new OrganizationDomainError(
    'ORG_INVITE_UNAVAILABLE',
    '邀请不存在、已失效或当前账号无权使用',
    404,
  )
}
async function principal(tx: Tx, userId: string) {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      platformRole: true,
      isActive: true,
      isFrozen: true,
      expiresAt: true,
      mustChangePassword: true,
      teacherApproved: true,
    },
  })
  if (
    !u ||
    !u.isActive ||
    u.isFrozen ||
    u.mustChangePassword ||
    (u.expiresAt && u.expiresAt <= new Date()) ||
    (u.role === 'TEACHER' && !u.teacherApproved)
  )
    return denied()
  return u
}
async function governance(tx: Tx, organizationId: string, userId: string) {
  const u = await principal(tx, userId),
    c = await resolveOrganizationAccessContext(
      {
        principal: { userId: u.id, platformRole: u.platformRole },
        organizationId,
      },
      tx,
    )
  if (!c?.canGovern || c.organizationStatus !== 'ACTIVE') return denied()
  return c
}
async function readInvite(tx: Tx, code: string, lock = false) {
  const rows = await tx.$queryRaw<Invite[]>(
    Prisma.sql`SELECT id,organization_id AS "organizationId",invited_by_user_id AS "invitedByUserId",persona,status,expires_at AS "expiresAt",consumed_by_user_id AS "consumedByUserId",membership_id AS "membershipId" FROM organization_member_invitations WHERE token_hash=${digest(code)} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
  )
  return rows[0] ?? denied()
}
export async function createOrganizationInvitation(
  userId: string,
  organizationId: string,
  persona: OrganizationPersona | null,
) {
  return prisma.$transaction(async (tx) => {
    await governance(tx, organizationId, userId)
    const code = randomBytes(18).toString('base64url'),
      id = randomUUID(),
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await tx.$executeRaw`INSERT INTO organization_member_invitations(id,organization_id,token_hash,invited_by_user_id,persona,expires_at) VALUES(${id},${organizationId},${digest(code)},${userId},${persona},${expiresAt})`
    await appendAudit(tx, {
      organizationId,
      actorUserId: userId,
      action: 'MEMBER_INVITATION_CREATED',
      targetType: 'INVITATION',
      targetId: id,
      domainEventId: randomUUID(),
      payload: { persona },
    })
    return { id, inviteCode: code, expiresAt, orgRole: 'MEMBER', persona }
  })
}
export async function previewOrganizationInvitation(
  userId: string,
  code: string,
) {
  return prisma.$transaction(async (tx) => {
    const u = await principal(tx, userId),
      invite = await readInvite(tx, code)
    if (invite.status !== 'ACTIVE' || invite.expiresAt <= new Date())
      return denied()
    await governance(tx, invite.organizationId, invite.invitedByUserId)
    if (
      (invite.persona === 'TEACHER' && u.role !== 'TEACHER') ||
      (invite.persona === 'STUDENT' && u.role !== 'STUDENT')
    )
      return denied()
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: invite.organizationId },
      select: { id: true, name: true },
    })
    const context = await resolveOrganizationAccessContext(
      {
        principal: { userId: u.id, platformRole: u.platformRole },
        organizationId: invite.organizationId,
      },
      tx,
    )
    if (context?.explicitDenies.includes('*')) return denied()
    return {
      organization,
      orgRole: 'MEMBER' as const,
      persona: invite.persona,
      expiresAt: invite.expiresAt,
      alreadyMember: Boolean(context?.membershipId),
    }
  })
}
export async function acceptOrganizationInvitation(
  userId: string,
  code: string,
  commandKey: string,
) {
  const preview = await previewOrganizationInvitation(userId, code).catch(
    async (err) => {
      const invite = await readInvite(prisma, code)
      if (invite.status !== 'CONSUMED' || invite.consumedByUserId !== userId)
        throw err
      const u = await principal(prisma, userId)
      const context = await resolveOrganizationAccessContext(
        {
          principal: { userId: u.id, platformRole: u.platformRole },
          organizationId: invite.organizationId,
        },
        prisma,
      )
      if (
        !context?.membershipId ||
        context.membershipId !== invite.membershipId ||
        context.explicitDenies.includes('*')
      )
        return denied()
      await governance(prisma, invite.organizationId, invite.invitedByUserId)
      return { organization: { id: invite.organizationId } }
    },
  )
  const organizationId = preview.organization.id
  return executeCommand({
    organizationId,
    meta: { actorUserId: userId, commandKey },
    payload: { action: 'MEMBER_INVITATION_ACCEPT', tokenHash: digest(code) },
    work: async (tx, domainEventId) => {
      await tx.$executeRaw`SELECT id FROM organizations WHERE id=${organizationId} FOR UPDATE`
      const u = await principal(tx, userId),
        invite = await readInvite(tx, code, true)
      await governance(tx, organizationId, invite.invitedByUserId)
      const context = await resolveOrganizationAccessContext(
        {
          principal: { userId: u.id, platformRole: u.platformRole },
          organizationId,
        },
        tx,
      )
      if (context?.explicitDenies.includes('*')) return denied()
      if (invite.status === 'CONSUMED' && invite.consumedByUserId === userId) {
        if (
          !context?.membershipId ||
          context.membershipId !== invite.membershipId
        )
          return denied()
        return { organizationId, membershipId: invite.membershipId }
      }
      if (invite.status !== 'ACTIVE' || invite.expiresAt <= new Date())
        return denied()
      if (
        (invite.persona === 'TEACHER' && u.role !== 'TEACHER') ||
        (invite.persona === 'STUDENT' && u.role !== 'STUDENT')
      )
        return denied()
      if (context?.membershipId)
        throw new OrganizationDomainError(
          'MEMBERSHIP_EXISTS',
          '您已是该组织的成员，请从组织列表进入',
          409,
        )
      const membershipId = randomUUID()
      await tx.$executeRaw`INSERT INTO organization_memberships(id,organization_id,user_id,org_role) VALUES(${membershipId},${organizationId},${userId},'MEMBER')`
      if (invite.persona)
        await tx.$executeRaw`INSERT INTO organization_persona_grants(id,organization_id,membership_id,persona,granted_by_user_id) VALUES(${randomUUID()},${organizationId},${membershipId},${invite.persona},${invite.invitedByUserId})`
      await tx.$executeRaw`UPDATE organization_member_invitations SET status='CONSUMED',consumed_by_user_id=${userId},membership_id=${membershipId} WHERE id=${invite.id}`
      await appendAudit(tx, {
        organizationId,
        actorUserId: userId,
        action: 'MEMBER_INVITATION_ACCEPTED',
        targetType: 'MEMBERSHIP',
        targetId: membershipId,
        domainEventId,
        payload: {
          invitationId: invite.id,
          orgRole: 'MEMBER',
          persona: invite.persona,
        },
      })
      return { organizationId, membershipId }
    },
  })
}
const commandKey = z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  code = z.string().regex(/^[A-Za-z0-9_-]{24}$/)
const budget = createRedisRateLimiter({
  name: 'organization-invitation',
  limit: 20,
  windowSeconds: 15 * 60,
  key: (req) => req.user?.userId ?? 'anonymous',
})
function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      return success(res, await fn(req))
    } catch (e) {
      if (e instanceof z.ZodError)
        return res
          .status(400)
          .json({ code: 'INVITE_INPUT', message: '邀请信息无效', data: null })
      if (e instanceof OrganizationDomainError)
        return res
          .status(e.statusCode)
          .json({ code: e.code, message: e.message, data: null })
      return res
        .status(409)
        .json({
          code: 'INVITE_STATE_CHANGED',
          message: '状态已变化，请核对组织列表后重试',
          data: null,
        })
    }
  }
}
export const organizationInvitationsRouter = Router()
organizationInvitationsRouter.use(
  authenticate,
  (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  },
  budget,
)
organizationInvitationsRouter.post(
  '/preview',
  handle((req) =>
    previewOrganizationInvitation(
      req.user!.userId,
      z.object({ inviteCode: code }).strict().parse(req.body).inviteCode,
    ),
  ),
)
organizationInvitationsRouter.post(
  '/accept',
  handle((req) => {
    const b = z
      .object({ inviteCode: code, commandKey })
      .strict()
      .parse(req.body)
    return acceptOrganizationInvitation(
      req.user!.userId,
      b.inviteCode,
      b.commandKey,
    )
  }),
)
export const invitationAdminHandlers = {
  create: handle((req) =>
    createOrganizationInvitation(
      req.user!.userId,
      req.params.organizationId,
      z
        .object({
          persona: z
            .enum(['TEACHER', 'STUDENT', 'COUNSELOR', 'CLIENT'])
            .nullable()
            .default(null),
        })
        .strict()
        .parse(req.body).persona,
    ),
  ),
  list: handle(async (req) => {
    await governance(prisma, req.params.organizationId, req.user!.userId)
    const { page, pageSize } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query)
    const list = await prisma.$queryRaw<
      Array<Record<string, unknown>>
    >`SELECT id,persona,status,expires_at AS "expiresAt",created_at AS "createdAt",consumed_by_user_id AS "consumedByUserId" FROM organization_member_invitations WHERE organization_id=${req.params.organizationId} ORDER BY created_at DESC,id LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`
    return {
      list: list.slice(0, pageSize),
      page,
      pageSize,
      hasMore: list.length > pageSize,
    }
  }),
  revoke: handle(async (req) =>
    prisma.$transaction(async (tx) => {
      const org = req.params.organizationId
      await governance(tx, org, req.user!.userId)
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`UPDATE organization_member_invitations SET status='REVOKED',revoked_by_user_id=${req.user!.userId} WHERE id=${req.params.invitationId} AND organization_id=${org} AND status='ACTIVE' RETURNING id`
      if (!rows[0]) return denied()
      await appendAudit(tx, {
        organizationId: org,
        actorUserId: req.user!.userId,
        action: 'MEMBER_INVITATION_REVOKED',
        targetType: 'INVITATION',
        targetId: rows[0].id,
        domainEventId: randomUUID(),
        payload: {},
      })
      return { id: rows[0].id }
    }),
  ),
}
