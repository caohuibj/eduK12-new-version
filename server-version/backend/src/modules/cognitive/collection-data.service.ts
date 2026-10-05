import { prisma } from '../../config/database'
import type { UserRole } from '../../types'
import { getAssignmentForTeacher } from './assignment.service'
import { hashResolvedConfig, readFrozenReport } from './profile-freeze'
import { FORBIDDEN } from './cognitive.errors'

/** Discover owned collection scopes using the frozen measurement contract.
 * These are explicitly labelled same-version collections, not inferred source
 * assignment lineage. Never match a task title, student ID or live config. */
export async function listCognitiveCollections(input: { userId: string; role: UserRole; assignmentId: string }) {
  await getAssignmentForTeacher(input.userId, input.role, input.assignmentId)
  const source = await prisma.cognitiveAssignment.findUnique({ where: { id: input.assignmentId } })
  if (!source?.resolvedConfigHash || !source.profile || !source.profileDefinitionVersion || !source.resolvedReportSnapshotEncrypted) return []
  const sourceReport = readFrozenReport(source.resolvedReportSnapshotEncrypted)
  if (!sourceReport) return []
  const expectedReportHash = hashResolvedConfig(sourceReport)
  const items = await prisma.compositeAssessmentItem.findMany({
    where: {
      type: 'COGNITIVE',
      compositeAssessment: { is: { createdBy: input.userId, productKind: 'QUESTIONNAIRE', reportPackageKey: null } },
      cognitiveAssignment: { is: {
        createdBy: input.userId, listedStandalone: false,
        configId: source.configId, profile: source.profile,
        profileDefinitionVersion: source.profileDefinitionVersion, resolvedConfigHash: source.resolvedConfigHash,
      } },
    },
    select: {
      cognitiveAssignmentId: true,
      cognitiveAssignment: { select: { resolvedReportSnapshotEncrypted: true } },
      compositeAssessment: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 101,
  })
  if (items.length > 100) throw FORBIDDEN('同版本问卷过多，请从问卷列表选择数据来源')
  const collections = new Map<string, { id: string; name: string; assignmentIds: string[]; completedCount: number }>()
  for (const item of items) {
    const report = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
    if (!report || hashResolvedConfig(report) !== expectedReportHash || !item.cognitiveAssignmentId) continue
    const completedCount = await prisma.cognitiveSession.count({ where: {
      assignmentId: item.cognitiveAssignmentId, status: 'COMPLETED',
      compositeAttempt: { is: { compositeAssessmentId: item.compositeAssessment.id, assignmentRef: null } },
    } })
    const existing = collections.get(item.compositeAssessment.id)
    if (existing) {
      if (!existing.assignmentIds.includes(item.cognitiveAssignmentId)) {
        existing.assignmentIds.push(item.cognitiveAssignmentId)
        existing.completedCount += completedCount
      }
    } else collections.set(item.compositeAssessment.id, { ...item.compositeAssessment, assignmentIds: [item.cognitiveAssignmentId], completedCount })
  }
  return [...collections.values()]
}

export async function requireCognitiveCollection(input: { userId: string; role: UserRole; assignmentId: string; collectionId: string }) {
  const collection = (await listCognitiveCollections(input)).find(value => value.id === input.collectionId)
  if (!collection) throw FORBIDDEN('当前无权读取所选问卷，或其冻结任务版本不匹配')
  return collection
}
