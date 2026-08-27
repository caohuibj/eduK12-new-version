import { CourseStudentStatus } from '@prisma/client'
import { prisma } from '../../config/database'

export type StudentScaleAccessRecord = {
  id: string
  status: string
  visibility: string
}

/**
 * Standalone student scale access is intentionally narrower than the
 * composite/questionnaire authorization chains. A scale must be published,
 * and COURSE visibility additionally requires an active course membership.
 */
export const canStudentAccessScale = async (
  scale: StudentScaleAccessRecord,
  studentId: string,
): Promise<boolean> => {
  if (scale.status !== 'PUBLISHED') return false
  if (scale.visibility === 'PUBLIC') return true
  if (scale.visibility !== 'COURSE') return false

  const membership = await prisma.courseStudent.findFirst({
    where: {
      studentId,
      status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
      course: {
        courseScales: {
          some: { scaleId: scale.id },
        },
      },
    },
    select: { id: true },
  })

  return Boolean(membership)
}
