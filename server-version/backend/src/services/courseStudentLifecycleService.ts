import { PlatformRole, UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import {
  AccountAuthorityError,
  assertAccountUsabilityMutationSafe,
  assertNonPlatformAuthorityTargetCanBecomeUnusable,
} from './accountAuthorityService'

export class CourseStudentLifecycleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'CourseStudentLifecycleError'
  }
}

type CourseRow = { id: string; creatorId: string }
type FrozenStateRow = { id: string; isFrozen: boolean; platformRole: PlatformRole }

/**
 * A Course membership grants roster access, never control of the participant's
 * global User account. Only the platform admin route may invoke a freeze, and
 * the existing Organization usable-admin invariant still protects the target.
 * Course is not mapped to Organization.
 */
export async function setCourseStudentFrozenState(input: {
  actorUserId: string
  actorRole: UserRole
  courseId: string
  studentId: string
  isFrozen: boolean
}): Promise<{ id: string; isFrozen: boolean }> {
  // A course membership does not confer authority over the user's global account.
  // Route guards alone are not sufficient for services invoked from elsewhere.
  if (input.actorRole !== UserRole.ADMIN) {
    throw new CourseStudentLifecycleError('COURSE_ACCOUNT_ADMIN_REQUIRED', '账号冻结由平台管理员处理', 403)
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const courses = await tx.$queryRaw<CourseRow[]>`
        SELECT "id", "creator_id" AS "creatorId"
        FROM "courses"
        WHERE "id" = ${input.courseId}
        FOR UPDATE
      `
      const course = courses[0]
      if (!course) {
        throw new CourseStudentLifecycleError('COURSE_NOT_FOUND', '课程不存在', 404)
      }
      if (input.actorRole !== UserRole.ADMIN && course.creatorId !== input.actorUserId) {
        throw new CourseStudentLifecycleError('COURSE_ROSTER_FORBIDDEN', '无权限管理此课程的学生', 403)
      }

      const enrollment = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "course_students"
        WHERE "course_id" = ${input.courseId}
          AND "student_id" = ${input.studentId}
        LIMIT 1
      `
      if (!enrollment[0]) {
        throw new CourseStudentLifecycleError('COURSE_STUDENT_NOT_FOUND', '该学生未加入此课程', 400)
      }

      const users = await tx.$queryRaw<FrozenStateRow[]>`
        SELECT
          "id",
          "is_frozen" AS "isFrozen",
          "platform_role"::text AS "platformRole"
        FROM "users"
        WHERE "id" = ${input.studentId}
        FOR UPDATE
      `
      const user = users[0]
      if (!user) {
        throw new CourseStudentLifecycleError('USER_NOT_FOUND', '用户不存在', 404)
      }

      if (input.isFrozen) {
        assertNonPlatformAuthorityTargetCanBecomeUnusable(user.platformRole)
      }
      if (user.isFrozen === input.isFrozen) {
        return { id: user.id, isFrozen: user.isFrozen }
      }

      if (input.isFrozen) {
        await assertAccountUsabilityMutationSafe(tx, input.studentId)
      }

      const rows = await tx.$queryRaw<Array<{ id: string; isFrozen: boolean }>>`
        UPDATE "users"
        SET "is_frozen" = ${input.isFrozen},
            "token_version" = "token_version" + 1,
            "updated_at" = transaction_timestamp()
        WHERE "id" = ${input.studentId}
        RETURNING "id", "is_frozen" AS "isFrozen"
      `
      return rows[0]
    })
  } catch (err) {
    if (err instanceof AccountAuthorityError) {
      throw new CourseStudentLifecycleError(err.code, err.message, err.statusCode)
    }
    throw err
  }
}
