import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportReadyWaitRegistry } from '../../services/reportReadyNotifications'
afterEach(() => vi.useRealTimers())
describe('bounded advisory report readiness waits', () => {
  it('wakes only the matching report and releases every registration', async () => {
    const waits = new ReportReadyWaitRegistry(4)
    const a = waits.wait('report-a', 4000)!; const b = waits.wait('report-b', 4000)!
    waits.wake('report-a'); expect(await a.done).toBe('ready'); expect(waits.size).toBe(1)
    b.cancel(); expect(await b.done).toBe('cancelled'); expect(waits.size).toBe(0)
  })
  it('bounds global and per-report held requests and removes aborted requests', async () => {
    const waits = new ReportReadyWaitRegistry(3); const abort = new AbortController()
    const a = waits.wait('a', 4000)!; const b = waits.wait('a', 4000)!
    expect(waits.wait('a', 4000)).toBeNull()
    const c = waits.wait('b', 4000, abort.signal)!; expect(waits.wait('c', 4000)).toBeNull()
    abort.abort(); expect(await c.done).toBe('aborted')
    a.cancel(); b.cancel(); expect(waits.size).toBe(0)
    expect(waits.wait('already-aborted', 4000, abort.signal)).toBeNull()
  })
  it('caps sleep even for maliciously large requested waits and falls back on notification loss', async () => {
    vi.useFakeTimers(); const waits = new ReportReadyWaitRegistry()
    const a = waits.wait('a', 9999999)!; await vi.advanceTimersByTimeAsync(4000)
    expect(await a.done).toBe('timeout'); expect(waits.size).toBe(0)
    const b = waits.wait('b', 4000)!; waits.unavailable()
    expect(await b.done).toBe('unavailable'); expect(waits.size).toBe(0)
  })
})

it.runIf(Boolean(process.env.REPORT_READY_INTEGRATION_REDIS_URL))('delivers a real Redis hint and safely releases waits on advisory connection loss', async () => {
  const service = await import('../../services/reportReadyNotifications')
  vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'true')
  vi.stubEnv('REDIS_URL', process.env.REPORT_READY_INTEGRATION_REDIS_URL!)
  try {
    expect(await service.prepareReportReadyNotifications()).toBe(true)
    const a = service.beginReportReadyWait('synthetic-attempt', 1, 4000)!
    expect(a).toBeTruthy()
    await service.publishReportReady('synthetic-attempt', 1)
    expect(await a.done).toBe('ready')
    const missed = service.beginReportReadyWait('missing-notification', 1, 40)!
    expect(await missed.done).toBe('timeout')
    const disconnected = service.beginReportReadyWait('disconnected', 1, 4000)!
    service.stopReportReadyNotifications()
    expect(await disconnected.done).toBe('unavailable')
  } finally { service.stopReportReadyNotifications(); vi.unstubAllEnvs() }
})

it.runIf(Boolean(process.env.REPORT_READY_INTEGRATION_REDIS_URL))('does not lose a ready hint received between the DB snapshot and wait registration', async () => {
  const service = await import('../../services/reportReadyNotifications')
  vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'true')
  vi.stubEnv('REDIS_URL', process.env.REPORT_READY_INTEGRATION_REDIS_URL!)
  try {
    expect(await service.prepareReportReadyNotifications()).toBe(true)
    const beforeRead = service.reportReadyNotificationSequence()
    await service.publishReportReady('read-race', 2)
    for (let n = 0; n < 100 && service.reportReadyNotificationSequence() === beforeRead; n++) await new Promise(resolve => setTimeout(resolve, 2))
    expect(service.reportReadyNotificationSequence()).toBeGreaterThan(beforeRead)
    const wait = service.beginReportReadyWait('read-race', 2, 4000, undefined, beforeRead)!
    expect(await wait.done).toBe('ready')
  } finally { service.stopReportReadyNotifications(); vi.unstubAllEnvs() }
})


it.runIf(Boolean(process.env.REPORT_READY_INTEGRATION_REDIS_URL))('multiplexes pressure and ready hints on the existing connection and expires pressure after advisory loss', async () => {
  const service = await import('../../services/reportReadyNotifications')
  const { ReportClaimPriority } = await import('../../services/wholeSubmissionPriority')
  vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'true'); vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true')
  vi.stubEnv('REDIS_URL', process.env.REPORT_READY_INTEGRATION_REDIS_URL!)
  let at = 0; const policy = new ReportClaimPriority(() => at)
  const detach = service.onReportSchedulingHint(message => policy.receive(message))
  try {
    expect(await service.prepareReportReadyNotifications()).toBe(true)
    const waiting = service.beginReportReadyWait('pressure-is-not-ready', 1, 4000)!
    await service.publishReportSchedulingHint(JSON.stringify({ v: 1, kind: 'pressure', source: 'a'.repeat(32), seq: 1, active: 10, busy: true }))
    for (let n = 0; n < 100 && policy.decision(2).mode === 'normal'; n++) await new Promise(resolve => setTimeout(resolve, 2))
    expect(policy.decision(2).mode).toBe('yield')
    await service.publishReportReady('pressure-is-not-ready', 1); expect(await waiting.done).toBe('ready')
    service.stopReportReadyNotifications(); at = 1501
    expect(policy.decision(2)).toMatchObject({ mode: 'normal', limit: 2 })
  } finally { detach(); service.stopReportReadyNotifications(); vi.unstubAllEnvs() }
})
