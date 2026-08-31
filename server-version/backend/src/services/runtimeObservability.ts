import { AsyncLocalStorage } from 'node:async_hooks'
import { monitorEventLoopDelay, PerformanceObserver, performance } from 'node:perf_hooks'
import type { NextFunction, Request, Response } from 'express'
import { logger } from '../utils/logger'

export type RequestObservationPhase =
  | 'resume_auth'
  | 'transaction_acquisition'
  | 'transaction'
  | 'row_lock_wait'
  | 'assessment_lookup'
  | 'definition_lookup'
  | 'existing_answer_lookup'
  | 'answer_mutation'
  | 'progress_mutation'
  | 'response'

type Histogram = {
  count: number
  sumMs: number
  bucketCounts: number[]
}

type RequestObservation = {
  startedAt: bigint
  phases: Array<{
    phase: RequestObservationPhase
    durationMs: number
    startedAt: bigint
    endedAt: bigint
  }>
}

type LabeledHistogram = {
  labels: Record<string, string>
  histogram: Histogram
}

const observationStorage = new AsyncLocalStorage<RequestObservation>()
const HTTP_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000]
const MAX_METRIC_KEYS = 10_000
const OTHER_ROUTE = '__other__'
const finiteMilliseconds = (value: number): number => Number.isFinite(value) && value >= 0 ? value : 0

const httpRequestHistograms = new Map<string, LabeledHistogram>()
const phaseHistograms = new Map<string, LabeledHistogram>()
const prismaCallHistograms = new Map<string, LabeledHistogram>()
const prismaErrorCounts = new Map<string, number>()

let activeRequests = 0
let gcEvents = 0
let gcDurationMs = 0

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
eventLoopDelay.enable()

const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcEvents += 1
    gcDurationMs += entry.duration
  }
})
gcObserver.observe({ entryTypes: ['gc'] })

const keyFor = (labels: Record<string, string>): string => (
  Object.entries(labels).map(([key, value]) => `${key}\u0000${value}`).join('\u0001')
)

const createHistogram = (): Histogram => ({
  count: 0,
  sumMs: 0,
  bucketCounts: HTTP_BUCKETS_MS.map(() => 0),
})

const observeHistogram = (histogram: Histogram, durationMs: number): void => {
  const safeDurationMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0
  histogram.count += 1
  histogram.sumMs += safeDurationMs
  HTTP_BUCKETS_MS.forEach((upperBound, index) => {
    if (safeDurationMs <= upperBound) histogram.bucketCounts[index] += 1
  })
}

const boundedHistogram = (
  store: Map<string, LabeledHistogram>,
  labels: Record<string, string>,
): Histogram => {
  const key = keyFor(labels)
  const current = store.get(key)
  if (current) return current.histogram

  if (store.size >= MAX_METRIC_KEYS - 1) {
    const otherLabels = { ...labels }
    if ('route' in otherLabels) otherLabels.route = OTHER_ROUTE
    if ('model' in otherLabels) otherLabels.model = OTHER_ROUTE
    if ('action' in otherLabels) otherLabels.action = OTHER_ROUTE
    const otherKey = keyFor(otherLabels)
    const other = store.get(otherKey)
    if (other) return other.histogram
    const entry = { labels: otherLabels, histogram: createHistogram() }
    store.set(otherKey, entry)
    return entry.histogram
  }

  const entry = { labels, histogram: createHistogram() }
  store.set(key, entry)
  return entry.histogram
}

const observeLabeledHistogram = (
  store: Map<string, LabeledHistogram>,
  labels: Record<string, string>,
  durationMs: number,
): void => {
  observeHistogram(boundedHistogram(store, labels), durationMs)
}

const escapeLabel = (value: string): string => value
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n')

const labelsText = (labels: Record<string, string>, extra: Record<string, string> = {}): string => (
  Object.entries({ ...labels, ...extra })
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')
)

const normalizeMetricPath = (req: Request): string => {
  const routePath = req.route?.path
  if (typeof routePath === 'string') return `${req.baseUrl}${routePath}`

  // Express does not expose a route template for unmatched requests. Never
  // retain arbitrary path segments in that case: short tokens, names, and
  // other user-controlled values would become metric labels.
  return req.path.startsWith('/api/') ? '/api/:unmatched' : '/:unmatched'
}

const coveredPhaseDurationMs = (observation: RequestObservation): number => {
  // Phases are nested (for example, lookups are inside a transaction). Merge
  // their monotonic intervals before calculating the residual so the same
  // wall-clock time is never subtracted twice.
  const intervals = observation.phases
    .map(({ startedAt, endedAt }) => ({
      startedAt: startedAt < observation.startedAt ? observation.startedAt : startedAt,
      endedAt,
    }))
    .filter(({ startedAt, endedAt }) => endedAt > startedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))

  let coveredNs = 0n
  let currentStart: bigint | null = null
  let currentEnd: bigint | null = null
  for (const interval of intervals) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.startedAt
      currentEnd = interval.endedAt
    } else if (interval.startedAt <= currentEnd) {
      if (interval.endedAt > currentEnd) currentEnd = interval.endedAt
    } else {
      coveredNs += currentEnd - currentStart
      currentStart = interval.startedAt
      currentEnd = interval.endedAt
    }
  }
  if (currentStart !== null && currentEnd !== null) coveredNs += currentEnd - currentStart
  return Number(coveredNs) / 1_000_000
}

/** Attach a request-scoped, non-sensitive performance context. */
export const requestObservabilityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const observation: RequestObservation = {
    startedAt: process.hrtime.bigint(),
    phases: [],
  }
  activeRequests += 1
  let finalized = false

  const finalize = (): void => {
    if (finalized) return
    finalized = true
    const durationMs = Number(process.hrtime.bigint() - observation.startedAt) / 1_000_000
    const route = normalizeMetricPath(req)
    const status = String(res.statusCode || 499)
    observeLabeledHistogram(httpRequestHistograms, {
      method: req.method,
      route,
      status,
    }, durationMs)

    for (const phase of observation.phases) {
      observeLabeledHistogram(phaseHistograms, { phase: phase.phase, route }, phase.durationMs)
    }
    const responseDurationMs = Math.max(0, durationMs - coveredPhaseDurationMs(observation))
    observeLabeledHistogram(phaseHistograms, { phase: 'response', route }, responseDurationMs)
    activeRequests = Math.max(0, activeRequests - 1)

    if (durationMs > 10_000) {
      // Keep the existing slow-request signal, but never include request data.
      // The logger redaction layer also protects the route if a future caller
      // adds a dynamic value to it.
      logger.warn('HTTP request exceeded latency threshold', {
        method: req.method,
        route,
        durationMs: Math.round(durationMs),
      })
    }
  }
  res.once('finish', finalize)
  res.once('close', finalize)

  observationStorage.run(observation, () => next())
}

/** Measure a named request phase without recording payloads or identifiers. */
export const recordRequestPhase = (
  phase: RequestObservationPhase,
  durationMs: number,
  startedAt: bigint = process.hrtime.bigint() - BigInt(Math.max(0, Math.round(durationMs * 1_000_000))),
  endedAt: bigint = process.hrtime.bigint(),
): void => {
  const observation = observationStorage.getStore()
  if (!observation) return
  observation.phases.push({
    phase,
    durationMs: finiteMilliseconds(durationMs),
    startedAt,
    endedAt,
  })
}

export const measureRequestPhase = async <T>(
  phase: RequestObservationPhase,
  operation: () => Promise<T>,
): Promise<T> => {
  const startedAt = process.hrtime.bigint()
  try {
    return await operation()
  } finally {
    const endedAt = process.hrtime.bigint()
    recordRequestPhase(phase, Number(endedAt - startedAt) / 1_000_000, startedAt, endedAt)
  }
}

/** Record wall-clock time until the Prisma middleware returns. */
export const recordPrismaCall = (
  model: string | undefined,
  action: string | undefined,
  durationMs: number,
): void => {
  observeLabeledHistogram(prismaCallHistograms, {
    model: model || 'raw',
    action: action || 'unknown',
  }, durationMs)
}

/** Record only a bounded Prisma error code, never the error or query text. */
export const recordPrismaError = (code: unknown): void => {
  if (typeof code !== 'string' || code.length === 0 || code.length > 32) return
  prismaErrorCounts.set(code, (prismaErrorCounts.get(code) || 0) + 1)
}

const histogramLines = (
  metricName: string,
  entries: Map<string, LabeledHistogram>,
): string[] => {
  const lines: string[] = []
  for (const { labels, histogram } of entries.values()) {
    for (const [index, upperBoundMs] of HTTP_BUCKETS_MS.entries()) {
      lines.push(`${metricName}_bucket{${labelsText(labels, { le: String(upperBoundMs / 1_000) })}} ${histogram.bucketCounts[index]}`)
    }
    lines.push(`${metricName}_bucket{${labelsText(labels, { le: '+Inf' })}} ${histogram.count}`)
    lines.push(`${metricName}_sum{${labelsText(labels)}} ${histogram.sumMs / 1_000}`)
    lines.push(`${metricName}_count{${labelsText(labels)}} ${histogram.count}`)
  }
  return lines
}

const requestCounterLines = (): string[] => (
  [...httpRequestHistograms.values()].map(({ labels, histogram }) => (
    `ptool_api_requests_total{${labelsText(labels)}} ${histogram.count}`
  ))
)

/** Return Prometheus-compatible process, request, phase and Prisma metrics. */
export const runtimeMetricLines = (): string[] => {
  const memory = process.memoryUsage()
  const eventLoopUtilization = performance.eventLoopUtilization()
  const delayP50Ms = finiteMilliseconds(eventLoopDelay.percentile(50) / 1_000_000)
  const delayP95Ms = finiteMilliseconds(eventLoopDelay.percentile(95) / 1_000_000)
  const delayP99Ms = finiteMilliseconds(eventLoopDelay.percentile(99) / 1_000_000)
  const delayMaxMs = finiteMilliseconds(eventLoopDelay.max / 1_000_000)
  eventLoopDelay.reset()

  const lines = [
    '# HELP process_uptime_seconds Process uptime in seconds.',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${process.uptime()}`,
    '# HELP process_resident_memory_bytes Resident memory size in bytes.',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${memory.rss}`,
    '# HELP process_heap_used_bytes V8 heap used in bytes.',
    '# TYPE process_heap_used_bytes gauge',
    `process_heap_used_bytes ${memory.heapUsed}`,
    '# HELP process_heap_total_bytes V8 heap total in bytes.',
    '# TYPE process_heap_total_bytes gauge',
    `process_heap_total_bytes ${memory.heapTotal}`,
    '# HELP ptool_nodejs_active_requests Current in-flight HTTP requests.',
    '# TYPE ptool_nodejs_active_requests gauge',
    `ptool_nodejs_active_requests ${activeRequests}`,
    '# HELP ptool_nodejs_event_loop_utilization Event-loop utilization ratio.',
    '# TYPE ptool_nodejs_event_loop_utilization gauge',
    `ptool_nodejs_event_loop_utilization ${eventLoopUtilization.utilization}`,
    '# HELP ptool_nodejs_event_loop_active_seconds_total Cumulative event-loop active time.',
    '# TYPE ptool_nodejs_event_loop_active_seconds_total counter',
    `ptool_nodejs_event_loop_active_seconds_total ${eventLoopUtilization.active / 1_000}`,
    '# HELP ptool_nodejs_event_loop_idle_seconds_total Cumulative event-loop idle time.',
    '# TYPE ptool_nodejs_event_loop_idle_seconds_total counter',
    `ptool_nodejs_event_loop_idle_seconds_total ${eventLoopUtilization.idle / 1_000}`,
    '# HELP ptool_nodejs_event_loop_delay_seconds Event-loop delay observed since the previous scrape.',
    '# TYPE ptool_nodejs_event_loop_delay_seconds gauge',
    `ptool_nodejs_event_loop_delay_seconds{quantile="0.5"} ${delayP50Ms / 1_000}`,
    `ptool_nodejs_event_loop_delay_seconds{quantile="0.95"} ${delayP95Ms / 1_000}`,
    `ptool_nodejs_event_loop_delay_seconds{quantile="0.99"} ${delayP99Ms / 1_000}`,
    `ptool_nodejs_event_loop_delay_seconds{quantile="max"} ${delayMaxMs / 1_000}`,
    '# HELP ptool_nodejs_gc_events_total Garbage-collection event count.',
    '# TYPE ptool_nodejs_gc_events_total counter',
    `ptool_nodejs_gc_events_total ${gcEvents}`,
    '# HELP ptool_nodejs_gc_duration_seconds_total Garbage-collection wall time.',
    '# TYPE ptool_nodejs_gc_duration_seconds_total counter',
    `ptool_nodejs_gc_duration_seconds_total ${gcDurationMs / 1_000}`,
    '# HELP ptool_http_request_duration_seconds Completed HTTP request latency.',
    '# TYPE ptool_http_request_duration_seconds histogram',
    ...histogramLines('ptool_http_request_duration_seconds', httpRequestHistograms),
    // Keep the pre-PR35 counter so existing availability alerts and
    // dashboards remain valid while consumers migrate to the histogram.
    '# HELP ptool_api_requests_total Completed HTTP requests by normalized route and status.',
    '# TYPE ptool_api_requests_total counter',
    ...requestCounterLines(),
    '# HELP ptool_assessment_phase_duration_seconds Instrumented assessment phase latency.',
    '# TYPE ptool_assessment_phase_duration_seconds histogram',
    ...histogramLines('ptool_assessment_phase_duration_seconds', phaseHistograms),
    '# HELP ptool_prisma_call_duration_seconds Prisma call wall-clock latency by model and action.',
    '# TYPE ptool_prisma_call_duration_seconds histogram',
    ...histogramLines('ptool_prisma_call_duration_seconds', prismaCallHistograms),
    '# HELP ptool_prisma_errors_total Prisma error codes observed by middleware.',
    '# TYPE ptool_prisma_errors_total counter',
    ...[...prismaErrorCounts.entries()].map(([code, count]) => `ptool_prisma_errors_total{code="${escapeLabel(code)}"} ${count}`),
  ]
  return lines
}

/** Test-only reset for the process-local metric registry. */
export const resetRuntimeObservabilityForTests = (): void => {
  httpRequestHistograms.clear()
  phaseHistograms.clear()
  prismaCallHistograms.clear()
  prismaErrorCounts.clear()
  activeRequests = 0
  gcEvents = 0
  gcDurationMs = 0
  eventLoopDelay.reset()
}
