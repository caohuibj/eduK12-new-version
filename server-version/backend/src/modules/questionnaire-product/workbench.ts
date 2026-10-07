import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { parseCognitiveResultSnapshot } from '../cognitive/v2/result-snapshot'
import { compositeForbidden, compositeNotFound, compositeConflict } from '../composite/composite.errors'
import * as questionnaire from './service'

type Actor = { userId: string; role: UserRole }
const teacher = (actor: Actor) => { if (!['TEACHER', 'ADMIN'].includes(actor.role)) throw compositeForbidden() }
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict()
export async function templates(actor: Actor, raw: unknown) {
  teacher(actor); const { page, pageSize } = pageSchema.parse(raw)
  const where = { ownerId: actor.userId, archivedAt: null }
  const [list, total] = await prisma.$transaction([
    prisma.assessmentCompositionTemplate.findMany({ where, select: { id: true, name: true, definitionId: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.assessmentCompositionTemplate.count({ where }),
  ])
  return { list, total, page, pageSize }
}
export async function saveTemplate(actor: Actor, raw: unknown) {
  teacher(actor)
  const input = z.object({ sourceId: z.string().min(1), name: z.string().trim().min(1).max(200), requestId: z.string().uuid() }).strict().parse(raw)
  const requestKey = actor.userId + ':' + input.requestId, requestHash = canonicalHash(input)
  const previous = await prisma.assessmentCompositionTemplate.findUnique({ where: { requestKey } })
  if (previous) { if (previous.requestHash !== requestHash) throw compositeConflict('同一模板请求不能更换内容'); return previous }
  const copy = await questionnaire.copy(actor, input.sourceId, { requestId: input.requestId })
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey},0))`
    const existing = await tx.assessmentCompositionTemplate.findUnique({ where: { requestKey } })
    if (existing) { if (existing.requestHash !== requestHash) throw compositeConflict('同一模板请求不能更换内容'); return existing }
    await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${copy.id} FOR UPDATE`
    const prototype = await tx.compositeAssessment.findUnique({ where: { id: copy.id }, include: { _count: { select: { attempts: true, accessTokens: true } } } })
    if (!prototype || prototype.status !== 'DRAFT' || prototype._count.attempts || prototype._count.accessTokens) throw compositeConflict('此请求已用于投放对象，请使用新的保存模板请求')
    await tx.questionnaireCourseDelivery.deleteMany({ where: { compositeId: copy.id } })
    await tx.compositeAssessment.update({ where: { id: copy.id }, data: { name: input.name, courseId: null, publicEnabled: false, opensAt: null, expiresAt: null } })
    const row = await tx.assessmentCompositionTemplate.create({ data: { ownerId: actor.userId, definitionId: copy.id, name: input.name, requestKey, requestHash } })
    await tx.assessmentManagementEvent.create({ data: { actorId: actor.userId, resourceId: row.id, action: 'TEMPLATE_SAVE', metadata: { name: row.name, sourceId: input.sourceId } } })
    return row
  })
}
async function ownedTemplate(actor: Actor, id: string) {
  teacher(actor)
  const row = await prisma.assessmentCompositionTemplate.findFirst({ where: { id, ownerId: actor.userId, archivedAt: null } })
  if (!row) throw compositeNotFound('模板不存在或当前无权使用')
  return row
}
export async function instantiateTemplate(actor: Actor, id: string, raw: unknown) {
  const row = await ownedTemplate(actor, id)
  const input = z.object({ requestId: z.string().uuid() }).strict().parse(raw)
  return questionnaire.copy(actor, row.definitionId, input)
}
export async function archiveTemplate(actor: Actor, id: string) {
  teacher(actor)
  const row = await prisma.assessmentCompositionTemplate.findFirst({ where: { id, ownerId: actor.userId } })
  if (!row) throw compositeNotFound('模板不存在或当前无权使用')
  return prisma.$transaction(async tx => {
    const changed = await tx.assessmentCompositionTemplate.updateMany({ where: { id: row.id, ownerId: actor.userId, archivedAt: null }, data: { archivedAt: new Date() } })
    if (changed.count) await tx.assessmentManagementEvent.create({ data: { actorId: actor.userId, resourceId: id, action: 'TEMPLATE_ARCHIVE', metadata: { name: row.name } } })
    return { archived: true }
  })
}
export async function managementEvents(actor: Actor, raw: unknown) {
  teacher(actor); const { page, pageSize } = pageSchema.parse(raw)
  const list = await prisma.assessmentManagementEvent.findMany({ where: { actorId: actor.userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize + 1 })
  return { list: list.slice(0, pageSize), hasMore: list.length > pageSize, page }
}
export async function courseOverview(actor: Actor, courseId: string, raw: unknown) {
  teacher(actor); const { page, pageSize } = pageSchema.parse(raw)
  const course = await prisma.course.findFirst({ where: { id: courseId, isLibrary: false, ...(actor.role === 'ADMIN' ? {} : { creatorId: actor.userId }) }, select: { id: true, title: true } })
  if (!course) throw compositeNotFound('课程不存在或当前没有管理权限')
  const where = { ...(actor.role === 'ADMIN' ? {} : { createdBy: actor.userId }), compositionTemplates: { none: {} }, OR: [{ courseId }, { questionnaireCourses: { some: { courseId } } }] }
  const [assessments, total] = await prisma.$transaction([
    prisma.compositeAssessment.findMany({ where, select: { id: true, name: true, status: true, productKind: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.compositeAssessment.count({ where }),
  ])
  const attempts = await prisma.compositeAssessmentAttempt.groupBy({ by: ['compositeAssessmentId', 'status'], where: { compositeAssessmentId: { in: assessments.map(a => a.id) }, userId: { not: null }, assignmentRef: null, OR: [{ deliveryCourseId: courseId }, { deliveryCourseId: null, compositeAssessment: { courseId, productKind: { not: 'QUESTIONNAIRE' } } }] }, _count: { _all: true } })
  // Administrative completion counts, never psychological group statistics.
  const list = assessments.map(row => ({ ...row, attempts: Object.fromEntries(attempts.filter(a => a.compositeAssessmentId === row.id).map(a => [a.status, a._count._all])) }))
  const sessions = await prisma.cognitiveSession.findMany({ where: { userId: { not: null }, assignment: { createdBy: actor.userId }, OR: [
    { compositeAttemptId: null, assignment: { createdBy: actor.userId, courseId, listedStandalone: true } },
    { compositeAttempt: { assignmentRef: null, deliveryCourseId: courseId, compositeAssessment: { createdBy: actor.userId, productKind: 'QUESTIONNAIRE', reportPackageKey: null, analysisProtocolKey: null } } },
    { compositeAttempt: { assignmentRef: null, compositeAssessment: { createdBy: actor.userId, courseId, productKind: 'LEGACY_COMPOSITE', reportPackageKey: null, analysisProtocolKey: null } } },
  ] }, select: { id: true, status: true, finishedAt: true, resultSnapshotEncrypted: true, assignment: { select: { id: true, title: true } }, user: { select: { nickname: true, username: true } }, compositeAttemptId: true, compositeAttempt: { select: { compositeAssessmentId: true, status: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize + 1 })
  const quality = sessions.slice(0, pageSize).map(({ resultSnapshotEncrypted, user, assignment, compositeAttempt, ...row }) => {
    let qualityState = row.status === 'COMPLETED' ? 'unavailable' : 'pending'
    if (resultSnapshotEncrypted) { try { qualityState = parseCognitiveResultSnapshot(decryptCognitivePayload(resultSnapshotEncrypted)).quality.state } catch { /* Preserve unavailable; never guess. */ } }
    const reportHref = compositeAttempt ? `/composite-assessments/${compositeAttempt.compositeAssessmentId}/attempts/${row.compositeAttemptId}/report${compositeAttempt.status === 'COMPLETED' ? '' : '?partial=1'}` : assignment ? `/cognitive-assignments/${assignment.id}` : null
    return { ...row, participant: user?.nickname || user?.username || '已停用账号', title: assignment?.title || '认知任务', qualityState, reportHref }
  })
  return { course, list, total, page, pageSize, quality, qualityHasMore: sessions.length > pageSize, countMeaning: '次数为本课程已登录作答次数；不去重为人数，不提供群体心理指标。' }
}
