import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, wire } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $executeRaw: vi.fn(),
    classroom: { findUnique: vi.fn(), update: vi.fn() },
    classroomQuestion: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    classroomSession: { findFirst: vi.fn(), count: vi.fn() },
    classroomAnswer: { findUnique: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  },
  wire: { broadcastToRoom: vi.fn(), sendToClassroomManagers: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/socketService', () => ({ socketService: wire }))
vi.mock('../../services/classroomDanmaku', () => ({ classroomDanmaku: {}, DanmakuError: class extends Error {} }))
vi.mock('../../services/statsAggregator', () => ({ StatsAggregator: vi.fn() }))
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { ClassroomSocketHandler } from '../../services/classroomSocketHandler'
import { endClassroomQuestion, startClassroomQuestion } from '../../services/classroomLifecycleService'

const startedAt = new Date('2026-11-27T08:00:00.000Z')
const nextStartedAt = new Date('2026-11-27T08:00:02.000Z')
const question = () => ({ id: 'q', startedAt, endedAt: null, timeLimit: 120, questionContent: { type: 'single_choice' } })
const socket = () => ({ data: { clientRole: 'student', classroomId: 'c', sessionId: 's', studentId: 'temp_s' }, emit: vi.fn() })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-27T08:00:03.000Z'))
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async callback => callback(db))
  db.$executeRaw.mockResolvedValue(1)
  db.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
  db.classroomQuestion.findFirst.mockImplementation(async () => question())
  db.classroomQuestion.updateMany.mockResolvedValue({ count: 1 })
  db.classroomSession.findFirst.mockResolvedValue({ id: 's' })
  db.classroomSession.count.mockResolvedValue(1)
  db.classroomAnswer.findUnique.mockResolvedValue(null)
  db.classroomAnswer.createMany.mockResolvedValue({ count: 1 })
  db.classroomAnswer.count.mockResolvedValue(1)
  db.classroomAnswer.findMany.mockResolvedValue([{ answer: 'A' }])
  wire.sendToClassroomManagers.mockResolvedValue(undefined)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('authoritative classroom round boundaries', () => {
  it.each([0, 1000])('advances a same-question restart marker beyond its previous timestamp despite %i ms clock rollback', async offset => {
    const previous = new Date(Date.now() + offset)
    db.classroomQuestion.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...question(), startedAt: previous, endedAt: new Date() })
    db.classroomQuestion.findUnique.mockResolvedValue({ ...question(), startedAt: new Date(previous.getTime() + 1) })
    const result = await startClassroomQuestion({ id: 'c', creatorId: 't', status: 'ACTIVE', courseId: 'course', course: { creatorId: 't' } }, 'q', 120)
    expect(result.kind).toBe('started')
    expect(db.classroomQuestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startedAt: new Date(previous.getTime() + 1) }) }))
  })
  it('returns the actual end round and rejects a stale marker even when that question is already ended', async () => {
    const ended = await endClassroomQuestion('c', 'q')
    expect(ended).toMatchObject({ changed: true, startedAt, endedAt: new Date() })
    db.classroomQuestion.findFirst.mockResolvedValue({ ...question(), startedAt: nextStartedAt, endedAt: new Date() })
    expect(await endClassroomQuestion('c', 'q', { expectedStartedAt: startedAt })).toMatchObject({ changed: false, staleRound: true, startedAt: nextStartedAt })
    expect(db.classroomQuestion.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each(['handleTeacherEnd', 'handleBigscreenClose'])('binds legacy %s requests to the authoritative round', async method => {
    const handler = new ClassroomSocketHandler()
    vi.spyOn(handler as any, 'authorizeManagerAction').mockResolvedValue({ id: 'c', status: 'ACTIVE' })
    await (handler as any)[method](socket(), { questionId: 'q' })
    expect(wire.broadcastToRoom).toHaveBeenCalledWith('classroom:c', 'broadcast:finished', { questionId: 'q', startedAt: startedAt.toISOString(), endedAt: new Date().toISOString() })
  })

  it('rejects stale bigscreen end and next commands without broadcasting', async () => {
    const handler = new ClassroomSocketHandler(), actor = socket()
    vi.spyOn(handler as any, 'authorizeManagerAction').mockResolvedValue({ id: 'c', status: 'ACTIVE' })
    db.classroomQuestion.findFirst.mockResolvedValue({ ...question(), startedAt: nextStartedAt })
    await (handler as any).handleBigscreenClose(actor, { questionId: 'q', startedAt: startedAt.toISOString() })
    await (handler as any).handleTeacherNext(actor, { expectedQuestionId: 'q', expectedStartedAt: startedAt.toISOString() })
    expect(wire.broadcastToRoom).not.toHaveBeenCalled()
    expect(actor.emit).toHaveBeenCalledWith('error', { message: '题目已重新开始，请刷新后操作' })
    await (handler as any).handleTeacherNext(actor, {})
    expect(wire.broadcastToRoom).toHaveBeenCalledWith('classroom:c', 'broadcast:next', { expectedQuestionId: 'q', expectedStartedAt: nextStartedAt.toISOString() })
  })

  it('acknowledges a repeated answer without scheduling statistics and still allows an explicit authoritative read', async () => {
    const handler = new ClassroomSocketHandler(), actor = socket()
    const schedule = vi.spyOn(handler, 'notifyAnswerSubmitted')
    db.classroomAnswer.findUnique.mockResolvedValue({ answer: 'A' })
    await (handler as any).handleStudentSubmit(actor, { questionId: 'q', answer: 'A' })
    await (handler as any).handleStudentSubmit(actor, { questionId: 'q', answer: 'A' })
    expect(actor.emit).toHaveBeenCalledWith('student:submitted', { questionId: 'q', success: true, startedAt: startedAt.toISOString() })
    expect(schedule).not.toHaveBeenCalled()
    expect(db.classroomAnswer.createMany).not.toHaveBeenCalled()
    expect(await handler.readQuestionStats('c', 'q')).toMatchObject({ questionId: 'q', startedAt: startedAt.toISOString(), answerCount: 1 })
  })

  it('schedules the first accepted answer with its actual round', async () => {
    const handler = new ClassroomSocketHandler()
    const schedule = vi.spyOn(handler, 'notifyAnswerSubmitted')
    await (handler as any).handleStudentSubmit(socket(), { questionId: 'q', answer: 'A' })
    expect(schedule).toHaveBeenCalledWith('c', 'q', startedAt)
  })

  it('does not clear a new-round timer when an old end notification completes', async () => {
    const handler = new ClassroomSocketHandler()
    ;(handler as any).scheduleQuestionTimer('c', 'q', 120, startedAt)
    ;(handler as any).scheduleQuestionTimer('c', 'q', 120, nextStartedAt)
    await handler.notifyQuestionEnded('c', 'q', startedAt, new Date())
    expect([...(handler as any).activeTimers.keys()]).toEqual(['c:q:' + nextStartedAt.toISOString()])
  })

  it('suppresses an in-flight old statistics rebuild after a same-question restart', async () => {
    const handler = new ClassroomSocketHandler()
    let finish!: (value: unknown) => void
    vi.spyOn(handler as any, 'buildStats').mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce({ questionId: 'q', startedAt: nextStartedAt.toISOString(), answerCount: 1 })
    handler.notifyAnswerSubmitted('c', 'q', startedAt)
    await vi.advanceTimersByTimeAsync(300)
    ;(handler as any).scheduleQuestionTimer('c', 'q', 120, nextStartedAt)
    handler.notifyAnswerSubmitted('c', 'q', nextStartedAt)
    handler.notifyAnswerSubmitted('c', 'q', startedAt)
    expect((handler as any).pendingStatsRounds.get('c:q')).toBe(nextStartedAt.toISOString())
    finish({ questionId: 'q', startedAt: startedAt.toISOString(), answerCount: 1 })
    await Promise.resolve(); await Promise.resolve()
    expect(wire.sendToClassroomManagers).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(wire.sendToClassroomManagers).toHaveBeenCalledWith('c', 'broadcast:stats', expect.objectContaining({ startedAt: nextStartedAt.toISOString() }))
  })

  it('retains the round marker when an end flush fails so its scheduled retry can still publish', async () => {
    const handler = new ClassroomSocketHandler()
    vi.spyOn(handler as any, 'buildStats').mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce({ questionId: 'q', startedAt: startedAt.toISOString(), answerCount: 1 })
    handler.notifyAnswerSubmitted('c', 'q', startedAt)
    await handler.notifyQuestionEnded('c', 'q', startedAt, new Date())
    expect((handler as any).pendingStatsRounds.get('c:q')).toBe(startedAt.toISOString())
    await vi.advanceTimersByTimeAsync(1000)
    expect(wire.sendToClassroomManagers).toHaveBeenCalledWith('c', 'broadcast:stats', expect.objectContaining({ startedAt: startedAt.toISOString() }))
  })

  it('does not return aggregate rows read across two rounds under an old marker', async () => {
    const handler = new ClassroomSocketHandler()
    db.classroomQuestion.findFirst.mockResolvedValueOnce(question()).mockResolvedValueOnce({ startedAt: nextStartedAt })
    expect(await handler.readQuestionStats('c', 'q', startedAt)).toBeNull()
  })
})
