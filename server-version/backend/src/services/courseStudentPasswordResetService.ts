import { randomUUID } from 'node:crypto'
import { Prisma, UserRole, PlatformRole } from '@prisma/client'
import { prisma } from '../config/database'
import {
  AccountAuthorityError,
  assertAccountUsabilityMutationSafe,
} from './accountAuthorityService'
import { appendAudit } from '../modules/organization/service'

type Tx = Prisma.TransactionClient
type TargetRow = {
  id: string
  username: string
  role: UserRole
  platformRole: PlatformRole
  accountDomain: string
  isActive: boolean
  isFrozen: boolean
  expiresAt: Date | null
}

export class CoursePasswordResetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'CoursePasswordResetError'
  }
}

const denied = (message = '只能为本人课程中已报名的学员重置密码') =>
  new CoursePasswordResetError('COURSE_PASSWORD_RESET_FORBIDDEN', message, 403)

/**
 * Lightweight admission before generating or hashing a new secret.
 * The write transaction rechecks every fact with row locks. Never treat
 * this early probe (or the Host header) as the authorization decision.
 */
export async function assertTeacherCourseResetPreflight(input: {
  actorUserId: string
  courseId: string
  studentId: string
}): Promise<void> {
  const course = await prisma.course.findFirst({
    where: {
      id: input.courseId,
      creatorId: input.actorUserId,
      courseType: { not: 'CAMPUS_ACTIVITY' },
      isLibrary: false,
      students: {
        some: {
          studentId: input.studentId,
          status: { in: ['ACTIVE', 'APPROVED'] },
          student: {
            role: UserRole.STUDENT,
            accountDomain: { not: 'SCHOOL' },
            platformRole: PlatformRole.STANDARD,
            isActive: true,
            isFrozen: false,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
    },
    select: { id: true },
  })
  if (!course) throw denied()
}

/**
 * Teacher-initiated credential reset is deliberately narrower than platform
 * administration. It changes the global password only for an actively
 * enrolled STUDENT of a course currently owned by this TEACHER.
 *
 * No secret, hash, temporary password or bearer token enters the audit.
 * The controller generates a random password, returns it only once to the
 * authenticated teacher over no-store TLS, and never writes a handoff file.
 */
export async function resetEnrolledStudentPassword(input: {
  actorUserId: string
  courseId: string
  studentId: string
  passwordHash: string
}): Promise<{ studentId: string; username: string }> {
  if (!input.actorUserId || !input.courseId || !input.studentId || !input.passwordHash) {
    throw denied('密码重置参数不完整')
  }
  try {
    return await prisma.$transaction(async (tx: Tx) => {
      // Re-check actual current DB role and account usability; JWT fields are
      // not trusted as lasting authorities. SHARE serializes role changes.
      const actors = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "users"
        WHERE "id" = ${input.actorUserId}
          AND "role" = 'TEACHER'
          AND "account_domain" <> 'SCHOOL'
          AND "teacher_approved" = TRUE
          AND "is_active" = TRUE
          AND "is_frozen" = FALSE
          AND "must_change_password" = FALSE
          AND ("expires_at" IS NULL OR "expires_at" > statement_timestamp())
        FOR SHARE
      `
      if (!actors[0]) throw denied('当前账号不具备培训师权限')

      const courses = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "courses"
        WHERE "id" = ${input.courseId}
          AND "creator_id" = ${input.actorUserId}
          AND "course_type" <> 'CAMPUS_ACTIVITY'
          AND "is_library" = FALSE
        FOR UPDATE
      `
      if (!courses[0]) throw denied()

      const enrollments = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "course_students"
        WHERE "course_id" = ${input.courseId}
          AND "student_id" = ${input.studentId}
          AND "status"::text IN ('ACTIVE', 'APPROVED')
        FOR UPDATE
      `
      if (!enrollments[0]) throw denied()

      const targets = await tx.$queryRaw<TargetRow[]>`
        SELECT "id", "username", "role",
               "account_domain" AS "accountDomain",
               "platform_role"::text AS "platformRole",
               "is_active" AS "isActive",
               "is_frozen" AS "isFrozen",
               "expires_at" AS "expiresAt"
        FROM "users"
        WHERE "id" = ${input.studentId}
        FOR UPDATE
      `
      const target = targets[0]
      if (
        !target
        || target.role !== UserRole.STUDENT
        || target.accountDomain === 'SCHOOL'
        || target.platformRole !== PlatformRole.STANDARD
        || !target.isActive
        || target.isFrozen
        || (target.expiresAt && target.expiresAt.getTime() <= Date.now())
      ) throw denied('只可重置当前有效的普通学员账号')

      // A STUDENT may also hold sensitive Organization governance rights.
      // Course ownership must not become an account-takeover path for any
      // current ORG_ADMIN, even when another administrator remains usable.
      const privilegedMembership = await tx.$queryRaw<Array<{ protected: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM "organization_memberships"
          WHERE "user_id" = ${target.id}
            AND "org_role" = 'ORG_ADMIN'
            AND "valid_from" <= statement_timestamp()
            AND "valid_until" IS NULL
        ) AS "protected"
      `
      if (privilegedMembership[0]?.protected) {
        throw denied('该学员具有组织管理权限，请由平台管理员处理密码重置')
      }

      // Preserve every Organization's last usable admin, even when that
      // admin also has a legacy STUDENT role in a course.
      await assertAccountUsabilityMutationSafe(tx, target.id)
      await tx.user.update({
        where: { id: target.id },
        data: {
          passwordHash: input.passwordHash,
          tokenVersion: { increment: 1 },
          mustChangePassword: true,
        },
      })

      // Commit credential mutation and durable audit atomically, not via logs.
      await appendAudit(tx, {
        organizationId: null,
        actorUserId: input.actorUserId,
        action: 'COURSE_STUDENT_PASSWORD_RESET',
        targetType: 'USER',
        targetId: target.id,
        domainEventId: randomUUID(),
        payload: { courseId: input.courseId, delivery: 'ONE_TIME_TEACHER_VIEW' },
      })
      return { studentId: target.id, username: target.username }
    })
  } catch (cause) {
    if (cause instanceof AccountAuthorityError) {
      throw new CoursePasswordResetError(cause.code, cause.message, cause.statusCode)
    }
    throw cause
  }
}
