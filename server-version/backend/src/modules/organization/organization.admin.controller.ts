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
  grantTeachingAssessmentDelivery,
  revokeTeachingAssessmentDelivery,
} from './classRelationships'
import { OrganizationDomainError } from './types'
import { createClassificationDimension, createOrganizationLabel, assignOrganizationLabel, endOrganizationLabelAssignment, createCounselorClientRelationship, endCounselorClientRelationship } from './classificationRelations'

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
const deliveryGrantSchema = z.object({
  validFrom: z.string().datetime().transform(v => new Date(v)).optional(),
  validUntil: z.string().datetime().transform(v => new Date(v)).nullable().optional(),
  teacherMembershipId: z.string().min(1),
  classUnitId: z.string().min(1),
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
  async readDeliveryPolicy(req: Request, res: Response) {
    try {
      const rows = await prisma.$queryRaw<Array<{ homeroomDeliveryEnabled: boolean }>>`
        SELECT "homeroom_delivery_enabled" AS "homeroomDeliveryEnabled" FROM "organizations" WHERE "id" = ${req.params.organizationId}
      `
      return success(res, rows[0])
    } catch (err) { return sendDomainError(res, err) }
  },
  async updateDeliveryPolicy(req: Request, res: Response) {
    const parsed = z.object({ homeroomDeliveryEnabled: z.boolean() }).strict().safeParse(req.body)
    if (!parsed.success) return error(res, 'Invalid delivery policy', -1, 400)
    try {
      await prisma.$executeRaw`UPDATE "organizations" SET "homeroom_delivery_enabled" = ${parsed.data.homeroomDeliveryEnabled}, "updated_at" = statement_timestamp() WHERE "id" = ${req.params.organizationId}`
      return success(res, parsed.data)
    } catch (err) { return sendDomainError(res, err) }
  },
  async listClassification(req: Request, res: Response) {
    try {
      const id = req.params.organizationId
      const [dimensions, labels, assignments, relationships] = await Promise.all([
        prisma.$queryRaw`SELECT "id", "key", "name", "cardinality" FROM "organization_classification_dimensions" WHERE "organization_id" = ${id} ORDER BY "name", "id"`,
        prisma.$queryRaw`SELECT "id", "dimension_id" AS "dimensionId", "name" FROM "organization_labels" WHERE "organization_id" = ${id} ORDER BY "name", "id"`,
        prisma.$queryRaw`SELECT "id", "membership_id" AS "membershipId", "label_id" AS "labelId", "valid_from" AS "validFrom", "valid_until" AS "validUntil" FROM "organization_label_assignments" WHERE "organization_id" = ${id} ORDER BY "valid_from" DESC, "id" DESC LIMIT 100`,
        prisma.$queryRaw`SELECT "id", "counselor_membership_id" AS "counselorMembershipId", "client_membership_id" AS "clientMembershipId", "valid_from" AS "validFrom", "valid_until" AS "validUntil" FROM "organization_counselor_client_relationships" WHERE "organization_id" = ${id} ORDER BY "valid_from" DESC, "id" DESC LIMIT 100`,
      ])
      return success(res, { dimensions, labels, assignments, relationships, historyLimit: 100 })
    } catch (err) { return sendDomainError(res, err) }
  },

  async classificationCommand(req: Request, res: Response) {
    const schema = z.discriminatedUnion('operation', [
      z.object({ operation: z.literal('CREATE_DIMENSION'), key: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200), cardinality: z.enum(['SINGLE', 'MULTI']) }),
      z.object({ operation: z.literal('CREATE_LABEL'), dimensionId: z.string().min(1), name: z.string().trim().min(1).max(200) }),
      z.object({ operation: z.literal('ASSIGN_LABEL'), membershipId: z.string().min(1), labelId: z.string().min(1) }),
      z.object({ operation: z.literal('END_LABEL'), assignmentId: z.string().min(1) }),
      z.object({ operation: z.literal('CREATE_RELATIONSHIP'), counselorMembershipId: z.string().min(1), clientMembershipId: z.string().min(1) }),
      z.object({ operation: z.literal('END_RELATIONSHIP'), relationshipId: z.string().min(1) }),
    ])
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message, -1, 400)
    const input = { ...parsed.data, organizationId: req.params.organizationId }
    try {
      switch (input.operation) {
        case 'CREATE_DIMENSION': return success(res, await createClassificationDimension(input))
        case 'CREATE_LABEL': return success(res, await createOrganizationLabel(input))
        case 'ASSIGN_LABEL': return success(res, await assignOrganizationLabel(input))
        case 'END_LABEL': await endOrganizationLabelAssignment(input); break
        case 'CREATE_RELATIONSHIP': return success(res, await createCounselorClientRelationship(input))
        case 'END_RELATIONSHIP': await endCounselorClientRelationship(input); break
      }
      return success(res, { ended: true })
    } catch (err) { return sendDomainError(res, err) }
  },

  async listAudit(req: Request, res: Response) {
    try {
      const { page, pageSize, offset } = parsePage(req)
      const list = await prisma.$queryRaw`
        SELECT "id", "action", "actor_user_id" AS "actorUserId", "target_type" AS "targetType", "target_id" AS "targetId", "created_at" AS "createdAt"
        FROM "organization_governance_audits" WHERE "organization_id" = ${req.params.organizationId}
        ORDER BY "created_at" DESC, "id" DESC LIMIT ${pageSize} OFFSET ${offset}
      `
      return success(res, { list, page, pageSize })
    } catch (err) { return sendDomainError(res, err) }
  },

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

  async listAssessmentDeliveryGrants(req: Request, res: Response) {
    try {
      const organizationId = req.params.organizationId
      // Preserve the old unpaged 200-row response during a rolling release.
      // New clients explicitly page, and total now reflects all matching rows.
      const { page, pageSize, offset } =
        req.query.page === undefined && req.query.pageSize === undefined
          ? { page: 1, pageSize: 200, offset: 0 }
          : parsePage(req)
      const [rows, totals] = await Promise.all([
        prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT "id","teacher_membership_id" AS "teacherMembershipId","class_unit_id" AS "classUnitId","permission",
            "granted_by_user_id" AS "grantedByUserId","granted_at" AS "grantedAt",
            "revoked_by_user_id" AS "revokedByUserId","revoked_at" AS "revokedAt", "valid_from" AS "validFrom", "valid_until" AS "validUntil"
          FROM "organization_assessment_delivery_grants"
          WHERE "organization_id" = ${organizationId}
          ORDER BY "granted_at" DESC,"id" DESC LIMIT ${pageSize} OFFSET ${offset}
        `,
        prisma.$queryRaw<
          Array<{ count: number }>
        >`SELECT COUNT(*)::int AS count FROM "organization_assessment_delivery_grants" WHERE "organization_id" = ${organizationId}`,
      ])
      return success(res, {
        list: rows,
        total: totals[0]?.count ?? 0,
        page,
        pageSize,
      })
    } catch (err) {
      return sendDomainError(res, err)
    }
  },

  async grantAssessmentDelivery(req: Request, res: Response) {
    const parsed = deliveryGrantSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message)
    if (!req.user) return error(res, '未登录', -1, 401)
    try {
      return success(res, await grantTeachingAssessmentDelivery({
        organizationId: req.params.organizationId,
        ...parsed.data,
        grantedByUserId: req.user.userId,
      }))
    } catch (err) { return sendDomainError(res, err) }
  },

  async revokeAssessmentDelivery(req: Request, res: Response) {
    if (!req.user) return error(res, '未登录', -1, 401)
    try {
      return success(res, await revokeTeachingAssessmentDelivery({
        organizationId: req.params.organizationId,
        grantId: req.params.grantId,
        revokedByUserId: req.user.userId,
      }))
    } catch (err) { return sendDomainError(res, err) }
  },
}
