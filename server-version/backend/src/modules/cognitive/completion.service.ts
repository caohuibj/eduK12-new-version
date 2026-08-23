import { prisma } from '../../config/database'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
} from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { CognitiveScoringInputError } from './cognitive.types'
import { resolveCognitiveReferenceForResult } from './reference'
import { lockSession } from './session-lock'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'

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

const completeSessionWithPrincipal = async (userId: string | null, sessionId: string, recoveryTokenHash?: string) => {
  return prisma.$transaction(async (tx) => {
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
      const { score, metrics, qualityFlags, finishedAt } = decryptResult(session)
      const config = decryptCognitivePayload<Record<string, unknown>>(session.configSnapshotEncrypted)
      const reference = resolveCognitiveReferenceForResult({
        testType: session.testType,
        metrics,
        score,
        qualityFlags,
        config,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        configVersion: session.configVersion,
      })
      return { sessionId, status: 'COMPLETED', finishedAt, score, metrics, qualityFlags, reference }
    }
    if (session.status === 'ABANDONED' || session.status === 'INVALID') {
      throw BAD_REQUEST(`Session is ${session.status} and cannot be completed`)
    }

    // IN_PROGRESS → 继续评分。

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
      result = entry.score({ config: validatedConfig, trials: scoringTrials })
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
        const reference = resolveCognitiveReferenceForResult({
          testType: reloaded.testType,
          metrics,
          score,
          qualityFlags,
          config: validatedConfig as Record<string, unknown>,
          engineVersion: reloaded.engineVersion,
          scoringVersion: reloaded.scoringVersion,
          configVersion: reloaded.configVersion,
        })
        return { sessionId, status: 'COMPLETED', finishedAt: fin, score, metrics, qualityFlags, reference }
      }
      throw CONFLICT('Session cannot be completed in its current state')
    }

    const reference = resolveCognitiveReferenceForResult({
      testType: session.testType,
      metrics: result.metrics,
      score: result.score,
      qualityFlags: result.qualityFlags,
      config: validatedConfig as Record<string, unknown>,
      engineVersion: session.engineVersion,
      scoringVersion: session.scoringVersion,
      configVersion: session.configVersion,
    })
    return { sessionId, status: 'COMPLETED', finishedAt, ...result, reference }
  })
}

export const completeSession = async (userId: string, sessionId: string) =>
  completeSessionWithPrincipal(userId, sessionId)

export const completeSessionForPublic = async (sessionId: string, recoveryTokenHash: string) =>
  completeSessionWithPrincipal(null, sessionId, recoveryTokenHash)
