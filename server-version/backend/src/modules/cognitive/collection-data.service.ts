import { prisma } from '../../config/database'
import type { UserRole } from '../../types'
import type { Prisma } from '@prisma/client'
import { getAssignmentForTeacher } from './assignment.service'
import { hashResolvedConfig, readFrozenReport } from './profile-freeze'
import { FORBIDDEN } from './cognitive.errors'

type CognitiveCollection = { id: string; name: string; assignmentIds: string[]; itemIds: string[]; completedCount: number; assignmentFilter: Prisma.CognitiveAssignmentWhereInput }
export const cognitiveCollectionSessionWhere = (collection: CognitiveCollection): Prisma.CognitiveSessionWhereInput => ({
  compositeItemId: { in: collection.itemIds },
  assignment: { is: collection.assignmentFilter },
  compositeAttempt: { is: { compositeAssessmentId: collection.id, assignmentRef: null } },
})

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
      id: true,
      cognitiveAssignmentId: true,
      cognitiveAssignment: { select: { resolvedReportSnapshotEncrypted: true } },
      compositeAssessment: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 101,
  })
  if (items.length > 100) throw FORBIDDEN('同版本问卷过多，请从问卷列表选择数据来源')
  const assignmentFilter = { createdBy: input.userId, configId: source.configId, profile: source.profile,
    profileDefinitionVersion: source.profileDefinitionVersion, resolvedConfigHash: source.resolvedConfigHash }
  const collections = new Map<string, CognitiveCollection>()
  for (const item of items) {
    const report = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
    if (!report || hashResolvedConfig(report) !== expectedReportHash || !item.cognitiveAssignmentId) continue
    const existing = collections.get(item.compositeAssessment.id)
    if (existing) {
      if (!existing.assignmentIds.includes(item.cognitiveAssignmentId)) existing.assignmentIds.push(item.cognitiveAssignmentId)
      if (!existing.itemIds.includes(item.id)) existing.itemIds.push(item.id)
    } else collections.set(item.compositeAssessment.id, { ...item.compositeAssessment, assignmentIds: [item.cognitiveAssignmentId], itemIds: [item.id], completedCount: 0, assignmentFilter })
  }
  if (collections.size) {
    const counts = await prisma.cognitiveSession.groupBy({ by: ['compositeItemId'],
      where: { status: 'COMPLETED', OR: [...collections.values()].map(cognitiveCollectionSessionWhere) }, _count: { _all: true } })
    const countByItem = new Map(counts.map(value => [value.compositeItemId, value._count._all]))
    for (const collection of collections.values()) collection.completedCount = collection.itemIds.reduce((sum, id) => sum + (countByItem.get(id) ?? 0), 0)
  }
  return [...collections.values()]
}

export async function requireCognitiveCollection(input: { userId: string; role: UserRole; assignmentId: string; collectionId: string }) {
  const collection = (await listCognitiveCollections(input)).find(value => value.id === input.collectionId)
  if (!collection) throw FORBIDDEN('当前无权读取所选问卷，或其冻结任务版本不匹配')
  return collection
}
