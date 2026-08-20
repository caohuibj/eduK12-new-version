import { prisma } from '../../config/database'
import { decryptCognitivePayload } from './cognitive.security'
import type { PaginationParams } from '../../utils/pagination'

/** 学生自己的已完成记录；不返回 raw trial、密文或详细 metrics。 */
export const listMyHistory = async (userId: string, pagination: PaginationParams) => {
  const where = { userId, status: 'COMPLETED' as const }
  const [sessions, total] = await Promise.all([
    prisma.cognitiveSession.findMany({
      where,
      orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
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
    }),
    prisma.cognitiveSession.count({ where }),
  ])

  const list = sessions.flatMap((session) => {
    if (!session.scoreEncrypted || !session.qualityFlagsEncrypted) return []
    const score = decryptCognitivePayload<number>(session.scoreEncrypted)
    const qualityFlags = decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
    return [{
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
    }]
  })

  return { list, total }
}
