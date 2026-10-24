import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCheckinUploadCleanupConfig } from '../../config/checkinUploadCleanup'
import { startCheckinUploadCleanupScheduler } from '../../services/checkinUploadCleanupScheduler'

afterEach(() => vi.useRealTimers())
const config = { batchSize: 10, intervalMs: 300_000, jitterMs: 30_000 }

describe('checkin cleanup resource configuration', () => {
  it('defaults to twenty candidates per process per round, not twenty deletes', () => {
    expect(resolveCheckinUploadCleanupConfig({})).toEqual(config)
  })
  it('accepts bounded independent overrides', () => {
    expect(resolveCheckinUploadCleanupConfig({ CHECKIN_UPLOAD_CLEANUP_BATCH_SIZE: '1',
      CHECKIN_UPLOAD_CLEANUP_INTERVAL_SECONDS: '60', CHECKIN_UPLOAD_CLEANUP_JITTER_SECONDS: '0',
    })).toEqual({ batchSize: 1, intervalMs: 60_000, jitterMs: 0 })
  })
  it.each(['0', '26', '1.5', 'NaN', '', ' '])('rejects unsafe batch %j', value => {
    expect(() => resolveCheckinUploadCleanupConfig({ CHECKIN_UPLOAD_CLEANUP_BATCH_SIZE: value })).toThrow()
  })
  it('rejects busy-loop and oversized timer configurations', () => {
    expect(() => resolveCheckinUploadCleanupConfig({ CHECKIN_UPLOAD_CLEANUP_INTERVAL_SECONDS: '0' })).toThrow()
    expect(() => resolveCheckinUploadCleanupConfig({ CHECKIN_UPLOAD_CLEANUP_INTERVAL_SECONDS: '3601' })).toThrow()
    expect(() => resolveCheckinUploadCleanupConfig({ CHECKIN_UPLOAD_CLEANUP_JITTER_SECONDS: '61' })).toThrow()
  })
})

describe('dedicated best-effort cleanup scheduler', () => {
  it('delays startup and applies jitter without touching an HTTP request', async () => {
    vi.useFakeTimers()
    const run = vi.fn().mockResolvedValue(undefined)
    const stop = startCheckinUploadCleanupScheduler(run, config, vi.fn(), () => 0.5)
    await vi.advanceTimersByTimeAsync(314_999)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledOnce()
    await stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not overlap or accumulate wakes while a sweep is unresolved', async () => {
    vi.useFakeTimers()
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>(done => { resolve = done }))
    const stop = startCheckinUploadCleanupScheduler(run, config, vi.fn(), () => 0)
    await vi.advanceTimersByTimeAsync(300_000)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(run).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(299_999)
    expect(run).toHaveBeenCalledOnce()
    await stop()
  })
  it('stop is idempotent and waits for actual completion without scheduling another sweep', async () => {
    vi.useFakeTimers()
    let resolve!: () => void
    const run = vi.fn(() => new Promise<void>(done => { resolve = done }))
    const stop = startCheckinUploadCleanupScheduler(run, config, vi.fn(), () => 0)
    await vi.advanceTimersByTimeAsync(300_000)
    const drain = stop()
    expect(stop()).toBe(drain)
    let drained = false
    void drain.then(() => { drained = true })
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(drained).toBe(false)
    resolve()
    await drain
    expect(drained).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(run).toHaveBeenCalledOnce()
  })
  it('retries only at the next regular interval after failure, including a diagnostic failure', async () => {
    vi.useFakeTimers()
    const failure = new Error('database unavailable')
    const run = vi.fn().mockRejectedValue(failure)
    const onError = vi.fn(() => { throw new Error('logger unavailable') })
    const stop = startCheckinUploadCleanupScheduler(run, config, onError, () => 0)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(onError).toHaveBeenCalledWith(failure)
    await vi.advanceTimersByTimeAsync(299_999)
    expect(run).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
    await expect(stop()).resolves.toBeUndefined()
  })
  it('stopping before startup prevents all work', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const stop = startCheckinUploadCleanupScheduler(run, config, vi.fn())
    await stop()
    await stop()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(run).not.toHaveBeenCalled()
  })
})
