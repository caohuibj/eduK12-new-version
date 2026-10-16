import { describe, it, expect, vi } from 'vitest'
import { readMatchingWholeReceipt, withReportReadRecovery } from './receipt-recovery'
describe('receipt and report recovery', () => {
  it('confirms only an owner-bound matching saved receipt and distinguishes not received', async () => {
    const read = vi.fn(async () => ({ code: 0, message: 'ok', data: { status: 'ACCEPTED' as const, attemptId: 'a', submissionId: 's', payloadHash: 'hash', acceptedAt: '', committedAt: '', replayed: true } }))
    expect((await readMatchingWholeReceipt(read, 'a', 's'))?.payloadHash).toBe('hash')
    await expect(readMatchingWholeReceipt(read, 'a', 'changed')).rejects.toThrow('不匹配')
    expect(await readMatchingWholeReceipt(async () => ({ code: 0, message: 'ok', data: { status: 'NOT_RECEIVED', attemptId: 'a', submissionId: 's' } }), 'a', 's')).toBeNull()
  })
  it('honors the server Retry-After during transient read recovery', async () => {
    const read = vi.fn().mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503, retryAfterMs: 5000 })).mockResolvedValue('ready')
    const sleep = vi.fn(async (_ms: number) => {})
    expect(await withReportReadRecovery(read, new AbortController().signal, sleep)).toBe('ready')
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(5000)
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('retries transient report reads at most twice and leaves authorization failures untouched', async () => {
    const read = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 503 })).mockResolvedValue('ready')
    const sleep = vi.fn(async (_ms: number) => {})
    expect(await withReportReadRecovery(read, new AbortController().signal, sleep)).toBe('ready')
    expect(read).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledTimes(2)
    const forbidden = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { status: 403 }))
    await expect(withReportReadRecovery(forbidden, new AbortController().signal, sleep)).rejects.toThrow('denied')
    expect(forbidden).toHaveBeenCalledTimes(1)
    const abort = new AbortController(); abort.abort()
    await expect(withReportReadRecovery(read, abort.signal, sleep)).rejects.toMatchObject({ name: 'AbortError' })
    expect(read).toHaveBeenCalledTimes(3)
  })
})
