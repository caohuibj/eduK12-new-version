import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { OrganizationDomainError, OrganizationPersona } from './types'

export type StaffClassRole = 'HOMEROOM' | 'TEACHING'
type Tx = Prisma.TransactionClient

export interface StudentClassAssignmentRecord {
  id: string
  organizationId: string
  membershipId: string
  classUnitId: string
  isPrimary: boolean
  validFrom: Date
  validUntil: Date | null
}

export interface StaffClassAssignmentRecord {
  id: string
  organizationId: string
  membershipId: string
  classUnitId: string
  staffRole: StaffClassRole
  validFrom: Date
  validUntil: Date | null
}

export async function assertCurrentMembershipPersona(
  tx: Tx,
  input: { organizationId: string; membershipId: string; persona: OrganizationPersona },
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ orgStatus: string; membershipCurrent: boolean; personaCurrent: boolean }>>`
    SELECT
      o."status" AS "orgStatus",
      (m."valid_until" IS NULL) AS "membershipCurrent",
      EXISTS (
        SELECT 1 FROM "organization_persona_grants" pg
        WHERE pg."organization_id" = m."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = ${input.persona}
          AND pg."revoked_at" IS NULL
      ) AS "personaCurrent"
    FROM "organizations" o
    JOIN "organization_memberships" m
      ON m."organization_id" = o."id"
    WHERE o."id" = ${input.organizationId}
      AND m."id" = ${input.membershipId}
    FOR SHARE OF o, m
  `
  const row = rows[0]
  if (!row) throw new OrganizationDomainError('MEMBERSHIP_NOT_FOUND', '成员关系不存在', 404)
  if (row.orgStatus !== 'ACTIVE') {
    throw new OrganizationDomainError('ORGANIZATION_SUSPENDED', '组织已暂停', 409)
  }
  if (!row.membershipCurrent) {
    throw new OrganizationDomainError('MEMBERSHIP_NOT_CURRENT', '成员关系已结束', 409)
  }
  if (!row.personaCurrent) {
    throw new OrganizationDomainError('PERSONA_REQUIRED', `需要当前 ${input.persona} Persona`, 409)
  }
}

async function assertClassUnit(tx: Tx, organizationId: string, classUnitId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ unitKind: string }>>`
    SELECT "unit_kind" AS "unitKind"
    FROM "organization_units"
    WHERE "organization_id" = ${organizationId}
      AND "id" = ${classUnitId}
    FOR SHARE
  `
  if (!rows[0]) throw new OrganizationDomainError('CLASS_NOT_FOUND', '班级不存在', 404)
  if (rows[0].unitKind !== 'CLASS') {
    throw new OrganizationDomainError('CLASS_REQUIRED', '关系目标必须是班级', 409)
  }
}

function mapConstraintError(err: any, primaryCode: string): never {
  const code = err?.meta?.code ?? err?.code
  const message = String(err?.meta?.message ?? err?.message ?? '')
  if (code === '23505' || (err?.code === 'P2010' && message.includes('unique'))) {
    throw new OrganizationDomainError(primaryCode, '当前结构关系已存在或违反唯一性约束', 409)
  }
  throw err
}

export async function assignStudentToClass(input: {
  organizationId: string
  membershipId: string
  classUnitId: string
  isPrimary?: boolean
}): Promise<StudentClassAssignmentRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCurrentMembershipPersona(tx, {
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        persona: 'STUDENT',
      })
      await assertClassUnit(tx, input.organizationId, input.classUnitId)
      const id = randomUUID()
      const rows = await tx.$queryRaw<StudentClassAssignmentRecord[]>`
        INSERT INTO "organization_student_class_assignments" (
          "id", "organization_id", "membership_id", "class_unit_id", "is_primary"
        ) VALUES (
          ${id}, ${input.organizationId}, ${input.membershipId}, ${input.classUnitId}, ${input.isPrimary ?? true}
        )
        RETURNING "id", "organization_id" AS "organizationId", "membership_id" AS "membershipId",
          "class_unit_id" AS "classUnitId", "is_primary" AS "isPrimary",
          "valid_from" AS "validFrom", "valid_until" AS "validUntil"
      `
      return rows[0]
    })
  } catch (err: any) {
    return mapConstraintError(err, (input.isPrimary ?? true) ? 'PRIMARY_CLASS_CONFLICT' : 'CLASS_MEMBERSHIP_CONFLICT')
  }
}

export async function endStudentClassAssignment(input: {
  organizationId: string
  assignmentId: string
}): Promise<StudentClassAssignmentRecord> {
  const rows = await prisma.$queryRaw<StudentClassAssignmentRecord[]>`
    UPDATE "organization_student_class_assignments"
    SET "valid_until" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId}
      AND "id" = ${input.assignmentId}
      AND "valid_until" IS NULL
    RETURNING "id", "organization_id" AS "organizationId", "membership_id" AS "membershipId",
      "class_unit_id" AS "classUnitId", "is_primary" AS "isPrimary",
      "valid_from" AS "validFrom", "valid_until" AS "validUntil"
  `
  if (!rows[0]) throw new OrganizationDomainError('CLASS_ASSIGNMENT_NOT_CURRENT', '当前班级关系不存在', 404)
  return rows[0]
}

export async function assignStaffToClass(input: {
  organizationId: string
  membershipId: string
  classUnitId: string
  staffRole: StaffClassRole
}): Promise<StaffClassAssignmentRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCurrentMembershipPersona(tx, {
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        persona: 'TEACHER',
      })
      await assertClassUnit(tx, input.organizationId, input.classUnitId)
      const id = randomUUID()
      const rows = await tx.$queryRaw<StaffClassAssignmentRecord[]>`
        INSERT INTO "organization_staff_class_assignments" (
          "id", "organization_id", "membership_id", "class_unit_id", "staff_role"
        ) VALUES (
          ${id}, ${input.organizationId}, ${input.membershipId}, ${input.classUnitId}, ${input.staffRole}
        )
        RETURNING "id", "organization_id" AS "organizationId", "membership_id" AS "membershipId",
          "class_unit_id" AS "classUnitId", "staff_role" AS "staffRole",
          "valid_from" AS "validFrom", "valid_until" AS "validUntil"
      `
      return rows[0]
    })
  } catch (err: any) {
    return mapConstraintError(err, 'STAFF_CLASS_CONFLICT')
  }
}

export async function endStaffClassAssignment(input: {
  organizationId: string
  assignmentId: string
}): Promise<StaffClassAssignmentRecord> {
  const rows = await prisma.$queryRaw<StaffClassAssignmentRecord[]>`
    UPDATE "organization_staff_class_assignments"
    SET "valid_until" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId}
      AND "id" = ${input.assignmentId}
      AND "valid_until" IS NULL
    RETURNING "id", "organization_id" AS "organizationId", "membership_id" AS "membershipId",
      "class_unit_id" AS "classUnitId", "staff_role" AS "staffRole",
      "valid_from" AS "validFrom", "valid_until" AS "validUntil"
  `
  if (!rows[0]) throw new OrganizationDomainError('STAFF_ASSIGNMENT_NOT_CURRENT', '当前教师班级关系不存在', 404)
  return rows[0]
}

export interface AssessmentDeliveryGrantRecord {
  id: string
  organizationId: string
  teacherMembershipId: string
  classUnitId: string
  permission: 'CLASS_ASSESSMENT_DELIVERY'
  grantedByUserId: string
  grantedAt: Date
  revokedByUserId: string | null
  revokedAt: Date | null
}

export async function grantTeachingAssessmentDelivery(input: {
  organizationId: string
  teacherMembershipId: string
  classUnitId: string
  grantedByUserId: string
}): Promise<AssessmentDeliveryGrantRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCurrentMembershipPersona(tx, {
        organizationId: input.organizationId,
        membershipId: input.teacherMembershipId,
        persona: 'TEACHER',
      })
      await assertClassUnit(tx, input.organizationId, input.classUnitId)
      const teaching = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "organization_staff_class_assignments"
        WHERE "organization_id" = ${input.organizationId}
          AND "membership_id" = ${input.teacherMembershipId}
          AND "class_unit_id" = ${input.classUnitId}
          AND "staff_role" = 'TEACHING'
          AND "valid_until" IS NULL
        LIMIT 1 FOR SHARE
      `
      if (!teaching[0]) throw new OrganizationDomainError(
        'TEACHING_ASSIGNMENT_REQUIRED',
        '只有当前任课教师关系可以由管理员额外开放测评投放权限',
        409,
      )
      const id = randomUUID()
      const rows = await tx.$queryRaw<AssessmentDeliveryGrantRecord[]>`
        INSERT INTO "organization_assessment_delivery_grants" (
          "id","organization_id","teacher_membership_id","class_unit_id","permission","granted_by_user_id"
        ) VALUES (
          ${id},${input.organizationId},${input.teacherMembershipId},${input.classUnitId},
          'CLASS_ASSESSMENT_DELIVERY',${input.grantedByUserId}
        )
        RETURNING "id","organization_id" AS "organizationId",
          "teacher_membership_id" AS "teacherMembershipId","class_unit_id" AS "classUnitId","permission",
          "granted_by_user_id" AS "grantedByUserId","granted_at" AS "grantedAt",
          "revoked_by_user_id" AS "revokedByUserId","revoked_at" AS "revokedAt"
      `
      return rows[0]
    })
  } catch (err: any) {
    return mapConstraintError(err, 'ASSESSMENT_DELIVERY_GRANT_CONFLICT')
  }
}

export async function revokeTeachingAssessmentDelivery(input: {
  organizationId: string
  grantId: string
  revokedByUserId: string
}): Promise<AssessmentDeliveryGrantRecord> {
  const rows = await prisma.$queryRaw<AssessmentDeliveryGrantRecord[]>`
    UPDATE "organization_assessment_delivery_grants"
    SET "revoked_by_user_id" = ${input.revokedByUserId}, "revoked_at" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.grantId} AND "revoked_at" IS NULL
    RETURNING "id","organization_id" AS "organizationId",
      "teacher_membership_id" AS "teacherMembershipId","class_unit_id" AS "classUnitId","permission",
      "granted_by_user_id" AS "grantedByUserId","granted_at" AS "grantedAt",
      "revoked_by_user_id" AS "revokedByUserId","revoked_at" AS "revokedAt"
  `
  if (!rows[0]) throw new OrganizationDomainError(
    'ASSESSMENT_DELIVERY_GRANT_NOT_CURRENT',
    '当前测评投放授权不存在',
    404,
  )
  return rows[0]
}

/** Current authority always re-checks current Membership + Persona; history alone is never a grant. */
export async function hasCurrentStudentClassAuthority(input: {
  organizationId: string
  membershipId: string
  classUnitId: string
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "organization_student_class_assignments" a
      JOIN "organization_memberships" m
        ON m."organization_id" = a."organization_id" AND m."id" = a."membership_id"
      JOIN "organizations" o ON o."id" = a."organization_id"
      WHERE a."organization_id" = ${input.organizationId}
        AND a."membership_id" = ${input.membershipId}
        AND a."class_unit_id" = ${input.classUnitId}
        AND a."valid_until" IS NULL
        AND m."valid_until" IS NULL
        AND o."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "organization_persona_grants" pg
          WHERE pg."organization_id" = a."organization_id"
            AND pg."membership_id" = a."membership_id"
            AND pg."persona" = 'STUDENT'
            AND pg."revoked_at" IS NULL
        )
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}
