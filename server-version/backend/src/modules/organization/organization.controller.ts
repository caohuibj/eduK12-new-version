import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, success } from '../../utils/response'
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

const createOrganizationSchema = z.object({ name: z.string().trim().min(1).max(200) })
const membershipSchema = z.object({
  userId: z.string().min(1),
  orgRole: z.enum(['MEMBER', 'ORG_ADMIN']).optional(),
})
const roleSchema = z.object({ orgRole: z.enum(['MEMBER', 'ORG_ADMIN']) })
const endSchema = z.object({ reason: z.string().trim().max(500).optional() })
const personaSchema = z.object({ persona: z.enum(['TEACHER', 'STUDENT', 'COUNSELOR', 'CLIENT']) })
const capabilitySchema = z.object({
  capability: z.enum(['PSYCHOLOGY_STAFF', 'REPORT_EXPORT', 'REPORT_MEMBER_EXPORT']),
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
  async create(req: Request, res: Response) {
    const parsed = createOrganizationSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await createOrganization({ name: parsed.data.name, meta: commandMeta(req) }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async suspend(req: Request, res: Response) {
    try {
      return success(res, await suspendOrganization({ organizationId: req.params.organizationId, meta: commandMeta(req) }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async resume(req: Request, res: Response) {
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
