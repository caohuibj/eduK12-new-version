import type { CompositeReportJob } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn(), returned: vi.fn(), parent: vi.fn(), whole: vi.fn(), decision: vi.fn() }))
vi.mock('../../services/wholeSubmissionPriority', () => ({ reportClaimDecision: h.decision, reportPriorityClaimed: vi.fn(), startReportClaimPriority: vi.fn(), stopReportClaimPriority: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: h.parent } } }))
vi.mock('../../config/assessmentReports', () => ({ assessmentReportConfig: () => ({ workerConcurrency: 2, pollMs: 50, leaseMs: 30000, maxAttempts: 8 }) }))
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../../modules/composite/composite.service', () => ({ finalizeCompositeAttemptIfReady: vi.fn(), materializeCompositeQuestionnaireReport: vi.fn() }))
vi.mock('../../modules/composite/whole-questionnaire.service', () => ({ processWholeQuestionnaireAnswers: h.whole }))
vi.mock('../../modules/assessment-runtime/report-outbox.service', () => ({
  claimCompositeReportJob: h.claim, finishCompositeReportJob: h.finish, returnUnstartedCompositeReportJob: h.returned,
  renewCompositeReportLease: vi.fn().mockResolvedValue(true), REPORT_PARENT_SELECT: {}, assertReportJobIdentity: vi.fn(),
}))
let worker: typeof import('../../workers/compositeReportWorker') | undefined
let finishes: Array<() => void>
let releaseClaim: ((job: CompositeReportJob | null) => void) | undefined
const job = (id: number) => ({ id: String(id), attemptId: 'attempt-' + id, leaseToken: 'lease-' + id, attemptCount: 1 }) as CompositeReportJob
const flush = async () => { await vi.dynamicImportSettled(); for (let index = 0; index < 20; index++) await Promise.resolve() }
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); finishes = []; releaseClaim = undefined
  for (const mock of Object.values(h)) mock.mockReset()
  h.decision.mockReturnValue({ mode: 'normal', limit: 2, delayMs: 0, sources: 0 })
  h.parent.mockResolvedValue({ status: 'ABANDONED' }); h.whole.mockResolvedValue(false); h.returned.mockResolvedValue(true)
  h.claim.mockResolvedValue(null); h.finish.mockImplementation(() => new Promise<boolean>(resolve => { let used = false; finishes.push(() => { if (!used) { used = true; resolve(true) } }) }))
  worker = await import('../../workers/compositeReportWorker')
})
afterEach(async () => {
  const stopped = worker?.stopCompositeReportWorker(1000)
  releaseClaim?.(null); for (const finish of finishes) finish()
  await flush(); for (const finish of finishes) finish()
  await vi.advanceTimersByTimeAsync(1000); await stopped; vi.useRealTimers()
})

describe('report scheduler capacity and drain', () => {
  it('preloads processors without claiming or scoring a participant task', async () => {
    await worker!.prepareCompositeReportRuntime()
    expect(h.claim).not.toHaveBeenCalled()
    expect(h.whole).not.toHaveBeenCalled()
    expect(h.parent).not.toHaveBeenCalled()
  })

  it('refills a finished slot immediately without waiting for the poll interval', async () => {
    const jobs = [job(1), job(2), job(3)]
    h.claim.mockImplementation(async () => jobs.shift() ?? null)
    worker!.startCompositeReportWorker(); await flush()
    expect(finishes).toHaveLength(2); expect(worker!.activeCompositeReportJobs()).toBe(2)
    finishes[0](); await flush(); await vi.advanceTimersByTimeAsync(1)
    expect(finishes).toHaveLength(3); expect(worker!.activeCompositeReportJobs()).toBe(2)
  })

  it('coalesces simultaneous completions and never overlaps job claims or exceeds concurrency', async () => {
    const jobs = Array.from({ length: 6 }, (_, index) => job(index))
    let claims = 0, maximum = 0
    h.claim.mockImplementation(async () => { claims++; maximum = Math.max(maximum, claims); await Promise.resolve(); claims--; return jobs.shift() ?? null })
    worker!.startCompositeReportWorker(); await flush()
    finishes[0](); finishes[1](); await flush(); await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(finishes).toHaveLength(4); expect(worker!.activeCompositeReportJobs()).toBe(2); expect(maximum).toBe(1)
  })

  it('returns a claim received during shutdown instead of starting an untracked task', async () => {
    h.claim.mockImplementationOnce(() => new Promise<CompositeReportJob | null>(resolve => { releaseClaim = resolve }))
    worker!.startCompositeReportWorker(); await flush()
    const stopped = worker!.stopCompositeReportWorker(1000)
    releaseClaim!(job(9)); releaseClaim = undefined; await stopped
    expect(h.returned).toHaveBeenCalledWith(expect.objectContaining({ id: '9', leaseToken: 'lease-9' }))
    expect(h.parent).not.toHaveBeenCalled(); expect(h.finish).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000); expect(h.claim).toHaveBeenCalledTimes(1)
  })

  it('backs off empty polling and leaves no timer after shutdown', async () => {
    worker!.startCompositeReportWorker(); await flush()
    expect(h.claim).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(99); expect(h.claim).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); expect(h.claim).toHaveBeenCalledTimes(2)
    await worker!.stopCompositeReportWorker(1000)
    await vi.advanceTimersByTimeAsync(5000); expect(h.claim).toHaveBeenCalledTimes(2)
  })
  it('defers new claims during a burst while in-flight jobs complete, then resumes at the minimum limit', async () => {
    const jobs = [job(1), job(2), job(3), job(4)]
    h.claim.mockImplementation(async () => jobs.shift() ?? null)
    worker!.startCompositeReportWorker(); await flush(); expect(finishes).toHaveLength(2)
    h.decision.mockReturnValue({ mode: 'yield', limit: 0, delayMs: 50, sources: 1 })
    finishes[0](); finishes[1](); await flush(); await vi.advanceTimersByTimeAsync(501)
    expect(worker!.activeCompositeReportJobs()).toBe(0); expect(h.finish).toHaveBeenCalledTimes(2)
    expect(h.claim).toHaveBeenCalledTimes(2)
    h.decision.mockReturnValue({ mode: 'minimum', limit: 1, delayMs: 0, sources: 1 })
    await vi.advanceTimersByTimeAsync(50)
    expect(finishes).toHaveLength(3); expect(worker!.activeCompositeReportJobs()).toBe(1)
  })

})
