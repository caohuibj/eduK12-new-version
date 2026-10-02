import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, notFound, success, unauthorized, forbidden } from '../../utils/response'
import {
  resolveAssessmentDeliveryAuthority,
  resolveOrganizationAccessContext,
  type AssessmentDeliveryScope,
  type OrganizationAccessContext,
} from './access'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  endMembership,
  grantCapability,
  grantPersona,
  liftOrganizationAccessDeny,
  resumeOrganization,
  revokeCapability,
  revokePersona,
  setMembershipRole,
  suspendOrganization,
} from './service'
import { OrganizationDomainError } from './types'

// Navigation hints are server-owned. Exact resources still authorize every request.
export function organizationProductActions(
  context: OrganizationAccessContext,
  deliveryScopes: readonly AssessmentDeliveryScope[] = [],
): string[] {
  const denied = (...permissions: string[]) => context.explicitDenies.some(value => value === '*' || permissions.includes(value))
  const active = context.organizationStatus === 'ACTIVE'
  const member = context.membershipId !== null
  const professional = context.personas.includes('TEACHER') || context.personas.includes('COUNSELOR')
  const psychology = context.capabilities.includes('PSYCHOLOGY_STAFF')
  const actions: string[] = []
  if (context.canGovern) actions.push('GOVERN')
  if (context.canGovern && active) actions.push('RUNS')
  if (
    member
    && active
    && !denied('ORGANIZATION_GOVERNANCE', 'ASSESSMENT_DELIVERY', 'ASSESSMENT_RUN_PUBLISH', 'RUN_PUBLISH')
    && deliveryScopes.length > 0
  ) actions.push('ASSESSMENT_DELIVERY')
  if (context.platformRole === 'SYSTEM_ADMIN' || context.canGovern) actions.push('MANAGE_DENIES')
  if (context.platformRole === 'SYSTEM_ADMIN' && !denied('ORGANIZATION_GOVERNANCE')) actions.push(active ? 'SUSPEND' : 'RESUME')
  if (member && active && !denied('REPORT_READ', 'ORG_GROUP_REPORT_V1') && (context.orgRole === 'ORG_ADMIN' || psychology || professional)) actions.push('REPORTING')
  if (member && !denied('REPORT_READ', 'SAFETY_READ') && ((active && context.orgRole === 'ORG_ADMIN') || psychology || professional)) actions.push('SAFETY')
  if (member && active && !denied('REPORT_READ', 'REPORT_EXPORT') && context.capabilities.includes('REPORT_EXPORT')) actions.push('EXPORT_AGGREGATE')
  if (member && active && !denied('REPORT_READ', 'REPORT_EXPORT', 'REPORT_MEMBER_EXPORT') && context.capabilities.includes('REPORT_MEMBER_EXPORT')) actions.push('EXPORT_MEMBER')
  if (actions.some(action => ['SAFETY', 'EXPORT_AGGREGATE', 'EXPORT_MEMBER'].includes(action))) actions.push('DELIVERY')
  return actions
}

const createOrganizationSchema = z.object({ name: z.string().trim().min(1).max(200), firstAdminUserId: z.string().min(1).optional() })
const membershipSchema = z.object({
  userId: z.string().min(1),
  orgRole: z.enum(['MEMBER', 'ORG_ADMIN']).optional(),
})
const roleSchema = z.object({ orgRole: z.enum(['MEMBER', 'ORG_ADMIN']) })
const endSchema = z.object({ reason: z.string().trim().max(500).optional() })
const personaSchema = z.object({ persona: z.enum(['TEACHER', 'STUDENT', 'COUNSELOR', 'CLIENT']) })
const capabilitySchema = z.object({
  capability: z.enum(['PSYCHOLOGY_STAFF', 'REPORT_EXPORT', 'REPORT_MEMBER_EXPORT', 'PARENT_REPORT_DISCLOSURE']),
})
const denySchema = z.object({
  userId: z.string().min(1),
  permission: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
})
const liftDenySchema = z.object({
  userId: z.string().min(1),
  permission: z.string().trim().min(1).max(100),
})

type AccessibleOrganizationRow = {
  id: string
  name: string
  status: string
  membershipId: string | null
  orgRole: string | null
  createdAt: Date
}

function commandMeta(req: Request) {
  return {
    actorUserId: req.user!.userId,
    commandKey: req.get('Idempotency-Key')?.trim() || String(req.body?.commandKey ?? '').trim(),
  }
}

function sendDomainError(res: Response, err: unknown) {
  if (err instanceof OrganizationDomainError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, data: null })
  }
  const raw = err as any
  const postgresCode = raw?.meta?.code ?? raw?.code
  if (postgresCode === '23505' || (raw?.code === 'P2010' && raw?.meta?.code === '23505')) {
    return res.status(409).json({ code: 'ORG_CONFLICT', message: '组织治理状态冲突', data: null })
  }
  return error(res, '组织治理操作失败', -1, 500)
}

function parsePage(req: Request) {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '50'), 10) || 50))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export const organizationController = {
  async listAccessible(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const { page, pageSize, offset } = parsePage(req)
      const { userId, platformRole } = req.user
      let rows: AccessibleOrganizationRow[]
      let totals: Array<{ count: number }>

      if (platformRole === 'SYSTEM_ADMIN') {
        ;[rows, totals] = await Promise.all([
          prisma.$queryRaw<AccessibleOrganizationRow[]>`
            SELECT
              o."id",
              o."name",
              o."status",
              m."id" AS "membershipId",
              m."org_role" AS "orgRole",
              o."created_at" AS "createdAt"
            FROM "organizations" o
            LEFT JOIN "organization_memberships" m
              ON m."organization_id" = o."id"
             AND m."user_id" = ${userId}
             AND m."valid_from" <= statement_timestamp()
             AND (m."valid_until" IS NULL OR statement_timestamp() < m."valid_until")
            ORDER BY o."name", o."id"
            LIMIT ${pageSize} OFFSET ${offset}
          `,
          prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS "count" FROM "organizations"
          `,
        ])
      } else {
        ;[rows, totals] = await Promise.all([
          prisma.$queryRaw<AccessibleOrganizationRow[]>`
            SELECT
              o."id",
              o."name",
              o."status",
              m."id" AS "membershipId",
              m."org_role" AS "orgRole",
              o."created_at" AS "createdAt"
            FROM "organization_memberships" m
            JOIN "organizations" o ON o."id" = m."organization_id"
            WHERE m."user_id" = ${userId}
              AND m."valid_from" <= statement_timestamp()
              AND (m."valid_until" IS NULL OR statement_timestamp() < m."valid_until")
            ORDER BY o."name", o."id"
            LIMIT ${pageSize} OFFSET ${offset}
          `,
          prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS "count"
            FROM "organization_memberships" m
            WHERE m."user_id" = ${userId}
              AND m."valid_from" <= statement_timestamp()
              AND (m."valid_until" IS NULL OR statement_timestamp() < m."valid_until")
          `,
        ])
      }

      return success(res, {
        platformRole,
        allowedActions: platformRole === 'SYSTEM_ADMIN' ? ['CREATE_ORGANIZATION'] : [],
        list: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          scopeBasis: platformRole === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'MEMBERSHIP',
        })),
        total: totals[0]?.count ?? 0,
        page,
        pageSize,
      })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async readContext(req: Request, res: Response) {
    if (!req.user) return unauthorized(res)
    try {
      const organizationId = req.params.organizationId
      const access = await resolveOrganizationAccessContext({
        principal: req.user,
        organizationId,
      })
      if (!access) return notFound(res, '组织不存在')

      // Organization product discovery is limited to direct current Membership
      // or current SYSTEM_ADMIN scope. Parent relationship evidence remains a
      // separate subject-scoped authority and is not promoted to Membership.
      if (req.user.platformRole !== 'SYSTEM_ADMIN' && access.membershipId === null) {
        return notFound(res, '组织不存在')
      }

      const organizations = await prisma.$queryRaw<Array<{ id: string; name: string; status: string }>>`
        SELECT "id", "name", "status"
        FROM "organizations"
        WHERE "id" = ${organizationId}
        LIMIT 1
      `
      const organization = organizations[0]
      if (!organization) return notFound(res, '组织不存在')

      const delivery = await resolveAssessmentDeliveryAuthority({
        principal: req.user,
        organizationId,
      })
      return success(res, {
        organization,
        access,
        allowedActions: organizationProductActions(access, delivery?.deliveryScopes ?? []),
      })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async create(req: Request, res: Response) {
    if (req.user?.platformRole !== 'SYSTEM_ADMIN') return forbidden(res, '仅平台管理员可创建组织')
    const parsed = createOrganizationSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await createOrganization({ ...parsed.data, meta: commandMeta(req) }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async suspend(req: Request, res: Response) {
    if (req.user?.platformRole !== 'SYSTEM_ADMIN') return forbidden(res, '仅平台管理员可暂停组织')
    try {
      return success(res, await suspendOrganization({ organizationId: req.params.organizationId, meta: commandMeta(req) }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async resume(req: Request, res: Response) {
    if (req.user?.platformRole !== 'SYSTEM_ADMIN') return forbidden(res, '仅平台管理员可恢复组织')
    try {
      return success(res, await resumeOrganization({ organizationId: req.params.organizationId, meta: commandMeta(req) }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async listMemberships(req: Request, res: Response) {
    try {
      const { page, pageSize, offset } = parsePage(req)
      const organizationId = req.params.organizationId
      const [rows, totals] = await Promise.all([
        prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            "id",
            "user_id" AS "userId",
            "org_role" AS "orgRole",
            "valid_from" AS "validFrom",
            "valid_until" AS "validUntil",
            "ended_by_user_id" AS "endedByUserId",
            "end_reason" AS "endReason"
          FROM "organization_memberships"
          WHERE "organization_id" = ${organizationId}
          ORDER BY "valid_from" DESC, "id" DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS "count"
          FROM "organization_memberships"
          WHERE "organization_id" = ${organizationId}
        `,
      ])
      return success(res, { list: rows, total: totals[0]?.count ?? 0, page, pageSize })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async createMembership(req: Request, res: Response) {
    const parsed = membershipSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await createMembership({
        organizationId: req.params.organizationId,
        ...parsed.data,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async endMembership(req: Request, res: Response) {
    const parsed = endSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await endMembership({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        reason: parsed.data.reason,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async setMembershipRole(req: Request, res: Response) {
    const parsed = roleSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await setMembershipRole({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        orgRole: parsed.data.orgRole,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async grantPersona(req: Request, res: Response) {
    const parsed = personaSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await grantPersona({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        persona: parsed.data.persona,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async revokePersona(req: Request, res: Response) {
    const parsed = personaSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await revokePersona({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        persona: parsed.data.persona,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async grantCapability(req: Request, res: Response) {
    const parsed = capabilitySchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await grantCapability({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        capability: parsed.data.capability,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async revokeCapability(req: Request, res: Response) {
    const parsed = capabilitySchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await revokeCapability({
        organizationId: req.params.organizationId,
        membershipId: req.params.membershipId,
        capability: parsed.data.capability,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async deny(req: Request, res: Response) {
    const parsed = denySchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await denyOrganizationAccess({
        organizationId: req.params.organizationId,
        ...parsed.data,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async liftDeny(req: Request, res: Response) {
    const parsed = liftDenySchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await liftOrganizationAccessDeny({
        organizationId: req.params.organizationId,
        ...parsed.data,
        meta: commandMeta(req),
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },
}
