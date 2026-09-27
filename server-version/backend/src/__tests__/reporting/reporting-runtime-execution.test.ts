import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'

const cache = vi.hoisted(() => ({
  consumeWeightedRateLimit: vi.fn(),
  acquireSemaphore: vi.fn(),
  releaseSemaphore: vi.fn(),
}))

vi.mock('../../services/cacheService', () => ({ cacheService: cache }))

import {
  releaseReportingAnalysisLease,
  reportingAnalysisExecutionAdmission,
  reportingAnalysisGuard,
  withReportingAnalysisExecution,
} from '../../modules/reporting/runtimeLimit'

const response = () => {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    once: vi.fn(),
  }
  res.status.mockReturnValue(res)
  res.json.mockReturnValue(res)
  return res as unknown as Response & {
    setHeader: ReturnType<typeof vi.fn>
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
    once: ReturnType<typeof vi.fn>
  }
}

describe('reporting execution admission lifetime', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    vi.clearAllMocks()
    cache.consumeWeightedRateLimit.mockResolvedValue({ allowed: true, remaining: 100, retryAfterSeconds: 1 })
    cache.acquireSemaphore.mockResolvedValue(true)
    cache.releaseSemaphore.mockResolvedValue(undefined)
  })

  it('does not bind the Redis concurrency lease to HTTP finish/close', async () => {
    const req = {
      user: { userId: 'user-1' },
      params: { organizationId: 'org-1' },
      body: { runId: 'run-1', trackId: 'track-1' },
    } as unknown as Request
    const res = response()
    const next = vi.fn()

    await reportingAnalysisGuard(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.once).not.toHaveBeenCalled()
    expect(cache.releaseSemaphore).not.toHaveBeenCalled()

    await releaseReportingAnalysisLease(req)
    expect(cache.releaseSemaphore).toHaveBeenCalledOnce()
    await releaseReportingAnalysisLease(req)
    expect(cache.releaseSemaphore).toHaveBeenCalledOnce()
  })

  it('holds the process-local permit until the heavy operation promise actually settles', async () => {
    const before = reportingAnalysisExecutionAdmission.getStats().active
    let finish!: () => void
    const pending = withReportingAnalysisExecution(() => new Promise<void>((resolve) => { finish = resolve }))
    await Promise.resolve()
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(before + 1)
    finish()
    await pending
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(before)
  })

  it('releases the process-local permit on operation failure', async () => {
    const before = reportingAnalysisExecutionAdmission.getStats().active
    await expect(withReportingAnalysisExecution(async () => {
      throw new Error('analysis failed')
    })).rejects.toThrow('analysis failed')
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(before)
  })
})
