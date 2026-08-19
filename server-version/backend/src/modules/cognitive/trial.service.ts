import { prisma } from '../../config/database'
import { encryptCognitivePayload, hashTrialPayload } from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'

/**
 * D5 — Append-only Trial API 服务。
 *
 * 边界（D5 §3 / §17）：只做单 trial append；
 * 不做 update/delete/bulk/history、不做 Completion/Scoring/metrics/quality flags；
 * 不接受 client-provided payloadHash / encrypted payload；
 * 不引 Redis queue / offline sync；不加新 migration。
 */

const isPrismaUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'

/**
 * 单 Trial append（D5 §6–§10）。
 * - 写前校验：session 存在 + owner + IN_PROGRESS + Registry entry（不重查 membership/时间窗，
 *   资格已由 D4 冻结；避免 dueAt 进行中到点阻止写入）。
 * - payload 必须过 Registry trialSchema；成功后只加密/哈希 **parsed 值**，绝不加密原始 body。
 * - 幂等：同 index + 同 payloadHash → replay 返回 existing；同 index + 不同 hash → 409 不覆盖。
 * - 允许 out-of-order arrival，不检查 nextTrialIndex == count。
 */
export const appendTrial = async (
  userId: string,
  sessionId: string,
  input: { trialIndex: number; payload?: unknown }
) => {
  const session = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== userId) throw FORBIDDEN('Not the owner of this session')
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

  try {
    const trial = await prisma.cognitiveTrial.create({
      data: {
        sessionId,
        trialIndex: input.trialIndex,
        payloadEncrypted,
        payloadHash,
      },
    })
    return { trialId: trial.id, trialIndex: trial.trialIndex, createdAt: trial.createdAt }
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      // @@unique([sessionId, trialIndex]) 冲突：区分 replay 与冲突。
      const existing = await prisma.cognitiveTrial.findUnique({
        where: { sessionId_trialIndex: { sessionId, trialIndex: input.trialIndex } },
      })
      if (existing && existing.payloadHash === payloadHash) {
        // replay：幂等返回 existing，不新增。
        return { trialId: existing.id, trialIndex: existing.trialIndex, createdAt: existing.createdAt }
      }
      // 同 index 不同 payload：409，绝不覆盖首份 raw trial（不 UPDATE / 不 DELETE 重插 / 不 last-write-wins）。
      throw CONFLICT(`Trial index ${input.trialIndex} already exists with different content`)
    }
    throw err
  }
}
