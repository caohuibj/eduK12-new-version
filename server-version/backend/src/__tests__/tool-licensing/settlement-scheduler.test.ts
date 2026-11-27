import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startToolLicenseSettlement } from '../../modules/tool-licensing/settlement'

const database = vi.hoisted(() => ({ probe: vi.fn(), transaction: vi.fn(), settle: vi.fn() }))
vi.mock('../../config/database', () => ({
  prisma: { $queryRaw: database.probe, $transaction: database.transaction },
}))

beforeEach(() => {
  vi.useFakeTimers()
  for (const product of ['SCHOOL', 'TEACHER']) {
    vi.stubEnv(product + '_STANDARD_TOOL_LICENSING_ENABLED', 'false')
    vi.stubEnv(product + '_TOOL_LICENSING_ENABLED', 'false')
  }
  database.transaction.mockImplementation(run => run({ $queryRaw: database.settle }))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

it('probes the pending settlement index without opening a write transaction on a fresh installation', async () => {
  database.probe.mockResolvedValue([])
  const stop = startToolLicenseSettlement(vi.fn())
  await vi.advanceTimersByTimeAsync(60_000)
  stop()
  expect(database.probe).toHaveBeenCalledTimes(2)
  expect(database.probe.mock.calls[0][0].join('')).toContain('WHERE EXISTS')
  expect(database.transaction).not.toHaveBeenCalled()
})

it('settles booked quota after disabling both education rollout flags, using the previous fence', async () => {
  const first = { before: new Date('2026-11-28T00:00:00Z'), xid: '180' }
  const next = { before: new Date('2026-11-28T00:01:00Z'), xid: '181' }
  database.probe.mockResolvedValueOnce([first]).mockResolvedValueOnce([next]).mockResolvedValue([])
  database.settle.mockResolvedValueOnce([{ id: 'reserved-publication', released: 2 }]).mockResolvedValue([])
  const onError = vi.fn()
  const stop = startToolLicenseSettlement(onError)
  expect(database.transaction).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(database.settle.mock.calls[0][0].values).toEqual([first.before, first.xid])
  expect(database.transaction).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(60_000)
  stop()
  expect(database.transaction).toHaveBeenCalledTimes(2)
  expect(onError).not.toHaveBeenCalled()
})
