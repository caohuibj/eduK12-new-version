import { describe, expect, it } from 'vitest'
import { REPORT_AUTO_POLL_LIMIT, reportPollingDelayMs } from '../report-polling'
describe('bounded faster report feedback', () => {
  it('keeps ordinary detection delay below 4.5 seconds and the cycle below 40 public GETs', () => {
    const delays = Array.from({ length: REPORT_AUTO_POLL_LIMIT }, (_, index) => reportPollingDelayMs(index, 2, () => 1))
    expect(Math.max(...delays)).toBeLessThanOrEqual(4500)
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeGreaterThanOrEqual(84_000)
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeLessThanOrEqual(96_000)
    expect(REPORT_AUTO_POLL_LIMIT + 5).toBeLessThan(40)
  })
  it('honors an overload Retry-After instead of synchronizing clients into fast retries', () => {
    expect(reportPollingDelayMs(0, 12, () => 0)).toBe(12_000)
    expect(reportPollingDelayMs(0, 12, () => 1)).toBe(12_500)
    expect(reportPollingDelayMs(20, 12, () => 0.5)).toBe(12_250)
  })
  it('uses only a few fast first-task probes and honors overload floors', () => {
    expect([0,1,2,3].map(index => reportPollingDelayMs(index, 0.25, () => 0, 'FAST_START'))).toEqual([400,400,800,1600])
    expect(reportPollingDelayMs(0, 12, () => 0, 'FAST_START')).toBe(12000)
    expect(reportPollingDelayMs(4, 0.25, () => 0, 'FAST_START')).toBe(2500)
    expect(reportPollingDelayMs(3, 2, () => 0, 'LEGACY')).toBe(10000)
  })

})


describe('bounded server readiness waits', () => {
  it('registers the next bounded wait without another multi-second sleep', () => {
    expect(reportPollingDelayMs(2, 0.1, () => 0, 'QUEUED', 4000)).toBe(100)
    expect(reportPollingDelayMs(2, 0.1, () => 1, 'QUEUED', 4000)).toBe(200)
  })
  it('honors Retry-After even while the server offers readiness waits', () => {
    expect(reportPollingDelayMs(2, 5, () => 0, 'QUEUED', 4000)).toBe(5000)
    expect(reportPollingDelayMs(2, 5, () => 1, 'FAST_START', 4000)).toBe(5100)
  })
  it('keeps the original fallback and legacy server floors', () => {
    expect(reportPollingDelayMs(2, 2, () => 0, 'QUEUED', 0)).toBe(2500)
    expect(reportPollingDelayMs(2, 5, () => 0, 'LEGACY', 4000)).toBe(5000)
  })
})
