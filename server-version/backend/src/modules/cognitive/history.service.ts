import { resolveTrainingAttemptScope } from '../composite/training-variant-scope'
import { loadSituationalExportSlotSets } from '../composite/situational-canonical-export'
import { trainingVariantProvenance } from '../composite/training-variant-export'
import { prisma } from '../../config/database'
import type { Prisma } from '@prisma/client'
import { logger } from '../../utils/logger'
import { decryptCognitivePayload } from './cognitive.security'
import type { PaginationParams } from '../../utils/pagination'
import { parseCognitiveResultSnapshot } from './v2/result-snapshot'
import { evaluateTrainingFeedbackForAttempt, trainingFeedbackAttemptSelect, trainingFeedbackParentSelect } from '../composite/training-feedback-binding'
import { trainingFeedbackReportReady } from '../assessment-policy/participant-feedback'

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
  qualityState: 'interpretable' | 'limited' | 'invalid' | null
  feedbackDeferred?: true
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
      compositeAttempt: { select: { ...trainingFeedbackAttemptSelect, id: true, status: true, attemptEpoch: true, participantKey: true, runtimeGeneration: true, deliveryMode: true, trainingVariantAllocationEncrypted: true, trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true, frozenActiveSlotSetEncrypted: true, frozenActiveSlotSetHash: true, compositeAssessment: { select: { ...trainingFeedbackParentSelect, id: true, name: true, publishedAt: true, trainingVariantDraft: true, trainingVariantFrozen: true, trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true, items: true, formSections: {include: {items: true}} } } } },
    },
  })

  // Reuse each authorized parent projection. Only completed, valid, currently
  // releasable async parents need job headers, fetched once for the whole list.
  // A future release date or malformed binding never triggers a job/decrypt read.
  const now = new Date()
  const parents = new Map(sessions.flatMap(session => session.compositeAttempt ? [[session.compositeAttempt.id, session.compositeAttempt] as const] : []))
  const asyncParents = [...parents.values()].filter(parent => {
    const timing = evaluateTrainingFeedbackForAttempt(parent, { reportReady: true, now })
    return timing.configured && timing.allowed && parent.asyncReportEpoch !== null && parent.asyncReportEpoch === parent.attemptEpoch
  })
  const jobs = asyncParents.length ? await prisma.compositeReportJob.findMany({
    where: { OR: asyncParents.map(parent => ({ attemptId: parent.id, attemptEpoch: parent.attemptEpoch })) },
    select: { attemptId: true, attemptEpoch: true, status: true, slotSetHash: true, contextHash: true, aggregateInputHash: true },
  }) : []
  const jobsByParent = new Map(jobs.map(job => [job.attemptId, job] as const))
  const withheldParents = new Set([...parents.values()].filter(parent => !evaluateTrainingFeedbackForAttempt(parent, {
    now, reportReady: trainingFeedbackReportReady(parent, jobsByParent.get(parent.id)),
  }).allowed).map(parent => parent.id))

  const variantParents = new Map(sessions.flatMap(session => {const parent = session.compositeAttempt; return parent && (parent.trainingVariantAllocationEncrypted != null || parent.trainingVariantAllocationHash != null || parent.compositeAssessment.trainingVariantDraft != null || parent.compositeAssessment.trainingVariantFrozen != null || parent.compositeAssessment.trainingVariantDigest != null) ? [[parent.id, parent] as const] : []}))
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
    if (session.compositeAttempt && withheldParents.has(session.compositeAttempt.id)) {
      // Completion is still a useful receipt. Score, quality and even malformed
      // result ciphertext are not inspected until the frozen policy permits it.
      displayable.push({ ...source, sessionId: session.id, assignmentId: session.assignmentId,
        title: session.assignment?.title ?? `${session.testType} 测评`, testType: session.testType,
        attemptNo: session.attemptNo, configVersion: session.configVersion, engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion, finishedAt: session.finishedAt,
        score: null, qualityState: null, feedbackDeferred: true,
        reportHref: `/student/composite/attempts/${session.compositeAttempt.id}/report`,
      })
      continue
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
