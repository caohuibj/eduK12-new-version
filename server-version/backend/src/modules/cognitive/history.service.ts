import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { decryptCognitivePayload } from './cognitive.security'
import type { PaginationParams } from '../../utils/pagination'
import { BAD_REQUEST } from './cognitive.errors'

const CURSOR_VERSION = 1

export interface CognitiveHistoryCursor {
  v: typeof CURSOR_VERSION
  id: string
  finishedAt: string | null
  createdAt: string
}

export interface HistoryOffsetResult<T = CognitiveHistoryItem> {
  list: T[]
  total: number
}

export interface HistoryCursorResult<T = CognitiveHistoryItem> {
  list: T[]
  nextCursor: string | null
  hasMore: boolean
}

export type CognitiveHistoryResult = HistoryOffsetResult | HistoryCursorResult

export interface CognitiveHistoryItem {
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

/**
 * Encode the complete ordering tuple, not just the last id. The tuple makes
 * the token stable when several sessions share the same completion timestamp.
 */
export const encodeHistoryCursor = (session: {
  id: string
  finishedAt: Date | null
  createdAt: Date
}): string => Buffer.from(JSON.stringify({
  v: CURSOR_VERSION,
  id: session.id,
  finishedAt: session.finishedAt?.toISOString() ?? null,
  createdAt: session.createdAt.toISOString(),
} satisfies CognitiveHistoryCursor)).toString('base64url')

export const decodeHistoryCursor = (token: string): CognitiveHistoryCursor => {
  try {
    const value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Partial<CognitiveHistoryCursor>
    const createdAt = typeof value.createdAt === 'string' ? new Date(value.createdAt) : null
    const finishedAt = value.finishedAt === null
      ? null
      : typeof value.finishedAt === 'string'
        ? new Date(value.finishedAt)
        : undefined

    if (
      value.v !== CURSOR_VERSION ||
      typeof value.id !== 'string' ||
      value.id.length === 0 ||
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      finishedAt === undefined ||
      (finishedAt !== null && Number.isNaN(finishedAt.getTime()))
    ) {
      throw new Error('invalid cursor')
    }

    return {
      v: CURSOR_VERSION,
      id: value.id,
      finishedAt: finishedAt?.toISOString() ?? null,
      createdAt: createdAt.toISOString(),
    }
  } catch {
    throw BAD_REQUEST('Invalid cognitive history cursor')
  }
}

const historyOrderBy = [
  { finishedAt: { sort: 'desc' as const, nulls: 'last' as const } },
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
]

const afterCursorWhere = (cursor: CognitiveHistoryCursor): Prisma.CognitiveSessionWhereInput => {
  const createdAt = new Date(cursor.createdAt)
  const id = cursor.id

  if (cursor.finishedAt === null) {
    return {
      finishedAt: null,
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lt: id } },
      ],
    }
  }

  const finishedAt = new Date(cursor.finishedAt)
  return {
    OR: [
      { finishedAt: { lt: finishedAt } },
      { finishedAt, createdAt: { lt: createdAt } },
      { finishedAt, createdAt, id: { lt: id } },
      // Completed legacy rows may have no finishedAt. They sort after all
      // non-null completion timestamps because the order explicitly uses
      // NULLS LAST.
      { finishedAt: null },
    ],
  }
}

const toHistoryItem = (session: {
  id: string
  assignmentId: string | null
  testType: string
  attemptNo: number
  configVersion: string
  engineVersion: string
  scoringVersion: string
  finishedAt: Date | null
  scoreEncrypted: string | null
  qualityFlagsEncrypted: string | null
  assignment: { title: string } | null
}): CognitiveHistoryItem | null => {
  if (!session.scoreEncrypted || !session.qualityFlagsEncrypted) return null
  const score = decryptCognitivePayload<number>(session.scoreEncrypted)
  const qualityFlags = decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
  return {
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
  }
}

/** 学生自己的已完成记录；不返回 raw trial、密文或详细 metrics。 */
export const listMyHistory = async (
  userId: string,
  pagination: PaginationParams
): Promise<CognitiveHistoryResult> => {
  // History is read through the pseudonymous identity boundary rather than
  // joining cognitive records directly to the application user row.
  const identity = await prisma.participantIdentity.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!identity) {
    return pagination.cursorMode
      ? { list: [], nextCursor: null, hasMore: false }
      : { list: [], total: 0 }
  }

  const baseWhere: Prisma.CognitiveSessionWhereInput = {
    participantIdentityId: identity.id,
    status: 'COMPLETED' as const,
  }
  const where: Prisma.CognitiveSessionWhereInput = pagination.cursorMode && pagination.cursor
    ? { ...baseWhere, ...afterCursorWhere(decodeHistoryCursor(pagination.cursor)) }
    : baseWhere
  const select = {
    id: true,
    assignmentId: true,
    testType: true,
    attemptNo: true,
    configVersion: true,
    engineVersion: true,
    scoringVersion: true,
    finishedAt: true,
    createdAt: true,
    scoreEncrypted: true,
    qualityFlagsEncrypted: true,
    assignment: { select: { title: true } },
  } as const

  if (pagination.cursorMode) {
    const sessions = await prisma.cognitiveSession.findMany({
      where,
      orderBy: historyOrderBy,
      take: pagination.take + 1,
      select,
    })
    const hasMore = sessions.length > pagination.take
    const page = hasMore ? sessions.slice(0, pagination.take) : sessions
    const last = page.at(-1)
    return {
      list: page.flatMap((session) => {
        const item = toHistoryItem(session)
        return item ? [item] : []
      }),
      nextCursor: hasMore && last ? encodeHistoryCursor(last) : null,
      hasMore,
    }
  }

  const [sessions, total] = await Promise.all([
    prisma.cognitiveSession.findMany({
      where,
      orderBy: historyOrderBy,
      skip: pagination.skip,
      take: pagination.take,
      select,
    }),
    prisma.cognitiveSession.count({ where }),
  ])

  return {
    list: sessions.flatMap((session) => {
      const item = toHistoryItem(session)
      return item ? [item] : []
    }),
    total,
  }
}
