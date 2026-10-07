import type { Prisma } from '@prisma/client'
import { CONFLICT, NOT_FOUND } from './cognitive.errors'

type Tx = Prisma.TransactionClient

export async function cognitiveQuotaSource(db: Tx, assignmentId: string) {
  const assignment = await db.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('认知任务不存在')
  if (!assignment.quotaSourceAssignmentId) return assignment
  const source = await db.cognitiveAssignment.findUnique({ where: { id: assignment.quotaSourceAssignmentId } })
  if (!source || source.quotaSourceAssignmentId || source.createdBy !== assignment.createdBy || source.configId !== assignment.configId) {
    throw CONFLICT('认知任务来源关系需要核查，请联系教师')
  }
  return source
}

export async function lockCognitiveQuota(db: Tx, userId: string, sourceId: string) {
  await db.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `cognitive-quota:${sourceId}:${userId}`)
}

/** Caller holds this lock until the new session has been inserted. Counts all
 * statuses and exact historical item bindings, regardless of participant key. */
export async function admitCognitiveAttempt(db: Tx, userId: string, assignmentId: string) {
  const source = await cognitiveQuotaSource(db, assignmentId)
  await lockCognitiveQuota(db, userId, source.id)
  const used = await db.cognitiveSession.count({ where: { userId, OR: [
    { assignmentId: source.id },
    { assignment: { quotaSourceAssignmentId: source.id } },
    { compositeItem: { cognitiveAssignmentId: source.id } },
    { compositeItem: { cognitiveAssignment: { quotaSourceAssignmentId: source.id } } },
  ] } })
  if (used >= source.maxAttempts) throw CONFLICT('已达到该认知任务最大次数。独立入口和组合测评共用次数；可继续已有作答。')
}
