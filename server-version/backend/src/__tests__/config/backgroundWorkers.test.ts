import { describe, expect, it, vi } from 'vitest'
import {
  resolveBackgroundWorkersEnabled,
  resolveHeavyProcessingEnabled,
  resolveVideoProcessingEnabled,
  startBackgroundWorkers,
} from '../../config/backgroundWorkers'

describe('resolveBackgroundWorkersEnabled', () => {
  it('defaults on outside test', () => {
    expect(resolveBackgroundWorkersEnabled({ NODE_ENV: 'production' })).toBe(true)
    expect(resolveBackgroundWorkersEnabled({ NODE_ENV: 'development' })).toBe(true)
  })

  it('defaults off in test so isolated assessment runs do not start media workers', () => {
    expect(resolveBackgroundWorkersEnabled({ NODE_ENV: 'test' })).toBe(false)
    expect(resolveBackgroundWorkersEnabled({})).toBe(true)
  })

  it('honors an explicit flag over NODE_ENV', () => {
    expect(resolveBackgroundWorkersEnabled({ NODE_ENV: 'test', BACKGROUND_WORKERS_ENABLED: 'true' })).toBe(true)
    expect(resolveBackgroundWorkersEnabled({ NODE_ENV: 'production', BACKGROUND_WORKERS_ENABLED: 'false' })).toBe(false)
  })

  it('rejects non-boolean values including empty string', () => {
    expect(() => resolveBackgroundWorkersEnabled({ BACKGROUND_WORKERS_ENABLED: 'yes' })).toThrow(
      /BACKGROUND_WORKERS_ENABLED/,
    )
    expect(() => resolveBackgroundWorkersEnabled({ BACKGROUND_WORKERS_ENABLED: '' })).toThrow(
      /BACKGROUND_WORKERS_ENABLED/,
    )
  })
})

describe('startBackgroundWorkers', () => {
  it('skips loading worker modules when disabled', async () => {
    const load = vi.fn(async () => undefined)
    await expect(startBackgroundWorkers(false, load)).resolves.toBe('skipped')
    expect(load).not.toHaveBeenCalled()
  })

  it('loads worker modules when enabled', async () => {
    const load = vi.fn(async () => undefined)
    await expect(startBackgroundWorkers(true, load)).resolves.toBe('started')
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('daytime resource priority', () => {
  it('keeps heavy and video consumers off without an explicitly confirmed idle maintenance window', () => {
    expect(resolveHeavyProcessingEnabled({})).toBe(false)
    expect(resolveVideoProcessingEnabled({})).toBe(false)
    expect(resolveHeavyProcessingEnabled({ HEAVY_PROCESSING_ENABLED: 'true' })).toBe(false)
    expect(resolveVideoProcessingEnabled({ VIDEO_PROCESSING_ENABLED: 'true' })).toBe(false)
    expect(resolveHeavyProcessingEnabled({ HEAVY_PROCESSING_ENABLED: 'true', HEAVY_MAINTENANCE_IDLE_CONFIRMED: 'true' })).toBe(true)
    expect(resolveVideoProcessingEnabled({ VIDEO_PROCESSING_ENABLED: 'true', VIDEO_MAINTENANCE_IDLE_CONFIRMED: 'true' })).toBe(true)
  })
})
