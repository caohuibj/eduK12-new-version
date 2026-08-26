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

  return Boolean(membership)
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
