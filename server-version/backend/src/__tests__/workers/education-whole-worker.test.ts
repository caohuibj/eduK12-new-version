import type { CompositeReportJob } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ parent: vi.fn(), whole: vi.fn(), finish: vi.fn(), finalize: vi.fn(), materialize: vi.fn(), publish: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: h.parent } } }))
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('../../services/reportReadyNotifications', () => ({ publishReportReady: h.publish }))
vi.mock('../../modules/composite/composite.service', () => ({ finalizeCompositeAttemptIfReady: h.finalize, materializeCompositeQuestionnaireReport: h.materialize }))
vi.mock('../../modules/composite/whole-questionnaire.service', () => ({ processWholeQuestionnaireAnswers: h.whole }))
vi.mock('../../modules/assessment-runtime/report-outbox.service', () => ({
  finishCompositeReportJob: h.finish, renewCompositeReportLease: vi.fn().mockResolvedValue(true),
  REPORT_PARENT_SELECT: {}, assertReportJobIdentity: vi.fn(),
}))
import { processCompositeReportJob } from '../../workers/compositeReportWorker'

const job = { id: 'edu-job', attemptId: 'edu-attempt', leaseToken: 'edu-lease', attemptCount: 1, wholeSubmissionId: 'edu-key', attemptEpoch: 1 } as CompositeReportJob
const educationParent = {
  status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', assignmentRef: 'assignment',
  aggregateInputHash: 'a'.repeat(64),
  compositeAssessment: { productKind: 'ORGANIZATION_RESOURCE', reportPackageKey: null, analysisProtocolKey: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false')
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'false')
  h.whole.mockResolvedValue(true)
  h.parent.mockResolvedValue(educationParent)
  h.finalize.mockResolvedValue({ status: 'COMPLETED', aggregateInputHash: 'b'.repeat(64) })
  h.materialize.mockResolvedValue({})
  h.finish.mockResolvedValue(true)
})

describe('education whole worker identity', () => {
  it('materializes an accepted education receipt without a training report after the flags are off', async () => {
    await processCompositeReportJob(job)
    expect(h.materialize).not.toHaveBeenCalled()
    expect(h.publish).not.toHaveBeenCalled()
    const outcome = h.finish.mock.calls[0][1]
    expect(outcome.kind).toBe('ready')
    expect(outcome.aggregateInputHash).toBe('b'.repeat(64))
    expect(typeof outcome.reportEncrypted).toBe('string')
    expect(outcome.reportEncrypted).not.toContain('EDUCATION_WHOLE_MATERIALIZED')
  })
})
