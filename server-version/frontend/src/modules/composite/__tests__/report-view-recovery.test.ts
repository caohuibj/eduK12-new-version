import { afterEach, describe, expect, it, vi } from 'vitest'
import { withReportReadRecovery } from '../receipt-recovery'

const options = { completionBusyMaxAttempts: 2 }
afterEach(() => vi.restoreAllMocks())

describe('combined report read-only recovery', () => {
  it('bounds explicit completion busy at two reads with the original delay and Retry-After', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const cause = { status: 503, code: 'COMPLETION_BUSY', retryAfterMs: 5000 }
    const read = vi.fn().mockRejectedValue(cause)
    const sleep = vi.fn(async (_ms: number) => {})
    await expect(withReportReadRecovery(read, new AbortController().signal, sleep, options)).rejects.toBe(cause)
    expect(read).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledExactlyOnceWith(5000)
  })

  it('uses completion jitter only when opted in and preserves the default three-read recovery', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const cause = { status: 503, code: 'COMPLETION_BUSY' }
    const sleep = vi.fn(async (_ms: number) => {})
    const opted = vi.fn().mockRejectedValueOnce(cause).mockResolvedValue('ready')
    await expect(withReportReadRecovery(opted, new AbortController().signal, sleep, options)).resolves.toBe('ready')
    expect(sleep).toHaveBeenLastCalledWith(500)
    sleep.mockClear()
    const legacy = vi.fn().mockRejectedValue(cause)
    await expect(withReportReadRecovery(legacy, new AbortController().signal, sleep)).rejects.toBe(cause)
    expect(legacy).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([750, 1500])
  })

  it.each([undefined, 408, 429, 500, 502, 503, 504])('keeps three reads for other transient status=%s', async status => {
    const cause = { status, code: 'OTHER_ERROR', retryAfterMs: 6000 }
    const read = vi.fn().mockRejectedValue(cause)
    const sleep = vi.fn(async (_ms: number) => {})
    await expect(withReportReadRecovery(read, new AbortController().signal, sleep, options)).rejects.toBe(cause)
    expect(read).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    for (const [delay] of sleep.mock.calls) expect(delay).toBeGreaterThanOrEqual(6000)
  })

  it.each([401, 403, 409])('does not retry access/business status=%s', async status => {
    const cause = { status, code: 'COMPLETION_BUSY' }
    const read = vi.fn().mockRejectedValue(cause)
    const sleep = vi.fn(async (_ms: number) => {})
    await expect(withReportReadRecovery(read, new AbortController().signal, sleep, options)).rejects.toBe(cause)
    expect(read).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stops before a retry after abort and leaves fulfilled error envelopes untouched', async () => {
    const controller = new AbortController()
    const read = vi.fn().mockRejectedValue(new TypeError('network'))
    const sleep = vi.fn(async () => { controller.abort() })
    await expect(withReportReadRecovery(read, controller.signal, sleep, options)).rejects.toMatchObject({ name: 'AbortError' })
    expect(read).toHaveBeenCalledTimes(1)
    const envelope = { code: -1, message: 'Not available' }
    const failedEnvelope = vi.fn().mockResolvedValue(envelope)
    await expect(withReportReadRecovery(failedEnvelope, new AbortController().signal, sleep, options)).resolves.toBe(envelope)
    expect(failedEnvelope).toHaveBeenCalledTimes(1)
  })
})
