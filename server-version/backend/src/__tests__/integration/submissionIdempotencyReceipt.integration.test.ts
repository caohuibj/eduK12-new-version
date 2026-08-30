import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'

/**
 * Real PostgreSQL regression for delayed keyed retries.  The first request is
 * committed, a newer key updates the mutable submission row, and the old key
 * is replayed from its immutable receipt.  The final row must remain the
 * newer payload for both assignment and authenticated check-in submissions.
 */
const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let assignmentController: typeof import('../../controllers/assignmentController')['assignmentController']
let checkinController: typeof import('../../controllers/checkinController')['checkinController']
let userId = ''
let courseId = ''
let assignmentId = ''
let checkinId = ''

const invoke = async (controller: any, id: string, body: unknown, key: string) => {
  const req = {
    user: { userId, role: 'STUDENT' },
    params: { id },
    body,
    header: (name: string) => name === 'Idempotency-Key' ? key : undefined,
  }
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(value: unknown) {
      this.body = value
      return this
    },
  }
  await controller.submit(req, res)
  return res
}

suite('submission idempotency receipts (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    assignmentController = (await import('../../controllers/assignmentController')).assignmentController
    checkinController = (await import('../../controllers/checkinController')).checkinController

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: { username: `receipt-${suffix}`, passwordHash: 'test-only', role: 'STUDENT' },
    })
    userId = user.id
    const course = await prisma.course.create({
      data: { title: `receipt-course-${suffix}`, courseCode: `RC${suffix}`, creatorId: userId },
    })
    courseId = course.id
    await prisma.courseStudent.create({
      data: { courseId, studentId: userId, status: 'ACTIVE' },
    })
    const assignment = await prisma.assignment.create({
      data: { courseId, title: `receipt-assignment-${suffix}`, status: 'PUBLISHED' },
    })
    assignmentId = assignment.id
    const checkin = await prisma.checkin.create({
      data: { courseId, creatorId: userId, title: `receipt-checkin-${suffix}` },
    })
    checkinId = checkin.id
  })

  afterAll(async () => {
    try {
      if (courseId) await prisma.course.delete({ where: { id: courseId } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('replays an old assignment key without overwriting a newer payload', async () => {
    const first = await invoke(assignmentController, assignmentId, { content: 'answer A' }, 'receipt-assignment-k1')
    expect(first.statusCode).toBe(200)
    const second = await invoke(assignmentController, assignmentId, { content: 'answer B' }, 'receipt-assignment-k2')
    expect(second.statusCode).toBe(200)
    const delayed = await invoke(assignmentController, assignmentId, { content: 'answer A' }, 'receipt-assignment-k1')
    expect(delayed.statusCode).toBe(200)
    expect(delayed.body.data.content).toBe('answer A')

    const row = await prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: userId } },
    })
    expect(row?.content).toBe('answer B')
    expect(await prisma.submissionIdempotencyReceipt.count({ where: { assignmentId, studentId: userId } })).toBe(2)
  })

  it('replays an old check-in key without overwriting a newer payload', async () => {
    const first = await invoke(checkinController, checkinId, { content: 'today A', images: [] }, 'receipt-checkin-k1')
    expect(first.statusCode).toBe(200)
    const second = await invoke(checkinController, checkinId, { content: 'today B', images: [] }, 'receipt-checkin-k2')
    expect(second.statusCode).toBe(200)
    const delayed = await invoke(checkinController, checkinId, { content: 'today A', images: [] }, 'receipt-checkin-k1')
    expect(delayed.statusCode).toBe(200)
    expect(delayed.body.data.content).toBe('today A')

    const row = await prisma.checkinSubmission.findUnique({
      where: { checkinId_studentId: { checkinId, studentId: userId } },
    })
    expect(row?.content).toBe('today B')
    expect(await prisma.checkinSubmissionIdempotencyReceipt.count({ where: { checkinId, studentId: userId } })).toBe(2)
  })
})
