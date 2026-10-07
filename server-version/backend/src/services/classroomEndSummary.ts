import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import { userCanManageClassroom, canManageClassroom } from '../middleware/classroomAccess'
import { canonicalHash } from '../modules/assessment-runtime/canonical'
import { compositeConflict, compositeForbidden, compositeNotFound } from '../modules/composite/composite.errors'

export async function classroomEndSummary(actor: { userId: string; role: UserRole }, classroomId: string, create = false) {
  if (!await userCanManageClassroom(classroomId, actor.userId, actor.role)) throw compositeForbidden()
  return prisma.$transaction(async tx => {
    if (create) await tx.$queryRaw`SELECT id FROM classrooms WHERE id=${classroomId} FOR UPDATE`
    const classroom = await tx.classroom.findUnique({ where: { id: classroomId }, include: { course: { select: { creatorId: true } }, questions: { orderBy: { questionIndex: 'asc' } } } })
    if (!classroom) throw compositeNotFound('课堂不存在')
    if (!canManageClassroom(classroom, actor.userId, actor.role)) throw compositeForbidden()
    const previous = await tx.classroomEndSummary.findUnique({ where: { classroomId } })
    if (previous) return previous
    if (!create) return null
    if (classroom.status !== 'ENDED') throw compositeConflict('课堂结束后才能生成小结')
    const [participants, counts] = await Promise.all([
      tx.classroomSession.count({ where: { classroomId, ...(classroom.endedAt ? { joinedAt: { lte: classroom.endedAt } } : {}) } }),
      tx.classroomAnswer.groupBy({ by: ['questionId'], where: { classroomId, ...(classroom.endedAt ? { submittedAt: { lte: classroom.endedAt } } : {}) }, _count: { _all: true } }),
    ])
    const frozenAt = new Date().toISOString()
    const payload = { schemaVersion: 1, classroomId, name: classroom.name, frozenAt, endedAt: classroom.endedAt?.toISOString() ?? null, endTimeStatus: classroom.endedAt ? 'recorded' : 'historical_missing', participants,
      questions: classroom.questions.map(q => { const content = q.questionContent as Record<string, unknown> | null; return {
        id: q.id, ordinal: q.questionIndex, questionVersion: canonicalHash(q.questionContent), startedAt: q.startedAt?.toISOString() ?? null, endedAt: q.endedAt?.toISOString() ?? null,
        title: typeof content?.title === 'string' ? content.title : typeof content?.question === 'string' ? content.question : `第 ${q.questionIndex} 题`,
        type: typeof content?.type === 'string' ? content.type : 'unknown', answered: counts.find(c => c.questionId === q.id)?._count._all ?? 0,
      } }), meaning: '参与数按课堂会话计数；作答数按题目提交计数。主观题不生成正确率，小结不包含学生身份或原始答案。' }
    const row = await tx.classroomEndSummary.create({ data: { classroomId, createdBy: actor.userId, payload: payload as unknown as Prisma.InputJsonValue, contentHash: canonicalHash(payload) } })
    await tx.assessmentManagementEvent.create({ data: { actorId: actor.userId, resourceId: classroomId, action: 'CLASSROOM_SUMMARY', metadata: { name: classroom.name, contentHash: row.contentHash } } })
    return row
  })
}
