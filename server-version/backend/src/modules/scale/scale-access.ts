import { CourseStudentStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'

export type StudentScaleAccessRecord = {
  id: string
  status: string
  visibility: string
}

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Standalone student scale access is intentionally narrower than the
 * composite/questionnaire authorization chains. A scale must be published,
 * and COURSE visibility additionally requires an active course membership.
 *
 * New-start callers may pass their transaction client so resource access and
 * deployment/admission freezing share the same Serializable snapshot.
 */
export const canStudentAccessScale = async (
  scale: StudentScaleAccessRecord,
  studentId: string,
  db: Db = prisma,
): Promise<boolean> => {
  if (scale.status !== 'PUBLISHED') return false
  if (scale.visibility === 'PUBLIC') return true
  if (scale.visibility !== 'COURSE') return false

  const membership = await db.courseStudent.findFirst({
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
