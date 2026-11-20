import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ publish: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../services/reportReadyNotifications', () => ({ publishReportSchedulingHint: h.publish, onReportSchedulingHint: vi.fn(), prepareReportReadyNotifications: vi.fn() }))
vi.mock('../../services/runtimeObservability', async original => ({
  ...await original<object>(), runtimeEventLoopDelayMs: () => 0,
}))
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn() } }))
import { wholeSubmitAdmission, withWholeSubmitAdmission } from '../../services/wholeSubmitAdmission'
import { anonymousWholeSubmitQueued, authenticatedWholeSubmissionPriority, trackVerifiedWholeSubmissionPressure } from '../../services/wholeSubmissionPriority'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
afterEach(() => vi.unstubAllEnvs())
describe('coalesced pressure transport', () => {
  it('adds no Redis operation for ordinary single-person requests and coalesces a burst with one final quiet hint', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    const request = { user: { userId: 'synthetic' } } as Request
    const one = new EventEmitter(); authenticatedWholeSubmissionPriority(request, one as Response, vi.fn()); one.emit('finish')
    await sleep(160); expect(h.publish).not.toHaveBeenCalled()
    const responses = Array.from({ length: 40 }, () => new EventEmitter())
    for (const response of responses) authenticatedWholeSubmissionPriority(request, response as Response, vi.fn())
    await sleep(35); expect(h.publish).toHaveBeenCalledTimes(1)
    for (const response of responses) { response.emit('finish'); response.emit('close') }
    await sleep(350)
    expect(h.publish.mock.calls.length).toBeLessThanOrEqual(5)
    expect(JSON.parse(h.publish.mock.calls.at(-1)![0]).busy).toBe(false)
    const count = h.publish.mock.calls.length, another = new EventEmitter()
    authenticatedWholeSubmissionPriority(request, another as Response, vi.fn()); another.emit('finish')
    await sleep(160); expect(h.publish.mock.calls.length).toBe(count)
  })
  it('ignores unverified requests', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    for (let n = 0; n < 20; n++) authenticatedWholeSubmissionPriority({} as Request, new EventEmitter() as Response, vi.fn())
    await sleep(130); expect(h.publish).not.toHaveBeenCalled()
  })

  it('expires an anonymous queue wait before DB work and reports pressure only with a verified submit', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true')
    let unblock!: () => void
    const held = new Promise<void>(resolve => { unblock = resolve })
    const { maxConcurrent, retryAfterSeconds } = wholeSubmitAdmission.getStats().options
    const occupying = Array.from({ length: maxConcurrent }, () => withWholeSubmitAdmission(() => held))
    const operation = vi.fn(async () => 'accepted')
    const queued = withWholeSubmitAdmission(operation, true)
    const outcome = expect(queued).rejects.toMatchObject({ code: 'ASSESSMENT_SUBMIT_BUSY', reason: 'timeout', retryAfterSeconds })
    const before = anonymousWholeSubmitQueued()
    const tracked = trackVerifiedWholeSubmissionPressure(() => held, true)
    const during = anonymousWholeSubmitQueued()
    try {
      expect(before).toBe(false)
      expect(during).toBe(true)
      await outcome
      expect(operation).not.toHaveBeenCalled()
      expect(anonymousWholeSubmitQueued()).toBe(false)
    } finally {
      unblock()
      await Promise.all([...occupying, tracked])
      await sleep(350)
    }
  })

  it('tracks verified public/education whole submissions and avoids double-counting middleware-wrapped requests', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    let releaseBatch!: () => void
    const hold = new Promise<void>(resolve => { releaseBatch = resolve })
    const tasks = Array.from({ length: 6 }, () => trackVerifiedWholeSubmissionPressure(() => hold))
    // Pressure hints are coalesced and throttled; the prior test's quiet hint
    // may still be inside the shared publisher's 100ms interval on CI.
    await vi.waitFor(() => expect(h.publish).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 10 })
    expect(JSON.parse(h.publish.mock.calls[0][0])).toMatchObject({ busy: true, active: 6 })
    releaseBatch()
    await Promise.all(tasks)
    await sleep(350)
    expect(JSON.parse(h.publish.mock.calls.at(-1)![0]).busy).toBe(false)

    // Nested inside authenticatedWholeSubmissionPriority -> active stays 1, not 2 (<4 threshold, so no busy publish)
    h.publish.mockClear()
    const req = { user: { userId: 'u-1' } } as Request
    const res = new EventEmitter() as Response
    let innerDone = false
    authenticatedWholeSubmissionPriority(req, res, () => {
      void trackVerifiedWholeSubmissionPressure(async () => {
        await sleep(20)
        innerDone = true
      }).then(() => res.emit('finish'))
    })
    await sleep(160)
    expect(innerDone).toBe(true)
    expect(h.publish).not.toHaveBeenCalled()
  })
})
