import { afterEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $executeRaw: vi.fn(),
  classroom: { findUnique: vi.fn() },
  classroomQuestion: { findFirst: vi.fn(), updateMany: vi.fn() },
  classroomSession: { findFirst: vi.fn() },
  classroomAnswer: { findUnique: vi.fn(), createMany: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/classroomDanmaku', () => ({ classroomDanmaku: {} }))

import { submitClassroomAnswer } from '../../services/classroomLifecycleService'

afterEach(() => vi.restoreAllMocks())

it('finishes one expired round once for 250 concurrent submissions, including an already-observed tail request', async () => {
  const startedAt = new Date('2020-01-01T00:00:00.000Z')
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    return { promise, resolve }
  }
  const endEntered = deferred(), releaseEnd = deferred(), allObserved = deferred(), releaseTail = deferred()
  let observed = 0, endWrites = 0
  db.$executeRaw.mockResolvedValue(1)
  db.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
  db.classroomQuestion.findFirst.mockResolvedValue({ id: 'q-expiry', startedAt, endedAt: null, timeLimit: 60 })
  db.classroomSession.findFirst.mockImplementation(async ({ where }) => ({ id: where.id }))
  db.classroomAnswer.findUnique.mockResolvedValue(null)
  db.classroomQuestion.updateMany.mockImplementation(async () => {
    endWrites++
    if (endWrites === 1) {
      endEntered.resolve()
      await releaseEnd.promise
      return { count: 1 }
    }
    return { count: 0 }
  })
  db.$transaction.mockImplementation(async callback => {
    const result = await callback(db)
    if (result.expired && ++observed === 250) {
      allObserved.resolve()
      // This transaction already saw expiry before the winner committed, but
      // its continuation reaches the end flow after that flow has completed.
      await releaseTail.promise
    }
    return result
  })
  const attempts = Array.from({ length: 250 }, (_, index) => submitClassroomAnswer({
    classroomId: 'c-expiry-singleflight', questionId: 'q-expiry',
    sessionId: 's-' + index, studentId: 'student-' + index, answer: 'A', expectedStartedAt: startedAt,
  }))
  const first = Promise.allSettled(attempts.slice(0, 249))
  const tail = Promise.allSettled(attempts.slice(249))
  await Promise.all([endEntered.promise, allObserved.promise])
  releaseEnd.resolve()
  const outcomes = await first
  releaseTail.resolve()
  outcomes.push(...await tail)

  const successful = outcomes.filter(outcome => outcome.status === 'fulfilled')
  expect(successful).toHaveLength(1)
  expect(successful[0]).toMatchObject({ value: { expired: true, alreadySubmitted: false, startedAt } })
  const failures = outcomes.filter(outcome => outcome.status === 'rejected')
  expect(failures).toHaveLength(249)
  for (const failure of failures) expect(failure).toMatchObject({ reason: { message: '答题已结束，无法提交答案', statusCode: 409 } })
  const exclusiveLocks = db.$executeRaw.mock.calls.filter(([sql]) => sql.join('').includes('FOR UPDATE'))
  expect(exclusiveLocks).toHaveLength(1)
  expect(db.classroomQuestion.updateMany).toHaveBeenCalledTimes(1)
  expect(db.classroomAnswer.createMany).not.toHaveBeenCalled()
})
