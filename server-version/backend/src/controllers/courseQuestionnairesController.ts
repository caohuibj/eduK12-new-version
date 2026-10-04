import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { canAccessCourseContent } from '../utils/courseAccess'
import { forbidden, notFound, success, error } from '../utils/response'

// Course deliveries are metadata only. This endpoint grants no questionnaire
// editing, submission or report access.
export async function courseQuestionnaires(req: Request, res: Response) {
  try {
    const { id: courseId } = req.params
    const actor = req.user!
    if (!['TEACHER', 'ADMIN'].includes(actor.role)) return forbidden(res, '您没有权限访问课程问卷')
    const course = await prisma.course.findUnique({
      where: { id: courseId }, include: { shares: { select: { sharedTo: true } } },
    })
    if (!course) return notFound(res, '课程不存在')
    if (!canAccessCourseContent(course, actor.userId, actor.role)) return forbidden(res, '您没有权限访问该课程')
    const [legacy, products] = await Promise.all([
      prisma.questionnaire.findMany({
        where: { type: 'COURSE', status: 'PUBLISHED', courseQuestionnaires: { some: { courseId } } },
        select: { id: true, code: true, name: true, description: true, estimatedTime: true, creatorId: true,
          _count: { select: { questionnaireScales: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.compositeAssessment.findMany({
        where: { productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED',
          questionnaireCourses: { some: { courseId } } },
        select: { id: true, code: true, name: true, description: true, createdBy: true,
          _count: { select: { items: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ])
    const href = (owner: string | null, route: string, id: string) =>
      actor.role === 'ADMIN' || owner === actor.userId ? route + encodeURIComponent(id) : null
    const list = [
      ...legacy.map(q => ({ id: q.id, code: q.code, name: q.name, description: q.description,
        estimatedTime: q.estimatedTime, kind: 'LEGACY', unitCount: q._count.questionnaireScales,
        unitLabel: '个量表', manageHref: href(q.creatorId, '/questionnaires/', q.id) })),
      ...products.map(q => ({ id: q.id, code: q.code, name: q.name, description: q.description,
        estimatedTime: null, kind: 'COLLECTION', unitCount: q._count.items,
        unitLabel: '个单元', manageHref: href(q.createdBy, '/questionnaire-products/', q.id) })),
    ]
    return success(res, { list, total: list.length })
  } catch {
    return error(res, '无法读取课程投放问卷', -1, 500)
  }
}
