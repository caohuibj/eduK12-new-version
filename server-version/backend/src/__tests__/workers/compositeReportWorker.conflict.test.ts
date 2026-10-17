import type { CompositeReportJob } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { ScaleSubmissionKeyConflictError, REPORT_SUBMISSION_KEY_CONFLICT } from '../../modules/scale/scale-final-submit-conflict'
const h = vi.hoisted(() => ({ parent: vi.fn(), whole: vi.fn(), finish: vi.fn(), finalize: vi.fn(), materialize: vi.fn(), publish: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: h.parent } } }))
vi.mock('../../config/assessmentReports', () => ({ assessmentReportConfig: () => ({ workerConcurrency: 1, leaseMs: 30000, maxAttempts: 8 }) }))
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../../services/reportReadyNotifications', () => ({ publishReportReady: h.publish }))
vi.mock('../../modules/composite/composite.service', () => ({ finalizeCompositeAttemptIfReady: h.finalize, materializeCompositeQuestionnaireReport: h.materialize }))
vi.mock('../../modules/composite/whole-questionnaire.service', () => ({ processWholeQuestionnaireAnswers: h.whole }))
vi.mock('../../modules/assessment-runtime/report-outbox.service', () => ({
  claimCompositeReportJob: vi.fn(), finishCompositeReportJob: h.finish, returnUnstartedCompositeReportJob: vi.fn(),
  renewCompositeReportLease: vi.fn().mockResolvedValue(true), REPORT_PARENT_SELECT: {}, assertReportJobIdentity: vi.fn(),
}))
import { processCompositeReportJob } from '../../workers/compositeReportWorker'
const job = { id: 'own-job', attemptId: 'own-attempt', leaseToken: 'own-lease', attemptCount: 1, wholeSubmissionId: 'own-key' } as CompositeReportJob
beforeEach(() => {
  vi.clearAllMocks(); h.whole.mockReset(); h.whole.mockResolvedValue(true)
  h.parent.mockResolvedValue({ status: 'IN_PROGRESS' }); h.finalize.mockResolvedValue({ status: 'COMPLETED' })
  h.materialize.mockResolvedValue({}); h.finish.mockResolvedValue(true); h.publish.mockResolvedValue(undefined)
})
describe('report processor permanent key conflict boundary', () => {
  it('commits a normal report and publishes ready only after finish', async () => {
    await processCompositeReportJob(job)
    expect(h.finish).toHaveBeenCalledWith(job, { kind: 'ready' }); expect(h.publish).toHaveBeenCalledWith('own-attempt', undefined)
  })
  it('fails a database-confirmed key collision on first attempt without retry', async () => {
    h.whole.mockRejectedValue(new ScaleSubmissionKeyConflictError()); await processCompositeReportJob(job)
    expect(h.finish).toHaveBeenCalledWith(job, { kind: 'failed', errorCode: REPORT_SUBMISSION_KEY_CONFLICT })
    expect(h.parent).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled()
  })
  it.each([new Error('technical error'), new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', 'generic mismatch', 409),
    new Prisma.PrismaClientKnownRequestError('unconfirmed unique failure', { code: 'P2010', clientVersion: 'test', meta: { code: '23505' } })])('retains bounded retry for unconfirmed/generic errors %#', async error => {
    h.whole.mockRejectedValue(error); await processCompositeReportJob(job)
    expect(h.finish).toHaveBeenCalledWith(job, { kind: 'retry', errorCode: 'REPORT_GENERATION_FAILED', delayMs: expect.any(Number) })
    expect(h.publish).not.toHaveBeenCalled()
  })
  it('retains cancellation for stale attempts', async () => {
    h.whole.mockRejectedValue(new InstrumentFinalSubmitError('STALE_ATTEMPT', 'stale', 409)); await processCompositeReportJob(job)
    expect(h.finish).toHaveBeenCalledWith(job, { kind: 'cancelled' })
  })
  it('still stops unknown technical retries at their configured limit', async () => {
    h.whole.mockRejectedValue(new Error('technical')); const last = { ...job, attemptCount: 8 }; await processCompositeReportJob(last)
    expect(h.finish).toHaveBeenCalledWith(last, { kind: 'failed', errorCode: 'REPORT_GENERATION_FAILED' })
  })
})
