import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { course: { findUnique: vi.fn() }, checkinSchedule: { findMany: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/checkinScheduleService', () => ({ publishDueCheckinSchedule: vi.fn() }))
import { checkinScheduleController, createScheduleSchema } from '../../controllers/checkinScheduleController'
const res = () => { const value: any = {}; value.status = vi.fn(() => value); value.json = vi.fn(() => value); return value }
beforeEach(() => vi.clearAllMocks())
describe('checkin schedule authorization and input', () => {
  it('rejects student scheduling before touching the database', async () => {
    const response = res()
    await checkinScheduleController.create({ user: { role: 'STUDENT', userId: 'student' }, body: {} } as any, response)
    expect(response.status).toHaveBeenCalledWith(403); expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects a different course owner before exposing templates', async () => {
    db.course.findUnique.mockResolvedValue({ creatorId: 'other', courseType: 'LEGACY_COURSE' })
    const response = res()
    await checkinScheduleController.list({ user: { role: 'TEACHER', userId: 'owner' }, query: { courseId: 'course' } } as any, response)
    expect(response.status).toHaveBeenCalledWith(403); expect(db.checkinSchedule.findMany).not.toHaveBeenCalled()
  })
  it('binds stopping to both the creator and current course owner', async () => {
    db.checkinSchedule.updateMany.mockResolvedValue({ count: 0 })
    const response = res()
    await checkinScheduleController.stop({ user: { role: 'TEACHER', userId: 'owner' }, params: { scheduleId: 'foreign' } } as any, response)
    expect(db.checkinSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'foreign', creatorId: 'owner', course: expect.objectContaining({ creatorId: 'owner' }) }) }))
    expect(response.status).toHaveBeenCalledWith(403)
  })
  it('returns a bounded metadata projection without loading template bodies', async () => {
    db.course.findUnique.mockResolvedValue({ creatorId: 'owner', courseType: 'LEGACY_COURSE' })
    db.$queryRaw.mockResolvedValue([{ id: 'schedule', title: '每日复盘' }])
    const response = res()
    await checkinScheduleController.list({ user: { role: 'TEACHER', userId: 'owner' }, query: { courseId: 'course' } } as any, response)
    const [sql, ...parameters] = db.$queryRaw.mock.calls[0]
    expect(sql.join('')).toContain("template->>'title'"); expect(sql.join('')).toContain('LIMIT 100')
    expect(parameters).toEqual(['course', 'owner'])
    expect(db.checkinSchedule.findMany).not.toHaveBeenCalled()
    expect(response.json.mock.calls[0][0].data.list).toEqual([{ id: 'schedule', title: '每日复盘' }])
  })
  it('reports storage failures instead of leaving an unhandled promise', async () => {
    db.course.findUnique.mockRejectedValue(new Error('private failure'))
    const response = res()
    await checkinScheduleController.list({ user: { role: 'TEACHER', userId: 'owner' }, query: { courseId: 'course' } } as any, response)
    expect(response.status).toHaveBeenCalledWith(500)
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private failure')
  })
  const valid = { template: { courseId: 'course', title: '每日复盘', submissions: [{ id: 'old' }], endTime: '2020-01-01', allowAnonymous: true }, firstPublishAt: '2026-10-21T12:00:00Z', intervalDays: 1, durationHours: 24, timezone: 'Asia/Shanghai' }
  it('only accepts the content allowlist, never old submissions, deadlines or anonymous tokens', () => {
    const template = createScheduleSchema.parse(valid).template
    expect(template).not.toHaveProperty('submissions'); expect(template).not.toHaveProperty('endTime'); expect(template).not.toHaveProperty('allowAnonymous')
  })
  it.each([{ intervalDays: 0 }, { intervalDays: 1.5 }, { intervalDays: 366 }, { durationHours: 0 }, { durationHours: 8761 }, { timezone: 'invalid' }, { firstPublishAt: '2026-10-21T12:00' }])('rejects unsafe or ambiguous scheduling values %j', change => expect(createScheduleSchema.safeParse({ ...valid, ...change }).success).toBe(false))
})
