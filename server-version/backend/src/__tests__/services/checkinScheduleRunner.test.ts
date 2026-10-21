import { beforeEach, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { checkinSchedule: { findMany: vi.fn() }, $transaction: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../services/assetStorage', () => ({ syncAssetReferences: vi.fn(), validateAssetReferencesForCourse: vi.fn() }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
it('bounds each batch and advances past failing rows so other courses are not starved', async () => {
  const { runDueCheckinSchedules } = await import('../../services/checkinScheduleService')
  const at = new Date('2030-01-01T09:00:00Z')
  db.checkinSchedule.findMany.mockResolvedValueOnce([{ id: 'broken', nextPublishAt: at }]).mockResolvedValueOnce([{ id: 'other', nextPublishAt: at }])
  db.$transaction.mockRejectedValueOnce(new Error('synthetic attachment failure')).mockResolvedValue(null)
  await runDueCheckinSchedules(at); await runDueCheckinSchedules(at)
  expect(db.checkinSchedule.findMany.mock.calls[0][0]).toMatchObject({ take: 50, where: { active: true, nextPublishAt: { lte: at } } })
  expect(db.checkinSchedule.findMany.mock.calls[1][0].where.OR).toEqual([{ nextPublishAt: { gt: at } }, { nextPublishAt: at, id: { gt: 'broken' } }])
  expect(db.$transaction).toHaveBeenCalledTimes(2)
})
it('wraps the cursor after the final page, allowing failed schedules to retry', async () => {
  const { runDueCheckinSchedules } = await import('../../services/checkinScheduleService')
  const at = new Date('2030-01-01T09:00:00Z')
  db.checkinSchedule.findMany.mockResolvedValueOnce([{ id: 'last', nextPublishAt: at }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
  db.$transaction.mockResolvedValue(null)
  await runDueCheckinSchedules(at); await runDueCheckinSchedules(at)
  expect(db.checkinSchedule.findMany.mock.calls[2][0].where).not.toHaveProperty('OR')
})
it('does not overlap timer executions in a single process', async () => {
  const { runDueCheckinSchedules } = await import('../../services/checkinScheduleService')
  let resolve!: (value: unknown[]) => void
  db.checkinSchedule.findMany.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const pending = runDueCheckinSchedules()
  await runDueCheckinSchedules()
  expect(db.checkinSchedule.findMany).toHaveBeenCalledTimes(1)
  resolve([]); await pending
})
