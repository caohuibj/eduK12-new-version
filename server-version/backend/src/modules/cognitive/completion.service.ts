import { prisma } from '../../config/database'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
} from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { CognitiveScoringInputError } from './cognitive.types'
import { resolveCognitiveReferenceForResult } from './reference'
import { loadFrozenMeasurementContext } from './profile-freeze'
import { buildCognitiveSingleTaskReport } from './single-task-report'
import { lockSession } from './session-lock'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'
import { getCognitiveV2TaskDefinition } from './v2/registry'
import { runAuthoritativeScorer } from './v2/authoritative-scorer'
import { readCognitiveSessionConfig } from './session.service'
import { ensureCognitiveAssessmentContext } from './v2/assessment-context'
import { loadCognitiveReferenceSets, resolveCognitiveMetricReferences } from './v2/reference-adapter'
import { projectThreeLayerReport, referencesForReportReading } from './v2/report'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from './v2/result-snapshot'
import type { CognitiveResultSnapshot } from './v2/types'

/**
 * D6 — Completion / Scoring 服务。
 *
 * 原则（D6 §4）：Score/metrics/rawData 不由客户端决定 —— API body 为 strict `{}`，
 * 客户端提交 score/metrics/rawData 会被 schema 拒绝。
 *
 * 评分链路（D6 §5–§11 + D6.1）：
 * 1. DB transaction + Session 行锁（FOR UPDATE）内：Load + Ownership → status 分支
 *    （IN_PROGRESS 继续 / COMPLETED 幂等返回 / ABANDONED·INVALID reject）。
 * 2. Registry lookup 用 **Session 冻结三 version**（绝不回退"最新 scorer"；缺失 = 服务端配置错误 500）。
 * 3. config：decrypt `configSnapshotEncrypted` → `configSchema.parse`（**不重读 DB config**）。
 * 4. trials：`orderBy trialIndex asc` → 逐条 decrypt → `trialSchema.parse` → `{trialIndex, payload}`。
 * 5. `entry.score(...)`；`CognitiveScoringInputError` → 400/422 且 **Session 保持 IN_PROGRESS**
 *    （不因一次 premature completion 自动置 INVALID；事务回滚，不产生任何写）。
 * 6. 结果三列 encryptCognitivePayload；原子 close：`updateMany where id + status=IN_PROGRESS`，
 *    count=0 → 重读：已 COMPLETED 返回 stored result，否则 reject。
 *
 * D6.1（P0）：行锁保证评分读取的 trials 数据集与完成时冻结的数据集一致 ——
 * 并发 append 必须排队，无法在评分期间写入新 trial。
 */

const buildCompletedPayload = async (
  tx: { cognitiveAssignment: { findUnique: (args: never) => Promise<unknown> } },
  session: {
    id: string
    assignmentId: string | null
    testType: string
    engineVersion: string
    scoringVersion: string
    configVersion: string
  },
  score: number,
  metrics: Record<string, unknown>,
  qualityFlags: Record<string, unknown>,
  finishedAt: Date | null,
  config: Record<string, unknown>,
) => {
  const freeze = await loadFrozenMeasurementContext(tx, session.assignmentId)
  const reference = resolveCognitiveReferenceForResult({
    testType: session.testType,
    metrics,
    score,
    qualityFlags,
    config,
    profile: freeze.profile,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    configVersion: session.configVersion,
  })
  return {
    sessionId: session.id,
    status: 'COMPLETED' as const,
    finishedAt,
    score,
    metrics,
    qualityFlags,
    reference,
    singleTaskReport: buildCognitiveSingleTaskReport({
      testType: session.testType,
      engineVersion: session.engineVersion,
      scoringVersion: session.scoringVersion,
      configVersion: session.configVersion,
      profile: freeze.profile,
      frozenReport: freeze.frozenReport,
      score,
      metrics,
      qualityFlags,
      reference,
    }),
  }
}

const decryptResult = (session: {
  scoreEncrypted: string | null
  metricsEncrypted: string | null
  qualityFlagsEncrypted: string | null
  finishedAt: Date | null
}) => {
  if (!session.scoreEncrypted || !session.metricsEncrypted || !session.qualityFlagsEncrypted) {
    throw CONFLICT('Session marked COMPLETED but result columns are missing')
  }
  return {
    score: decryptCognitivePayload<number>(session.scoreEncrypted),
    metrics: decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted),
    qualityFlags: decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted),
    finishedAt: session.finishedAt,
  }
}

const v2ResponseFromSnapshot = (snapshot: CognitiveResultSnapshot) => ({
  metrics: snapshot.metrics,
  quality: snapshot.quality,
  qualityFlags: snapshot.quality.flags,
  references: referencesForCognitiveResult(snapshot),
  report: snapshot.report,
  assessmentContext: snapshot.assessmentContext,
})

const buildV2CompletedPayload = (
  session: { id: string },
  snapshot: CognitiveResultSnapshot,
) => ({
  sessionId: session.id,
  status: 'COMPLETED' as const,
  finishedAt: new Date(snapshot.completedAt),
  ...v2ResponseFromSnapshot(snapshot),
  result: v2ResponseFromSnapshot(snapshot),
})

const completeV2Session = async (tx: any, session: any, snapshot: ReturnType<typeof readCognitiveSessionConfig>['snapshot']) => {
  if (!snapshot) throw new Error('v2 session snapshot is required')
  const definition = getCognitiveV2TaskDefinition(
    session.testType,
    session.engineVersion,
    session.scoringVersion,
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${session.testType}/${session.engineVersion}/${session.scoringVersion}`)

  const contextState = await ensureCognitiveAssessmentContext(tx, session)
  const trials = await tx.cognitiveTrial.findMany({
    where: { sessionId: session.id },
    orderBy: { trialIndex: 'asc' },
  })
  const storedTrials = trials.map((trial: { payloadEncrypted: string }) => decryptCognitivePayload<unknown>(trial.payloadEncrypted))

  let scored
  try {
    scored = runAuthoritativeScorer({
      definition,
      session: snapshot,
      trials: storedTrials,
      randomSeed: session.randomSeed,
    })
  } catch (err) {
    if (err instanceof CognitiveScoringInputError) throw BAD_REQUEST(err.message)
    throw err
  }

  const freeze = await loadFrozenMeasurementContext(tx, session.assignmentId)
  const references = scored.quality.state === 'invalid'
    ? []
    : await loadCognitiveReferenceSets(tx, session.testType)
  const resolvedReferences = scored.quality.state === 'invalid'
    ? []
    : resolveCognitiveMetricReferences({
        definition,
        metrics: scored.metrics,
        references,
        context: contextState.context,
        quality: scored.quality,
        measurement: freeze,
      })
  const report = projectThreeLayerReport({
    testType: session.testType,
    configVersion: session.configVersion,
    protocolSignature: snapshot.protocolSignature,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    profile: freeze.profile,
    participantPresentation: freeze.frozenReport?.participantPresentation,
    reportCaveats: freeze.frozenReport?.reportCaveats,
    trials: storedTrials,
    config: snapshot.config as Record<string, unknown>,
    definition: freeze.frozenReport?.v2ReportDefinition ?? definition.report,
    metrics: scored.metrics,
    score: scored,
    metricDefinitions: freeze.frozenReport?.v2MetricDefinitions ?? definition.metrics,
    qualityDefinitions: freeze.frozenReport?.v2QualityDefinitions ?? definition.quality,
  })
  const resultSnapshot: CognitiveResultSnapshot = parseCognitiveResultSnapshot({
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    testType: session.testType,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    protocolSignature: snapshot.protocolSignature,
    profile: report.method.profile,
    metrics: scored.metrics,
    quality: scored.quality,
    references: referencesForReportReading(report, resolvedReferences) as unknown as Array<Record<string, unknown>>,
    report: report as unknown as Record<string, unknown>,
    assessmentContext: contextState.reference,
  })

  const resultSnapshotEncrypted = encryptCognitivePayload(resultSnapshot)
  const metricsEncrypted = encryptCognitivePayload(scored.metrics)
  // Keep the legacy compatibility column as a boolean flag map for existing
  // composite/export readers; the complete three-state quality object lives
  // in resultSnapshotEncrypted.
  const qualityFlagsEncrypted = encryptCognitivePayload(scored.quality.flags)
  const finishedAt = new Date(resultSnapshot.completedAt)
  const { count } = await tx.cognitiveSession.updateMany({
    where: { id: session.id, status: 'IN_PROGRESS' },
    data: {
      status: 'COMPLETED',
      finishedAt,
      scoreEncrypted: null,
      metricsEncrypted,
      qualityFlagsEncrypted,
      resultSnapshotEncrypted,
    },
  })
  if (count === 0) {
    const reloaded = await tx.cognitiveSession.findUnique({ where: { id: session.id } })
    if (reloaded?.status === 'COMPLETED' && reloaded.resultSnapshotEncrypted) {
      return buildV2CompletedPayload(reloaded, parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(reloaded.resultSnapshotEncrypted)))
    }
    throw CONFLICT('Session cannot be completed in its current state')
  }
  return buildV2CompletedPayload(session, resultSnapshot)
}

const completeSessionWithPrincipal = async (userId: string | null, sessionId: string, recoveryTokenHash?: string) => {
  const result = await prisma.$transaction(async (tx) => {
    // 行锁：串行化 complete 与 append/restart，保证评分数据集冻结。
    const session = await lockSession(tx, sessionId)
    if (!session) throw NOT_FOUND('CognitiveSession not found')
    if (userId !== null) {
      if (session.userId !== userId) throw FORBIDDEN('Not the owner of this session')
    } else {
      let allowed = Boolean(recoveryTokenHash && session.recoveryTokenHash === recoveryTokenHash)
      if (!allowed && recoveryTokenHash && session.compositeAttemptId) {
        const attempt = await tx.compositeAssessmentAttempt.findUnique({
          where: { id: session.compositeAttemptId },
          select: { recoveryTokenHash: true, userId: true },
        })
        allowed = attempt?.userId === null && attempt.recoveryTokenHash === recoveryTokenHash
      }
      if (session.userId !== null || !allowed) throw FORBIDDEN('Recovery credential does not own this session')
    }

    // COMPLETED：幂等返回已存结果（不要求 completionKey）。
    if (session.status === 'COMPLETED') {
      const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
      if (storedConfig.snapshot) {
        if (!session.resultSnapshotEncrypted) throw CONFLICT('v2 completed session result snapshot is missing')
        const snapshot = parseCognitiveResultSnapshot(
          decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted),
        )
        return buildV2CompletedPayload(session, snapshot)
      }
      const { score, metrics, qualityFlags, finishedAt } = decryptResult(session)
      const config = decryptCognitivePayload<Record<string, unknown>>(session.configSnapshotEncrypted)
      return buildCompletedPayload(tx, session, score, metrics, qualityFlags, finishedAt, config)
    }
    if (session.status === 'ABANDONED' || session.status === 'INVALID') {
      throw BAD_REQUEST(`Session is ${session.status} and cannot be completed`)
    }

    // IN_PROGRESS → 继续评分。
    if (session.runtimeGeneration === 'UNIFIED_V1') {
      throw BAD_REQUEST('统一认知测评必须通过最终提交接口完成')
    }

    const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
    if (storedConfig.snapshot) {
      return completeV2Session(tx, session, storedConfig.snapshot)
    }

    // 用 frozen version 查 Registry，缺失 = 服务端配置错误，绝不静默换最新 scorer。
    const entry = requireCognitiveRegistryEntry(
      session.testType,
      session.engineVersion,
      session.scoringVersion
    )

    const validatedConfig = entry.configSchema.parse(
      decryptCognitivePayload<unknown>(session.configSnapshotEncrypted)
    )

    const trials = await tx.cognitiveTrial.findMany({
      where: { sessionId },
      orderBy: { trialIndex: 'asc' },
    })
    const scoringTrials = trials.map((t) => ({
      trialIndex: t.trialIndex,
      payload: entry.trialSchema.parse(decryptCognitivePayload<unknown>(t.payloadEncrypted)),
    }))

    let result: { score: number; metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> }
    try {
      result = entry.score({
        config: validatedConfig,
        trials: scoringTrials,
        randomSeed: session.randomSeed,
      })
    } catch (err) {
      if (err instanceof CognitiveScoringInputError) {
        // premature / malformed trials：Session 保持 IN_PROGRESS，学生可补交后再次 complete。
        throw BAD_REQUEST(err.message)
      }
      throw err
    }

    const scoreEncrypted = encryptCognitivePayload(result.score)
    const metricsEncrypted = encryptCognitivePayload(result.metrics)
    const qualityFlagsEncrypted = encryptCognitivePayload(result.qualityFlags)
    const finishedAt = new Date()

    // 原子 close：仅当仍为 IN_PROGRESS 时更新（行锁内双保险，防并发双写）。
    const { count } = await tx.cognitiveSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        finishedAt,
        scoreEncrypted,
        metricsEncrypted,
        qualityFlagsEncrypted,
      },
    })

    if (count === 0) {
      const reloaded = await tx.cognitiveSession.findUnique({ where: { id: sessionId } })
      if (reloaded?.status === 'COMPLETED') {
        const { score, metrics, qualityFlags, finishedAt: fin } = decryptResult(reloaded)
        return buildCompletedPayload(
          tx,
          reloaded,
          score,
          metrics,
          qualityFlags,
          fin,
          validatedConfig as Record<string, unknown>,
        )
      }
      throw CONFLICT('Session cannot be completed in its current state')
    }

    return buildCompletedPayload(
      tx,
      session,
      result.score,
      result.metrics,
      result.qualityFlags,
      finishedAt,
      validatedConfig as Record<string, unknown>,
    )
  })

  // Composite parent completion is deliberately outside the child-session
  // transaction: the cognitive result is already durable, while the parent
  // finalization can safely retry through its own serialized transaction.
  const compositeLink = await prisma.cognitiveSession.findUnique({
    where: { id: sessionId },
    select: { compositeAttemptId: true },
  })
  if (compositeLink?.compositeAttemptId) {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await finalizeCompositeAttemptIfReady(compositeLink.compositeAttemptId)
  }
  const { projectRelationalUnitFinalResponse } = await import('../assessment-relational/result-authority')
  return projectRelationalUnitFinalResponse(compositeLink?.compositeAttemptId, result)
}

export const completeSession = async (userId: string, sessionId: string) =>
  completeSessionWithPrincipal(userId, sessionId)

export const completeSessionForPublic = async (sessionId: string, recoveryTokenHash: string) =>
  completeSessionWithPrincipal(null, sessionId, recoveryTokenHash)
