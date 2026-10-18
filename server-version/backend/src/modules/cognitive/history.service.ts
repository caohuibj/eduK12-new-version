import { resolveTrainingAttemptScope } from '../composite/training-variant-scope'
import { loadSituationalExportSlotSets } from '../composite/situational-canonical-export'
import { trainingVariantProvenance } from '../composite/training-variant-export'
import { prisma } from '../../config/database'
import type { Prisma } from '@prisma/client'
import { logger } from '../../utils/logger'
import { decryptCognitivePayload } from './cognitive.security'
import type { PaginationParams } from '../../utils/pagination'
import { parseCognitiveResultSnapshot } from './v2/result-snapshot'

type HistoryRow = {
  sessionId: string
  assignmentId: string | null
  title: string
  testType: string
  attemptNo: number
  configVersion: string
  engineVersion: string
  scoringVersion: string
  finishedAt: Date | null
  score: number | null
  qualityState: 'interpretable' | 'limited' | 'invalid'
  source: 'standalone' | 'composition'
  sourceName: string | null
  reportHref: string
}

/** 学生自己的已完成记录；不返回 raw trial、密文或详细 metrics。 */
export const listMyHistory = async (userId: string, pagination: PaginationParams) => {
  const where: Prisma.CognitiveSessionWhereInput = {
    userId,
    status: 'COMPLETED' as const,
    AND: [{ OR: [{ compositeAttemptId: null }, { compositeAttempt: { userId, status: 'COMPLETED', assignmentRef: null, compositeAssessment: { productKind: { in: ['QUESTIONNAIRE', 'LEGACY_COMPOSITE'] }, reportPackageKey: null, analysisProtocolKey: null } } }] }],
    OR: [
      { scoreEncrypted: { not: null }, qualityFlagsEncrypted: { not: null } },
      { resultSnapshotEncrypted: { not: null } },
    ],
  }
  const sessions = await prisma.cognitiveSession.findMany({
    where,
    orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      assignmentId: true, compositeItemId: true,
      testType: true,
      attemptNo: true,
      configVersion: true,
      engineVersion: true,
      scoringVersion: true,
      finishedAt: true,
      scoreEncrypted: true,
      qualityFlagsEncrypted: true,
      resultSnapshotEncrypted: true,
      assignment: { select: { title: true } },
      compositeAttempt: { select: { id: true, status: true, attemptEpoch: true, participantKey: true, runtimeGeneration: true, deliveryMode: true, trainingVariantAllocationEncrypted: true, trainingVariantAllocationHash: true, frozenActiveSlotSetEncrypted: true, frozenActiveSlotSetHash: true, compositeAssessment: { select: { id: true, name: true, publishedAt: true, trainingVariantDraft: true, trainingVariantFrozen: true, trainingVariantDigest: true, items: true, formSections: {include: {items: true}} } } } },
    },
  })

  const variantParents = new Map(sessions.flatMap(session => {const parent = session.compositeAttempt; return parent && (parent.trainingVariantAllocationEncrypted != null || parent.trainingVariantAllocationHash != null || parent.compositeAssessment.trainingVariantFrozen != null || parent.compositeAssessment.trainingVariantDigest != null) ? [[parent.id, parent] as const] : []}))
  const frozenSlotSets = await loadSituationalExportSlotSets([...variantParents.values()])
  const variantScopes = new Map(await Promise.all([...variantParents.values()].map(async parent => [parent.id, await resolveTrainingAttemptScope(parent, parent.compositeAssessment, {frozenSlotSets})] as const)))
  const displayable: HistoryRow[] = []
  for (const session of sessions) {
    const scope = session.compositeAttempt ? variantScopes.get(session.compositeAttempt.id) : undefined
    if (scope && (!session.compositeItemId || !scope.itemIds.has(session.compositeItemId) || session.attemptNo !== session.compositeAttempt!.attemptEpoch)) continue
    const source = {
      ...(scope ? {trainingVariant: trainingVariantProvenance(scope)} : {}),
      source: session.compositeAttempt ? 'composition' as const : 'standalone' as const,
      sourceName: session.compositeAttempt?.compositeAssessment.name ?? null,
      reportHref: `/student/cognitive/sessions/${session.id}/result`,
    }
    try {
      if (session.resultSnapshotEncrypted) {
        const snapshot = parseCognitiveResultSnapshot(
          decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted),
        )
        displayable.push({
          ...source,
          sessionId: session.id,
          assignmentId: session.assignmentId,
          title: session.assignment?.title ?? `${session.testType} 测评`,
          testType: session.testType,
          attemptNo: session.attemptNo,
          configVersion: session.configVersion,
          engineVersion: session.engineVersion,
          scoringVersion: session.scoringVersion,
          finishedAt: session.finishedAt,
          score: null,
          qualityState: snapshot.quality.state,
        })
        continue
      }
      if (!session.scoreEncrypted || !session.qualityFlagsEncrypted) throw new Error('completed legacy history result is incomplete')
      const score = decryptCognitivePayload<number>(session.scoreEncrypted as string)
      const qualityFlags = decryptCognitivePayload<Record<string, unknown>>(
        session.qualityFlagsEncrypted as string
      )
      displayable.push({
        ...source,
        sessionId: session.id,
        assignmentId: session.assignmentId,
        title: session.assignment?.title ?? `${session.testType} 测评`,
        testType: session.testType,
        attemptNo: session.attemptNo,
        configVersion: session.configVersion,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        finishedAt: session.finishedAt,
        score,
        qualityState: qualityFlags.interpretable === false ? 'limited' : 'interpretable',
      })
    } catch {
      logger.warn('Skipping undecryptable cognitive history session', {
        sessionId: session.id,
        userId,
      })
    }
  }

  const total = displayable.length
  const list = displayable.slice(pagination.skip, pagination.skip + pagination.take)
  return { list, total }
}
