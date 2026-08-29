import { CourseStatus } from '@prisma/client'

/**
 * One source of truth for whether a course can accept a new student.
 * Every public/ authenticated enrollment path must call this predicate both
 * before doing work and again inside its write transaction.
 */
export const isCourseJoinable = (course: {
  status: CourseStatus | string
  endedAt: Date | null
  isRecruiting: boolean
  isLibrary: boolean
}): boolean => (
  course.status === CourseStatus.PUBLISHED
  && course.endedAt === null
  && course.isRecruiting === true
  && course.isLibrary === false
)

export const courseJoinabilityMessage = (course: {
  status: CourseStatus | string
  endedAt: Date | null
  isRecruiting: boolean
  isLibrary: boolean
}): string => {
  if (course.isLibrary) return '库课程不能加入'
  if (course.endedAt || course.status === CourseStatus.COMPLETED) return '课程已结束，无法加入'
  if (course.status !== CourseStatus.PUBLISHED) return '课程未发布，无法加入'
  if (!course.isRecruiting) return '该课程已停止招募，无法加入'
  return '课程当前无法加入'
}

export class CourseNotJoinableError extends Error {
  constructor(message = '课程当前无法加入') {
    super(message)
    this.name = 'CourseNotJoinableError'
  }
}
