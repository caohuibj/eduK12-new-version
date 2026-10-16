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
describe('pressure after asynchronous authentication / disconnect', () => {
  it('does not retain requests whose response was already closed before authentication resumed', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    const request = Object.assign(new EventEmitter(), { user: { userId: 'synthetic' } }) as Request
    const responses = Array.from({ length: 20 }, () => Object.assign(new EventEmitter(), { destroyed: true }))
    try {
      for (const response of responses) { response.emit('close'); authenticatedWholeSubmissionPriority(request, response as Response, vi.fn()) }
      await sleep(160); expect(h.publish).not.toHaveBeenCalled()
    } finally { for (const response of responses) response.emit('close'); await sleep(350) }
  })
  it('ignores already-ended responses and already-aborted request bodies', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    const responses: EventEmitter[] = []
    try {
      for (let i = 0; i < 20; i++) {
        const request = Object.assign(new EventEmitter(), { user: { userId: 'synthetic' }, aborted: i % 2 === 0 }) as Request
        const response = Object.assign(new EventEmitter(), { writableEnded: i % 2 !== 0 }); responses.push(response)
        authenticatedWholeSubmissionPriority(request, response as Response, vi.fn())
      }
      await sleep(160); expect(h.publish).not.toHaveBeenCalled()
    } finally { for (const response of responses) response.emit('close'); await sleep(350) }
  })
  it('releases a later aborted request once even if finish and close both follow', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED', 'true'); h.publish.mockClear()
    const pairs = Array.from({ length: 20 }, () => ({ request: Object.assign(new EventEmitter(), { user: { userId: 'synthetic' } }) as Request, response: new EventEmitter() }))
    for (const { request, response } of pairs) authenticatedWholeSubmissionPriority(request, response as Response, vi.fn())
    await sleep(40); expect(h.publish).toHaveBeenCalled()
    for (const { request, response } of pairs) { request.emit('aborted'); response.emit('finish'); response.emit('close') }
    await sleep(350); expect(JSON.parse(h.publish.mock.calls.at(-1)![0]).busy).toBe(false)
    const count = h.publish.mock.calls.length; await sleep(150); expect(h.publish).toHaveBeenCalledTimes(count)
  })
})
