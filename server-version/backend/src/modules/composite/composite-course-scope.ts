import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { compositeForbidden } from './composite.errors'

/** Course membership is not measurement authority. Callers must also retain
 * their existing Composite ownership/disclosure checks. Never infer a delivery
 * from a participant's current enrollment or from the template alone. */
export async function assertCompositeCourseScope(userId: string, role: UserRole, assessmentId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, creatorId: true, courseType: true, isLibrary: true } })
  if (!course || course.courseType !== 'TRAINING_COURSE' || course.isLibrary
    || (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || course.creatorId !== userId))) throw compositeForbidden('无权读取本课程测评数据')
  const assessment = await prisma.compositeAssessment.findFirst({ where: { id: assessmentId,
    OR: [ { productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', questionnaireCourses: { some: { courseId } } },
      { productKind: { in: ['LEGACY_COMPOSITE', 'ASSESSMENT_BUNDLE'] }, courseId } ],
  }, select: { id: true } })
  if (!assessment) throw compositeForbidden('测评未绑定当前课程')
  return { id: course.id, title: course.title }
}
