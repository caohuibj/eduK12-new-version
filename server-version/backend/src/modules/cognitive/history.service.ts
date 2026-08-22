import { prisma } from '../../config/database'
import { logger } from '../../utils/logger'
import { decryptCognitivePayload } from './cognitive.security'
import type { PaginationParams } from '../../utils/pagination'

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
  score: number
  qualityState: 'interpretable' | 'insufficient'
}

/** 学生自己的已完成记录；不返回 raw trial、密文或详细 metrics。 */
export const listMyHistory = async (userId: string, pagination: PaginationParams) => {
  const where = {
    userId,
    status: 'COMPLETED' as const,
    scoreEncrypted: { not: null },
    qualityFlagsEncrypted: { not: null },
    compositeAttemptId: null,
  }
  const sessions = await prisma.cognitiveSession.findMany({
    where,
    orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      assignmentId: true,
      testType: true,
      attemptNo: true,
      configVersion: true,
      engineVersion: true,
      scoringVersion: true,
      finishedAt: true,
      scoreEncrypted: true,
      qualityFlagsEncrypted: true,
      assignment: { select: { title: true } },
    },
  })

  const displayable: HistoryRow[] = []
  for (const session of sessions) {
    try {
      const score = decryptCognitivePayload<number>(session.scoreEncrypted as string)
      const qualityFlags = decryptCognitivePayload<Record<string, unknown>>(
        session.qualityFlagsEncrypted as string
      )
      displayable.push({
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
        qualityState: qualityFlags.interpretable === false ? 'insufficient' : 'interpretable',
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
