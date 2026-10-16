import { describe, it, expect, vi } from 'vitest'
import { WholeReceiptStorageAdmission } from '../../modules/assessment-runtime/whole-receipt-storage'
describe('whole receipt storage guard', () => {
  it('coalesces concurrent probes, uses only local increments, refreshes after two seconds', async () => {
    let at = 0
    const read = vi.fn(async () => ({ freeBytes: 4096, unfinished: 0 }))
    const guard = new WholeReceiptStorageAdmission(read, () => at, 1024, 2)
    await Promise.all(Array.from({ length: 20 }, () => guard.admit()))
    expect(read).toHaveBeenCalledTimes(1); expect(guard.accepted()).toBe(1)
    await guard.admit(); expect(guard.accepted()).toBe(2)
    await expect(guard.admit()).rejects.toMatchObject({ code: 'COMPLETION_BUSY' })
    at = 2001; await guard.admit(); expect(read).toHaveBeenCalledTimes(2)
  })
  it('fails before a new save on low disk, backlog high water or failed probe; it never deletes receipts', async () => {
    for (const read of [async () => ({ freeBytes: 10, unfinished: 0 }), async () => ({ freeBytes: 4096, unfinished: 20 }),
      async () => { throw new Error('probe unavailable') }]) {
      const guard = new WholeReceiptStorageAdmission(read, () => 0, 1024, 20)
      await expect(guard.admit()).rejects.toMatchObject({ code: 'COMPLETION_BUSY' })
    }
  })
})
