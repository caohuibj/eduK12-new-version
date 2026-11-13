import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { assessmentReportConfig } from '../../config/assessmentReports'
import { relationalWholeFinalConsentGuard } from '../../modules/composite/composite.routes'
import { relationalRuntimeConsentAuthority } from '../../modules/assessment-relational/runtime-consent'

describe('PR3: Whole submit context reuse and report defaults', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED
    delete process.env.ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED
    delete process.env.ASSESSMENT_REPORT_NARROW_LOAD_ENABLED
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('assessmentReportConfig default enablement', () => {
    it('defaults wholeRequestContextReuseEnabled, snapshotBatchEnabled, and narrowLoadEnabled to true when unset', () => {
      const config = assessmentReportConfig()
      expect(config.wholeRequestContextReuseEnabled).toBe(true)
      expect(config.snapshotBatchEnabled).toBe(true)
      expect(config.narrowLoadEnabled).toBe(true)
    })

    it('respects explicit false values for rollback safety', () => {
      process.env.ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED = 'false'
      process.env.ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED = 'false'
      process.env.ASSESSMENT_REPORT_NARROW_LOAD_ENABLED = 'false'

      const config = assessmentReportConfig()
      expect(config.wholeRequestContextReuseEnabled).toBe(false)
      expect(config.snapshotBatchEnabled).toBe(false)
      expect(config.narrowLoadEnabled).toBe(false)
    })

    it('accepts explicit true values without changing behavior', () => {
      process.env.ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED = 'true'
      process.env.ASSESSMENT_REPORT_SNAPSHOT_BATCH_ENABLED = 'true'
      process.env.ASSESSMENT_REPORT_NARROW_LOAD_ENABLED = 'true'

      const config = assessmentReportConfig()
      expect(config.wholeRequestContextReuseEnabled).toBe(true)
      expect(config.snapshotBatchEnabled).toBe(true)
      expect(config.narrowLoadEnabled).toBe(true)
    })
  })

  describe('relationalWholeFinalConsentGuard', () => {
    it('bypasses redundant middleware query by default when env is unset', async () => {
      const spy = vi.spyOn(relationalRuntimeConsentAuthority, 'assertCompositeFinal').mockResolvedValue(undefined)
      const req = { params: { attemptId: 'attempt-123' }, user: { userId: 'user-456' } } as any
      const res = {} as any
      const next = vi.fn()

      await relationalWholeFinalConsentGuard(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('executes relationalFinalConsentGuard when explicitly disabled via false', async () => {
      process.env.ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED = 'false'
      const spy = vi.spyOn(relationalRuntimeConsentAuthority, 'assertCompositeFinal').mockResolvedValue(undefined)
      const req = { params: { attemptId: 'attempt-123' }, user: { userId: 'user-456' } } as any
      const res = {} as any
      const next = vi.fn()

      await relationalWholeFinalConsentGuard(req, res, next)

      expect(spy).toHaveBeenCalledWith('attempt-123', 'user-456')
      expect(next).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })
  })
})


describe('report worker concurrency defaults',()=>{
 it('defaults to 12 and preserves explicit per-environment overrides',()=>{
  expect(assessmentReportConfig({}).workerConcurrency).toBe(12)
  expect(assessmentReportConfig({ASSESSMENT_REPORT_WORKER_CONCURRENCY:'6'}).workerConcurrency).toBe(6)
  expect(assessmentReportConfig({ASSESSMENT_REPORT_WORKER_CONCURRENCY:'8'}).workerConcurrency).toBe(8)
 })
})
