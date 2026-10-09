import { CourseStudentStatus, UserRole } from '@prisma/client'
import { prisma } from '../config/database'

export const ACTIVE_COURSE_STUDENT_STATUSES = [
  CourseStudentStatus.ACTIVE,
  CourseStudentStatus.APPROVED,
] as const

/**
 * A course relationship is the authorization boundary for student-facing
 * course content. Do not infer access from a valid JWT alone.
 */
export async function hasActiveCourseMembership(courseId: string, studentId: string): Promise<boolean> {
  const membership = await prisma.courseStudent.findFirst({
    where: {
      courseId,
      studentId,
      status: { in: [...ACTIVE_COURSE_STUDENT_STATUSES] },
    },
    select: { id: true },
  })

  if (membership) return true
  // Campus participation is NOT a CourseStudent enrollment. Verify SCHOOL,
  // approved class, current membership and currently OPEN activity in one
  // batch SQL predicate; do not trust the client Course ID or a stale JWT.
  const rows=await prisma.$queryRaw<Array<{allowed:boolean}>>`
    SELECT EXISTS(
      SELECT 1 FROM "campus_activity_participants" p
      JOIN "campus_activities" a ON a."course_id"=p."course_id"
        AND a."organization_id"=p."organization_id" AND a."status"='OPEN'
      JOIN "organizations" o ON o."id"=a."organization_id"
        AND o."status"='ACTIVE' AND o."product_domain"='SCHOOL'
      JOIN "organization_memberships" m ON m."id"=p."membership_id"
        AND m."organization_id"=p."organization_id"
        AND m."user_id"=${studentId}
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      JOIN "campus_student_enrollments" e ON e."user_id"=m."user_id"
        AND e."organization_id"=m."organization_id" AND e."status"='APPROVED'
      JOIN "campus_class_admissions" ca ON ca."class_unit_id"=e."class_unit_id"
        AND ca."organization_id"=e."organization_id" AND ca."status"='APPROVED'
      JOIN "organization_student_class_assignments" sc
        ON sc."membership_id"=m."id" AND sc."organization_id"=m."organization_id"
        AND sc."class_unit_id"=e."class_unit_id"
        AND sc."valid_from"<=statement_timestamp()
        AND (sc."valid_until" IS NULL OR sc."valid_until">statement_timestamp())
      JOIN "users" u ON u."id"=m."user_id" AND u."role"='STUDENT'
        AND u."account_domain"='SCHOOL' AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      WHERE p."course_id"=${courseId} AND p."status"='ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM "organization_access_denies" d
          WHERE d."organization_id"=o."id" AND d."user_id"=${studentId}
            AND d."lifted_at" IS NULL AND d."permission" IN ('*','ACTIVITY_READ','RUN_START'))
    ) AS "allowed"
  `
  return rows[0]?.allowed===true
}

export interface CourseOwnerAccess {
  creatorId: string
  shares?: Array<{ sharedTo: string }>
}

export function canAccessCourseContent(
  course: CourseOwnerAccess,
  userId: string | undefined,
  role: UserRole | undefined,
): boolean {
  if (role === UserRole.ADMIN) return true
  if (!userId) return false
  return course.creatorId === userId || Boolean(course.shares?.some((share) => share.sharedTo === userId))
}

/**
 * Student identity and roster management stay with the course owner/admin.
 * A CourseShare grants content access, not access to enrolled student data.
 */
export function canAccessCourseRoster(
  course: CourseOwnerAccess,
  userId: string | undefined,
  role: UserRole | undefined,
): boolean {
  if (role === UserRole.ADMIN) return true
  return Boolean(userId && course.creatorId === userId)
}
