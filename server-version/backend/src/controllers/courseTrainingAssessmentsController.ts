import type { Request, Response } from 'express'
import { prisma } from '../config/database'
import { canAccessCourseRoster } from '../utils/courseAccess'
import { forbidden, notFound, success, error } from '../utils/response'

/**
 * Read-only, course-scoped inventory of ACTUALLY DELIVERED assessments.
 * Names and publication metadata only; never score, answers, attempt,
 * participant identity or report authorization.
 */
export async function courseTrainingAssessments(req: Request, res: Response) {
  const courseId = req.params.id
  const actor = req.user!
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, creatorId: true, isLibrary: true },
    })
    if (!course) return notFound(res, '课程不存在')
    // Sharing course content never grants authority over its participants or
    // complete roster; only course creator and legacy Admin can read inventory.
    if (!canAccessCourseRoster(course, actor.userId, actor.role)) return forbidden(res, '无权管理此课程')

    const [questionnaires, composed, scales, cognitive] = await Promise.all([
      prisma.questionnaire.findMany({
        where: { type: 'COURSE', status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'COURSE'] }, courseQuestionnaires: { some: { courseId } } },
        select: { id: true, name: true, description: true, creatorId: true,
          _count: { select: { questionnaireScales: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.compositeAssessment.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            { productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', questionnaireCourses: { some: { courseId } } },
            { productKind: { in: ['LEGACY_COMPOSITE', 'ASSESSMENT_BUNDLE'] }, courseId },
          ],
        },
        select: { id: true, name: true, description: true, createdBy: true, productKind: true,
          _count: { select: { items: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.scale.findMany({
        where: { status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'COURSE'] }, courseScales: { some: { courseId } } },
        select: { id: true, name: true, description: true, creatorId: true, itemCount: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.cognitiveAssignment.findMany({
        where: { courseId, status: 'PUBLISHED', listedStandalone: true },
        select: { id: true, title: true, instruction: true, createdBy: true },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
    ])

    const link = (owner: string | null, prefix: string, id: string) =>
      actor.role === 'ADMIN' || owner === actor.userId ? prefix + encodeURIComponent(id) : null

    const list = [
      ...questionnaires.map(row => ({
        key: 'legacy-questionnaire:' + row.id, id: row.id, kind: 'LEGACY_QUESTIONNAIRE',
        typeLabel: '课程问卷', name: row.name, description: row.description, status: 'PUBLISHED',
        unitCount: row._count.questionnaireScales, unitLabel: '个量表',
        manageHref: link(row.creatorId, '/questionnaires/', row.id),
      })),
      ...composed.map(row => ({
        key: 'composite:' + row.id, id: row.id, kind: row.productKind,
        typeLabel: row.productKind === 'QUESTIONNAIRE' ? '课程问卷'
          : row.productKind === 'ASSESSMENT_BUNDLE' ? '固定测评包' : '组合测评',
        name: row.name, description: row.description, status: 'PUBLISHED',
        unitCount: row._count.items, unitLabel: '个测评单元',
        manageHref: link(row.createdBy,
          row.productKind === 'QUESTIONNAIRE' ? '/questionnaire-products/'
          : row.productKind === 'ASSESSMENT_BUNDLE' ? '/bundle-products/'
            : '/composite-assessments/', row.id),
      })),
      ...scales.map(row => ({
        key: 'scale:' + row.id, id: row.id, kind: 'SCALE',
        typeLabel: '课程量表', name: row.name, description: row.description, status: 'PUBLISHED',
        unitCount: row.itemCount, unitLabel: '道题目',
        manageHref: link(row.creatorId, '/scales/', row.id),
      })),
      ...cognitive.map(row => ({
        key: 'cognitive:' + row.id, id: row.id, kind: 'COGNITIVE',
        typeLabel: '认知测评', name: row.title, description: row.instruction, status: 'PUBLISHED',
        unitCount: null, unitLabel: null,
        manageHref: link(row.createdBy, '/cognitive-assignments/', row.id),
      })),
    ]
    return success(res, { list, total: list.length })
  } catch {
    return error(res, '读取课程测评清单失败', -1, 500)
  }
}
