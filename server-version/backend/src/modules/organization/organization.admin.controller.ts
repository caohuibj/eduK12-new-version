import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { error, notFound, success } from '../../utils/response'
import {
  createOrganizationUnit,
  deleteOrganizationUnit,
  listOrganizationUnits,
} from './structure'
import {
  assignStaffToClass,
  assignStudentToClass,
  endStaffClassAssignment,
  endStudentClassAssignment,
} from './classRelationships'
import { OrganizationDomainError } from './types'

const unitSchema = z.object({
  unitKind: z.enum(['GRADE', 'CLASS']),
  name: z.string().trim().min(1).max(200),
  parentUnitId: z.string().min(1).nullable().optional(),
})
const studentAssignmentSchema = z.object({
  membershipId: z.string().min(1),
  classUnitId: z.string().min(1),
  isPrimary: z.boolean().optional(),
})
const staffAssignmentSchema = z.object({
  membershipId: z.string().min(1),
  classUnitId: z.string().min(1),
  staffRole: z.enum(['HOMEROOM', 'TEACHING']),
})

function sendDomainError(res: Response, err: unknown) {
  if (err instanceof OrganizationDomainError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, data: null })
  }
  return error(res, '组织结构操作失败', -1, 500)
}

function parsePage(req: Request) {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '50'), 10) || 50))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function currentOnly(req: Request) {
  return String(req.query.currentOnly ?? 'false').toLowerCase() === 'true'
}

export const organizationAdminController = {
  async listUnits(req: Request, res: Response) {
    try {
      return success(res, { list: await listOrganizationUnits(req.params.organizationId) })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async createUnit(req: Request, res: Response) {
    const parsed = unitSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await createOrganizationUnit({
        organizationId: req.params.organizationId,
        ...parsed.data,
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async deleteUnit(req: Request, res: Response) {
    try {
      await deleteOrganizationUnit({
        organizationId: req.params.organizationId,
        unitId: req.params.unitId,
      })
      return success(res, null)
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async membershipAccessHistory(req: Request, res: Response) {
    try {
      const organizationId = req.params.organizationId
      const membershipId = req.params.membershipId
      const memberships = await prisma.$queryRaw<Array<{
        id: string
        userId: string
        orgRole: string
        validFrom: Date
        validUntil: Date | null
      }>>`
        SELECT "id", "user_id" AS "userId", "org_role" AS "orgRole",
               "valid_from" AS "validFrom", "valid_until" AS "validUntil"
        FROM "organization_memberships"
        WHERE "organization_id" = ${organizationId}
          AND "id" = ${membershipId}
        LIMIT 1
      `
      const membership = memberships[0]
      if (!membership) return notFound(res, '成员关系不存在')

      const [personas, capabilities] = await Promise.all([
        prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT "id", "persona", "granted_by_user_id" AS "grantedByUserId",
                 "granted_at" AS "grantedAt", "revoked_by_user_id" AS "revokedByUserId",
                 "revoked_at" AS "revokedAt"
          FROM "organization_persona_grants"
          WHERE "organization_id" = ${organizationId}
            AND "membership_id" = ${membershipId}
          ORDER BY "granted_at" DESC, "id" DESC
        `,
        prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT "id", "capability", "granted_by_user_id" AS "grantedByUserId",
                 "granted_at" AS "grantedAt", "revoked_by_user_id" AS "revokedByUserId",
                 "revoked_at" AS "revokedAt"
          FROM "organization_capability_grants"
          WHERE "organization_id" = ${organizationId}
            AND "membership_id" = ${membershipId}
          ORDER BY "granted_at" DESC, "id" DESC
        `,
      ])

      return success(res, { membership, personas, capabilities })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async listStudentClassAssignments(req: Request, res: Response) {
    try {
      const organizationId = req.params.organizationId
      const { page, pageSize, offset } = parsePage(req)
      const onlyCurrent = currentOnly(req)
      const [rows, totals] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT "id", "membership_id" AS "membershipId", "class_unit_id" AS "classUnitId",
                  "is_primary" AS "isPrimary", "valid_from" AS "validFrom", "valid_until" AS "validUntil"
           FROM "organization_student_class_assignments"
           WHERE "organization_id" = $1 ${onlyCurrent ? 'AND "valid_until" IS NULL' : ''}
           ORDER BY "valid_from" DESC, "id" DESC LIMIT $2 OFFSET $3`,
          organizationId, pageSize, offset,
        ),
        prisma.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS "count" FROM "organization_student_class_assignments"
           WHERE "organization_id" = $1 ${onlyCurrent ? 'AND "valid_until" IS NULL' : ''}`,
          organizationId,
        ),
      ])
      return success(res, { list: rows, total: totals[0]?.count ?? 0, page, pageSize, currentOnly: onlyCurrent })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async assignStudent(req: Request, res: Response) {
    const parsed = studentAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await assignStudentToClass({
        organizationId: req.params.organizationId,
        ...parsed.data,
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async endStudentAssignment(req: Request, res: Response) {
    try {
      return success(res, await endStudentClassAssignment({
        organizationId: req.params.organizationId,
        assignmentId: req.params.assignmentId,
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async listStaffClassAssignments(req: Request, res: Response) {
    try {
      const organizationId = req.params.organizationId
      const { page, pageSize, offset } = parsePage(req)
      const onlyCurrent = currentOnly(req)
      const [rows, totals] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT "id", "membership_id" AS "membershipId", "class_unit_id" AS "classUnitId",
                  "staff_role" AS "staffRole", "valid_from" AS "validFrom", "valid_until" AS "validUntil"
           FROM "organization_staff_class_assignments"
           WHERE "organization_id" = $1 ${onlyCurrent ? 'AND "valid_until" IS NULL' : ''}
           ORDER BY "valid_from" DESC, "id" DESC LIMIT $2 OFFSET $3`,
          organizationId, pageSize, offset,
        ),
        prisma.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS "count" FROM "organization_staff_class_assignments"
           WHERE "organization_id" = $1 ${onlyCurrent ? 'AND "valid_until" IS NULL' : ''}`,
          organizationId,
        ),
      ])
      return success(res, { list: rows, total: totals[0]?.count ?? 0, page, pageSize, currentOnly: onlyCurrent })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async assignStaff(req: Request, res: Response) {
    const parsed = staffAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    try {
      return success(res, await assignStaffToClass({
        organizationId: req.params.organizationId,
        ...parsed.data,
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async endStaffAssignment(req: Request, res: Response) {
    try {
      return success(res, await endStaffClassAssignment({
        organizationId: req.params.organizationId,
        assignmentId: req.params.assignmentId,
      }))
    } catch (err) {
      return sendDomainError(res, err)
    }
  },
}
