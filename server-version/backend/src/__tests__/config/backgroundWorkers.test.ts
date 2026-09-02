import { describe, expect, it, vi } from 'vitest'
import {
  resolveBackgroundWorkersEnabled,
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
