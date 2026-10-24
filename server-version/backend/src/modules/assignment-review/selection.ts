import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { config } from '../../config'
import { prisma } from '../../config/database'

export const REVIEW_PAGE_SIZE = 25
export const REVIEW_BATCH_SIZE = 100
export const REVIEW_SELECTION_LIMIT = 5000
const item = z.object({ id: z.string().min(1).max(100), revision: z.number().int().nonnegative() })
const snapshot = z.object({ actor: z.string(), assignment: z.string(), expires: z.number(), selectionId: z.string().guid(), index: z.number().int().nonnegative(), total: z.number().int().nonnegative().max(REVIEW_SELECTION_LIMIT), items: z.array(item).max(REVIEW_BATCH_SIZE) })
export type ReviewSelection = z.infer<typeof snapshot>
export class ReviewInputError extends Error {}
const sign = (value: string) => createHmac('sha256', config.jwtSecret).update('assignment-review-v1:' + value).digest('base64url')
export function freezeSelection(actor: string, assignment: string, items: ReviewSelection['items']) {
  if (items.length > REVIEW_SELECTION_LIMIT) throw new ReviewInputError(`全部选择最多支持 ${REVIEW_SELECTION_LIMIT} 份，请按本页分批批改`)
  const expires = Date.now() + 15 * 60 * 1000
  const selectionId = randomUUID()
  const chunks: string[] = []
  for (let offset = 0; offset < items.length; offset += REVIEW_BATCH_SIZE) {
    const data = snapshot.parse({ actor, assignment, expires, selectionId, index: chunks.length, total: items.length, items: items.slice(offset, offset + REVIEW_BATCH_SIZE) })
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url')
    chunks.push(encoded + '.' + sign(encoded))
  }
  return { selectionId, chunks, count: items.length, expiresAt: new Date(expires).toISOString() }
}
export function readSelection(token: unknown, actor: string, assignment: string): ReviewSelection {
  if (typeof token !== 'string' || token.length > 30000) throw new ReviewInputError('选择已失效，请重新选择')
  const [encoded, signature, extra] = token.split('.')
  const expected = sign(encoded || '')
  if (extra || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new ReviewInputError('选择已失效，请重新选择')
  let parsed: ReviewSelection
  try { parsed = snapshot.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString())) } catch { throw new ReviewInputError('选择已失效，请重新选择') }
  if (parsed.actor !== actor || parsed.assignment !== assignment || parsed.expires <= Date.now()) throw new ReviewInputError('选择已失效，请重新选择')
  return parsed
}
export function reviewCursor(cursor: unknown) {
  if (cursor === undefined) return undefined
  if (typeof cursor !== 'string' || cursor.length > 500) throw new ReviewInputError('提交列表游标无效')
  try { return z.object({ id: z.string().min(1).max(100) }).parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())) } catch { throw new ReviewInputError('提交列表游标无效') }
}
export function nextReviewCursor(row: { id: string }) {
  return Buffer.from(JSON.stringify({ id: row.id })).toString('base64url')
}

// Share submit's advisory locks: revision checking alone cannot serialize with an in-flight submit.
export async function gradeReviewChunk(assignmentId: string, items: ReviewSelection['items'], comment: string, actor: string, isAdmin: boolean) {
  if (items.length > REVIEW_BATCH_SIZE) throw new ReviewInputError('批次过大')
  if (!items.length) return { count: 0 }
  return prisma.$transaction(async tx => {
    const rows = await tx.submission.findMany({ where: { assignmentId, id: { in: items.map(item => item.id) } }, select: { studentId: true }, take: REVIEW_BATCH_SIZE })
    const keys = [...new Set(rows.map(row => `assignment-submission:${assignmentId}:${row.studentId}`))].sort()
    for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
    return tx.submission.updateMany({
      where: { assignmentId, ...(isAdmin ? {} : { assignment: { course: { creatorId: actor } } }), status: { not: 'GRADED' }, OR: items.map(item => ({ id: item.id, revision: item.revision })) },
      data: { comment, status: 'GRADED', reviewedAt: new Date(), revision: { increment: 1 } },
    })
  })
}
