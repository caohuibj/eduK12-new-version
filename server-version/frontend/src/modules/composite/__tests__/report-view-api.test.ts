import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get }, sessionFetch: vi.fn() }))
import { compositeApi, publicCompositeApi } from '../api'

beforeEach(() => vi.clearAllMocks())

describe('opt-in combined report transport', () => {
  it.each([false, true])('uses the existing report route with bounded wait and abort for public=%s', async publicMode => {
    const signal = new AbortController().signal
    const client = publicMode ? publicCompositeApi('synthetic-recovery') : compositeApi
    await client.reportView('attempt', 4000, signal)
    expect(get).toHaveBeenCalledExactlyOnceWith(`${publicMode ? '/public' : ''}/composite-assessments/attempts/attempt/report`, {
      params: { view: 'combined', waitMs: 4000 }, signal,
      ...(publicMode ? { headers: { 'X-Recovery-Token': 'synthetic-recovery' } } : {}),
    })
    expect(get.mock.calls[0][0]).not.toContain('synthetic-recovery')
    expect(get.mock.calls[0][1].params).not.toHaveProperty('recoveryToken')
  })

  it.each([false, true])('leaves legacy status/report methods unchanged for public=%s', async publicMode => {
    const client = publicMode ? publicCompositeApi('synthetic-recovery') : compositeApi
    const prefix = publicMode ? '/public' : ''
    const headers = publicMode ? { headers: { 'X-Recovery-Token': 'synthetic-recovery' } } : {}
    await client.reportView('attempt')
    expect(get).toHaveBeenLastCalledWith(`${prefix}/composite-assessments/attempts/attempt/report`, {
      ...headers, params: { view: 'combined', waitMs: 0 }, signal: undefined,
    })
    await client.reportStatus('attempt')
    expect(get).toHaveBeenLastCalledWith(`${prefix}/composite-assessments/attempts/attempt/report-status`, {
      ...headers, params: { waitMs: 0 }, signal: undefined,
    })
    await client.report('attempt')
    expect(get.mock.calls[get.mock.calls.length - 1]).toEqual([
      `${prefix}/composite-assessments/attempts/attempt/report`, ...(publicMode ? [headers] : []),
    ])
  })
})
