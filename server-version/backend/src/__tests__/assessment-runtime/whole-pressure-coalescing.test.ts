import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ publish: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../services/reportReadyNotifications', () => ({ publishReportSchedulingHint: h.publish, onReportSchedulingHint: vi.fn(), prepareReportReadyNotifications: vi.fn() }))
vi.mock('../../services/runtimeObservability', () => ({ runtimeEventLoopDelayMs: () => 0 }))
vi.mock('../../utils/logger', () => ({ logger: { info: vi.fn() } }))
import { authenticatedWholeSubmissionPriority } from '../../services/wholeSubmissionPriority'
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
})
