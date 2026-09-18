import { UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import {
  assertAlternativeUsableOrgAdmin,
  lockOrganizationsForCurrentOrgAdmin,
} from '../modules/organization/adminInvariant'

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
type FrozenStateRow = { id: string; isFrozen: boolean }

/**
 * Preserve the legacy Course roster authority while making account freezing
 * participate in the Organization usable-admin invariant. Course is not mapped
 * to Organization; it is only the authorization basis for this legacy action.
 */
export async function setCourseStudentFrozenState(input: {
  actorUserId: string
  actorRole: UserRole
  courseId: string
  studentId: string
  isFrozen: boolean
}): Promise<{ id: string; isFrozen: boolean }> {
  return prisma.$transaction(async (tx) => {
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
      SELECT "id", "is_frozen" AS "isFrozen"
      FROM "users"
      WHERE "id" = ${input.studentId}
      FOR UPDATE
    `
    const user = users[0]
    if (!user) {
      throw new CourseStudentLifecycleError('USER_NOT_FOUND', '用户不存在', 404)
    }
    if (user.isFrozen === input.isFrozen) {
      return user
    }

    if (input.isFrozen) {
      const organizationIds = await lockOrganizationsForCurrentOrgAdmin(tx, input.studentId)
      for (const organizationId of organizationIds) {
        await assertAlternativeUsableOrgAdmin(tx, organizationId, input.studentId)
      }
    }

    const rows = await tx.$queryRaw<FrozenStateRow[]>`
      UPDATE "users"
      SET "is_frozen" = ${input.isFrozen},
          "token_version" = "token_version" + 1,
          "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.studentId}
      RETURNING "id", "is_frozen" AS "isFrozen"
    `
    return rows[0]
  })
}
