import crypto from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { cacheService } from '../../services/cacheService'
import { BoundedAdmissionGate, configuredInteger } from '../../services/boundedAdmissionGate'

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

const analysisBudget = () => positiveInt(process.env.REPORTING_COST_BUDGET, 120)
const analysisWindowSeconds = () => positiveInt(process.env.REPORTING_COST_WINDOW_SECONDS, 60)
const maxConcurrent = () => positiveInt(process.env.REPORTING_MAX_CONCURRENT_ANALYSES, 2)
const semaphoreTtlSeconds = () => positiveInt(process.env.REPORTING_CONCURRENCY_TTL_SECONDS, 300)

export const reportingAnalysisExecutionAdmission = new BoundedAdmissionGate({
  name: 'reporting_analysis',
  maxConcurrent: configuredInteger('REPORTING_GLOBAL_MAX_CONCURRENT', 1),
  // No speculative queue before the 4C4G measurement pass: reject excess
  // heavy work immediately rather than retaining additional request memory.
  maxQueue: configuredInteger('REPORTING_GLOBAL_MAX_QUEUE', 0, true),
  maxWaitMs: configuredInteger('REPORTING_GLOBAL_MAX_WAIT_MS', 250),
  retryAfterSeconds: 1,
  busyCode: 'REPORTING_BUSY',
  busyMessage: '报告服务繁忙，请稍后再试',
})

export const withReportingAnalysisExecution = <T>(operation: () => Promise<T>): Promise<T> =>
  reportingAnalysisExecutionAdmission.run(operation)

type ReportingLeaseRequest = Request & {
  reportingAnalysisLease?: { release: () => Promise<void> }
}

export const releaseReportingAnalysisLease = async (req: Request): Promise<void> => {
  const request = req as ReportingLeaseRequest
  const lease = request.reportingAnalysisLease
  if (!lease) return
  delete request.reportingAnalysisLease
  await lease.release()
}

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

export const reportingAnalysisCost = (body: unknown): number => {
  if (!body || typeof body !== 'object') return 1
  const value = body as Record<string, unknown>
  if (Array.isArray(value.sources)) return Math.max(1, Math.min(50, value.sources.length))
  if (Array.isArray(value.waveKeys)) return Math.max(1, Math.min(50, value.waveKeys.length))
  return 1
}

const failUnavailable = (res: Response) =>
  res.status(503).json({ code: -1, message: '报告服务繁忙，请稍后再试' })

export const reportingAnalysisGuard: RequestHandler = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return next()
  if (!req.user || !req.params.organizationId) return next()

  const subject = digest(`${req.params.organizationId}:${req.user.userId}`)
  const cost = reportingAnalysisCost(req.body)
  const budget = analysisBudget()
  const budgetResult = await cacheService.consumeWeightedRateLimit(
    `ratelimit:reporting-analysis:${subject}`,
    budget,
    analysisWindowSeconds(),
    cost,
  )
  if (!budgetResult) return void failUnavailable(res)
  res.setHeader('RateLimit-Limit', String(budget))
  res.setHeader('RateLimit-Remaining', String(budgetResult.remaining))
  if (!budgetResult.allowed) {
    res.setHeader('Retry-After', String(budgetResult.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '报告分析请求过于频繁，请稍后再试' })
    return
  }

  const semaphoreKey = `semaphore:reporting-analysis:${subject}`
  const holderId = crypto.randomUUID()
  const acquired = await cacheService.acquireSemaphore(semaphoreKey, holderId, maxConcurrent(), semaphoreTtlSeconds())
  if (acquired === null) return void failUnavailable(res)
  if (!acquired) {
    res.status(429).json({ code: -1, message: '已有多个报告分析正在处理，请稍后再试' })
    return
  }

  let released = false
  ;(req as ReportingLeaseRequest).reportingAnalysisLease = {
    release: async () => {
      if (released) return
      released = true
      await cacheService.releaseSemaphore(semaphoreKey, holderId)
    },
  }
  next()
}

export const reportingExportBudget: RequestHandler = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return next()
  if (!req.user || !req.params.organizationId) return next()
  const subject = digest(`${req.params.organizationId}:${req.user.userId}`)
  const limit = positiveInt(process.env.REPORTING_EXPORT_BUDGET, 30)
  const windowSeconds = positiveInt(process.env.REPORTING_EXPORT_WINDOW_SECONDS, 60)
  const result = await cacheService.consumeWeightedRateLimit(
    `ratelimit:reporting-export:${subject}`,
    limit,
    windowSeconds,
    1,
  )
  if (!result) return void failUnavailable(res)
  res.setHeader('RateLimit-Limit', String(limit))
  res.setHeader('RateLimit-Remaining', String(result.remaining))
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '报告导出请求过于频繁，请稍后再试' })
    return
  }
  next()
}
