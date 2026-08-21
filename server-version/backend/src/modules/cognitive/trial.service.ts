import { prisma } from '../../config/database'
import { encryptCognitivePayload, hashTrialPayload } from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { lockSession } from './session-lock'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'

/**
 * D5 — Append-only Trial API 服务。
 *
 * 边界（D5 §3 / §17）：只做单 trial append；
 * 不做 update/delete/bulk/history、不做 Completion/Scoring/metrics/quality flags；
 * 不接受 client-provided payloadHash / encrypted payload；
 * 不引 Redis queue / offline sync；不加新 migration。
 *
 * D6.1（P0 并发修复）：整个 append 在 DB transaction + Session 行锁（FOR UPDATE）内执行，
 * 锁内 校验状态 → trialSchema → hash+encrypt → 查重 → insert，杜绝
 * append 与 complete/restart 交错导致的"评分数据集 != 完成时冻结数据集"。
 */

/**
 * 单 Trial append（D5 §6–§10 + D6.1）。
 * - 写前校验：session 存在 + owner + IN_PROGRESS + Registry entry（不重查 membership/时间窗，
 *   资格已由 D4 冻结；避免 dueAt 进行中到点阻止写入）。
 * - payload 必须过 Registry trialSchema；成功后只加密/哈希 **parsed 值**，绝不加密原始 body。
 * - 幂等：同 index + 同 payloadHash → replay 返回 existing；同 index + 不同 hash → 409 不覆盖。
 * - 允许 out-of-order arrival，不检查 nextTrialIndex == count。
 */
const appendTrialWithPrincipal = async (
  userId: string | null,
  sessionId: string,
  input: { trialIndex: number; payload?: unknown },
  recoveryTokenHash?: string
) => {
  return prisma.$transaction(async (tx) => {
    // 行锁：同一 Session 的并发写（append/complete/restart）在此排队。
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
    if (session.status !== 'IN_PROGRESS') throw BAD_REQUEST('Session is not IN_PROGRESS')

    const entry = requireCognitiveRegistryEntry(
      session.testType,
      session.engineVersion,
      session.scoringVersion
    )

    const parsed = entry.trialSchema.safeParse(input.payload)
    if (!parsed.success) throw BAD_REQUEST('Invalid trial payload for this test type')

    const payloadHash = hashTrialPayload(parsed.data)
    const payloadEncrypted = encryptCognitivePayload(parsed.data)

    // 锁内查重（无需依赖 P2002）：同 index 同 hash → replay；异 hash → 409 绝不覆盖。
    const existing = await tx.cognitiveTrial.findUnique({
      where: { sessionId_trialIndex: { sessionId, trialIndex: input.trialIndex } },
    })
    if (existing) {
      if (existing.payloadHash === payloadHash) {
        return { trialId: existing.id, trialIndex: existing.trialIndex, createdAt: existing.createdAt }
      }
      throw CONFLICT(`Trial index ${input.trialIndex} already exists with different content`)
    }

    const trial = await tx.cognitiveTrial.create({
      data: {
        sessionId,
        trialIndex: input.trialIndex,
        payloadEncrypted,
        payloadHash,
      },
    })
    return { trialId: trial.id, trialIndex: trial.trialIndex, createdAt: trial.createdAt }
  })
}

export const appendTrial = async (
  userId: string,
  sessionId: string,
  input: { trialIndex: number; payload?: unknown }
) => appendTrialWithPrincipal(userId, sessionId, input)

export const appendTrialForPublic = async (
  sessionId: string,
  recoveryTokenHash: string,
  input: { trialIndex: number; payload?: unknown }
) => appendTrialWithPrincipal(null, sessionId, input, recoveryTokenHash)
