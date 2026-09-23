import { AsyncLocalStorage } from 'node:async_hooks'
import { monitorEventLoopDelay, PerformanceObserver, performance } from 'node:perf_hooks'
import type { NextFunction, Request, Response } from 'express'
import { logger } from '../utils/logger'

export type RequestObservationPhase =
  | 'resume_auth'
  | 'auth_account_lookup'
  | 'request_body_receive_parse'
  | 'transaction_acquisition'
  | 'transaction'
  | 'completion_queue_wait'
  | 'serialization_backoff'
  | 'row_lock_roundtrip'
  | 'assessment_lookup'
  | 'definition_lookup'
  | 'existing_answer_lookup'
  | 'answer_mutation'
  | 'progress_mutation'
  | 'final_submit_admission'
  | 'final_submit_definition_prepare'
  | 'final_submit_payload_validation'
  | 'final_submit_payload_hash'
  | 'final_submit_context_read'
  | 'final_submit_scoring'
  | 'final_submit_serialization'
  | 'final_submit_encryption'
  | 'final_submit_transaction_wait'
  | 'final_submit_transaction_wall_time'
  | 'final_submit_row_lock_wait'
  | 'final_submit_db_compute'
  | 'final_submit_db_query'
  | 'final_submit_non_db_compute'
  | 'final_submit_commit'
  | 'final_submit_parent_finalization'
  | 'final_submit_retry_backoff'
  | 'sjt.validation_index'
  | 'snapshot.parse_hash'
  | 'cognitive.frozen_report_db'
  | 'cognitive.frozen_report_decrypt'
  | 'response.build'
  | 'aggregate.parent_probe_db'
  | 'aggregate.header_db'
  | 'aggregate.definition_db'
  | 'aggregate.payload_db'
  | 'aggregate.decrypt_parse'
  | 'aggregate.validate'
  | 'aggregate.analysis'
  | 'aggregate.report'
  | 'aggregate.encrypt'
  | 'aggregate.persist'
  | 'aggregate.cas_loser'
  | 'response'

/** Explicitly opt into count-only SQL events on an isolated test instance. */
export const sqlEventCollectionEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => (
  env.PERF_ISOLATED_TEST_MODE === '1' && env.PERF_SQL_EVENT_COUNT === '1'
)

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

type LabeledCounter = {
  labels: Record<string, string>
  count: number
}

const observationStorage = new AsyncLocalStorage<RequestObservation>()
const HTTP_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000]
const MAX_METRIC_KEYS = 10_000
const OTHER_ROUTE = '__other__'
const finiteMilliseconds = (value: number): number => Number.isFinite(value) && value >= 0 ? value : 0

const safeMemoryUsage = (): NodeJS.MemoryUsage | null => {
  try {
    return process.memoryUsage()
  } catch {
    // Omit unavailable values; zero would falsely claim no memory usage.
    return null
  }
}

const httpRequestHistograms = new Map<string, LabeledHistogram>()
const phaseHistograms = new Map<string, LabeledHistogram>()
const prismaCallHistograms = new Map<string, LabeledHistogram>()
const slowRequestCounts = new Map<string, LabeledCounter>()
const serializableAttemptCounts = new Map<string, LabeledCounter>()
const serializationConflictCounts = new Map<string, LabeledCounter>()
const completionAdmissionRejectionCounts = new Map<string, LabeledCounter>()
const prismaErrorCounts = new Map<string, number>()
let prismaSqlEventCount = 0
let prismaSqlEventDurationMs = 0

const SLOW_REQUEST_THRESHOLDS = [
  { milliseconds: 500, label: '500ms' },
  { milliseconds: 1_000, label: '1s' },
  { milliseconds: 2_000, label: '2s' },
] as const

let activeRequests = 0
let gcEvents = 0
let gcDurationMs = 0
let completionAdmissionActive = 0
let completionAdmissionQueue = 0
const boundedAdmissionGateStates = new Map<string, { active: number; queued: number }>()
const boundedAdmissionRejectionCounts = new Map<string, LabeledCounter>()

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

const boundedCounter = (
  store: Map<string, LabeledCounter>,
  labels: Record<string, string>,
): LabeledCounter => {
  const key = keyFor(labels)
  const current = store.get(key)
  if (current) return current

  if (store.size >= MAX_METRIC_KEYS - 1) {
    const otherLabels = { ...labels }
    if ('route' in otherLabels) otherLabels.route = OTHER_ROUTE
    if ('operation' in otherLabels) otherLabels.operation = OTHER_ROUTE
    if ('attempt' in otherLabels) otherLabels.attempt = OTHER_ROUTE
    if ('code' in otherLabels) otherLabels.code = OTHER_ROUTE
    if ('reason' in otherLabels) otherLabels.reason = OTHER_ROUTE
    const otherKey = keyFor(otherLabels)
    const other = store.get(otherKey)
    if (other) return other
    const entry = { labels: otherLabels, count: 0 }
    store.set(otherKey, entry)
    return entry
  }

  const entry = { labels, count: 0 }
  store.set(key, entry)
  return entry
}

const incrementSlowRequestCount = (labels: Record<string, string>): void => {
  boundedCounter(slowRequestCounts, labels).count += 1
}

const incrementCounter = (store: Map<string, LabeledCounter>, labels: Record<string, string>): void => {
  boundedCounter(store, labels).count += 1
}

/** Record one bounded Serializable transaction attempt. */
export const recordSerializableAttempt = (operation: string, attempt: number): void => {
  if (!operation || operation.length > 64 || !Number.isSafeInteger(attempt) || attempt < 1) return
  incrementCounter(serializableAttemptCounts, { operation, attempt: String(attempt) })
}

/** Record a PostgreSQL/Prisma serialization conflict without query text. */
export const recordSerializationConflict = (operation: string, code: string): void => {
  if (!operation || operation.length > 64 || !code || code.length > 32) return
  incrementCounter(serializationConflictCounts, { operation, code })
}

/** Record an admission rejection reason for the bounded completion queue. */
export const recordCompletionAdmissionRejection = (reason: string): void => {
  if (!reason || reason.length > 32) return
  incrementCounter(completionAdmissionRejectionCounts, { reason })
}

/** Publish the current process-local completion admission state as gauges. */
export const setCompletionAdmissionState = (active: number, queued: number): void => {
  completionAdmissionActive = Math.max(0, Math.floor(active))
  completionAdmissionQueue = Math.max(0, Math.floor(queued))
}

const normalizeGateName = (gate: string): string | null => {
  if (!gate || gate.length > 64) return null
  return gate
}

/** Record a labelled rejection for any BoundedAdmissionGate instance. */
export const recordBoundedAdmissionRejection = (gate: string, reason: string): void => {
  const normalizedGate = normalizeGateName(gate)
  if (!normalizedGate || !reason || reason.length > 32) return
  incrementCounter(boundedAdmissionRejectionCounts, { gate: normalizedGate, reason })
}

/** Publish active/queued gauges for a named BoundedAdmissionGate. */
export const setBoundedAdmissionGateState = (gate: string, active: number, queued: number): void => {
  const normalizedGate = normalizeGateName(gate)
  if (!normalizedGate) return
  if (boundedAdmissionGateStates.size >= MAX_METRIC_KEYS - 1 && !boundedAdmissionGateStates.has(normalizedGate)) {
    return
  }
  boundedAdmissionGateStates.set(normalizedGate, {
    active: Math.max(0, Math.floor(active)),
    queued: Math.max(0, Math.floor(queued)),
  })
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

type MonotonicInterval = { startedAt: bigint; endedAt: bigint }

const phaseIntervals = (observation: RequestObservation, requestEndedAt: bigint): MonotonicInterval[] => observation.phases
  .map(({ startedAt, endedAt }) => ({
    startedAt: startedAt < observation.startedAt ? observation.startedAt : startedAt,
    endedAt: endedAt > requestEndedAt ? requestEndedAt : endedAt,
  }))
  .filter(({ startedAt, endedAt }) => endedAt > startedAt)
  .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))

const unionDurationNs = (intervals: MonotonicInterval[]): bigint => {
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
  return coveredNs
}

const coveredPhaseDurationMs = (observation: RequestObservation, requestEndedAt: bigint): number => (
  Number(unionDurationNs(phaseIntervals(observation, requestEndedAt))) / 1_000_000
)

const exclusivePhaseAttribution = (
  observation: RequestObservation,
  requestEndedAt: bigint,
): Map<string, number> => {
  const phases = observation.phases.map((phase) => ({
    ...phase,
    startedAt: phase.startedAt < observation.startedAt ? observation.startedAt : phase.startedAt,
    endedAt: phase.endedAt > requestEndedAt ? requestEndedAt : phase.endedAt,
  })).filter((phase) => phase.endedAt > phase.startedAt)
  const boundaries = new Set<bigint>([observation.startedAt, requestEndedAt])
  for (const phase of phases) {
    boundaries.add(phase.startedAt)
    boundaries.add(phase.endedAt)
  }
  const orderedBoundaries = [...boundaries].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  const attribution = new Map<string, number>()

  // Partition the request timeline into disjoint intervals. When phases are
  // nested, the shortest active interval is the most specific one, so the
  // outer transaction envelope contributes only its uncovered time under
  // `transaction_other`.
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const startedAt = orderedBoundaries[index]
    const endedAt = orderedBoundaries[index + 1]
    if (endedAt <= startedAt) continue
    const midpoint = startedAt + ((endedAt - startedAt) / 2n)
    const active = phases.filter((phase) => phase.startedAt <= midpoint && midpoint < phase.endedAt)
    const selected = active.sort((left, right) => {
      const leftLength = left.endedAt - left.startedAt
      const rightLength = right.endedAt - right.startedAt
      if (leftLength !== rightLength) return leftLength < rightLength ? -1 : 1
      return left.phase.localeCompare(right.phase)
    })[0]
    const label = selected?.phase === 'transaction' ? 'transaction_other' : selected?.phase || 'response_other'
    const durationMs = Number(endedAt - startedAt) / 1_000_000
    attribution.set(label, (attribution.get(label) || 0) + durationMs)
  }
  return attribution
}

const dominantPhaseFor = (attribution: Map<string, number>): string => {
  let dominant = 'response_other'
  let dominantDuration = -1
  for (const [phase, durationMs] of attribution.entries()) {
    if (durationMs > dominantDuration) {
      dominant = phase
      dominantDuration = durationMs
    }
  }
  return dominant
}

/** Attach a request-scoped, non-sensitive performance context. */
export const requestObservabilityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const observation: RequestObservation = {
    startedAt: process.hrtime.bigint(),
    phases: [],
  }
  activeRequests += 1
  let finalized = false
  let responseFinished = false

  const finalize = (aborted: boolean): void => {
    if (finalized) return
    finalized = true
    const requestEndedAt = process.hrtime.bigint()
    const durationMs = Number(requestEndedAt - observation.startedAt) / 1_000_000
    const route = normalizeMetricPath(req)
    const status = aborted ? '499' : String(res.statusCode ?? 200)
    observeLabeledHistogram(httpRequestHistograms, {
      method: req.method,
      route,
      status,
    }, durationMs)

    for (const phase of observation.phases) {
      observeLabeledHistogram(phaseHistograms, { phase: phase.phase, route }, phase.durationMs)
    }
    const responseDurationMs = Math.max(0, durationMs - coveredPhaseDurationMs(observation, requestEndedAt))
    observeLabeledHistogram(phaseHistograms, { phase: 'response', route }, responseDurationMs)
    // Defer the exclusive dominant-phase attribution until a request is actually
    // slow (>= 500ms). It allocates Sets/Maps and sorts phase boundaries, so
    // computing it on every request adds avoidable CPU + GC pressure on the hot
    // path; the result is only consumed by the slow-request thresholds below.
    let dominantPhase: string | null = null
    for (const threshold of SLOW_REQUEST_THRESHOLDS) {
      if (durationMs > threshold.milliseconds) {
        if (dominantPhase === null) {
          dominantPhase = dominantPhaseFor(exclusivePhaseAttribution(observation, requestEndedAt))
        }
        incrementSlowRequestCount({
          route,
          threshold: threshold.label,
          dominant_phase: dominantPhase,
        })
      }
    }
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
  res.once('finish', () => {
    responseFinished = true
    finalize(false)
  })
  res.once('close', () => {
    // `close` can fire without `finish` when the client disconnects. Node's
    // default statusCode is 200 in that case, so explicitly record 499.
    finalize(!responseFinished && !res.writableFinished)
  })

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

/** Measure a synchronous CPU phase without forcing callers to become async. */
export const measureRequestPhaseSync = <T>(
  phase: RequestObservationPhase,
  operation: () => T,
): T => {
  const startedAt = process.hrtime.bigint()
  try {
    return operation()
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

/** Process-wide SQL event count for opt-in test collection; not per-request. */
export const recordPrismaSqlEvent = (durationMs: number): void => {
  if (!sqlEventCollectionEnabled()) return
  if (!Number.isFinite(durationMs) || durationMs < 0) return
  prismaSqlEventCount += 1
  prismaSqlEventDurationMs += durationMs
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
  const memory = safeMemoryUsage()
  const cpu = process.cpuUsage()
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
    '# HELP process_cpu_seconds_total Cumulative process CPU time across all requests.',
    '# TYPE process_cpu_seconds_total counter',
    `process_cpu_seconds_total ${(cpu.user + cpu.system) / 1_000_000}`,
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
    '# HELP ptool_slow_requests_total Requests above latency thresholds classified by exclusive dominant phase.',
    '# TYPE ptool_slow_requests_total counter',
    ...[...slowRequestCounts.values()].map(({ labels, count }) => `ptool_slow_requests_total{${labelsText(labels)}} ${count}`),
    '# HELP ptool_serializable_attempts_total Serializable transaction attempts by operation and attempt number.',
    '# TYPE ptool_serializable_attempts_total counter',
    ...[...serializableAttemptCounts.values()].map(({ labels, count }) => `ptool_serializable_attempts_total{${labelsText(labels)}} ${count}`),
    '# HELP ptool_serialization_conflicts_total Serializable transaction conflicts by operation and code.',
    '# TYPE ptool_serialization_conflicts_total counter',
    ...[...serializationConflictCounts.values()].map(({ labels, count }) => `ptool_serialization_conflicts_total{${labelsText(labels)}} ${count}`),
    '# HELP ptool_completion_admission_rejections_total Completion admission rejections by reason.',
    '# TYPE ptool_completion_admission_rejections_total counter',
    ...[...completionAdmissionRejectionCounts.values()].map(({ labels, count }) => `ptool_completion_admission_rejections_total{${labelsText(labels)}} ${count}`),
    '# HELP ptool_questionnaire_completion_admission_active Active questionnaire completion operations in this process.',
    '# TYPE ptool_questionnaire_completion_admission_active gauge',
    `ptool_questionnaire_completion_admission_active ${completionAdmissionActive}`,
    '# HELP ptool_questionnaire_completion_admission_queue Queued questionnaire completion operations in this process.',
    '# TYPE ptool_questionnaire_completion_admission_queue gauge',
    `ptool_questionnaire_completion_admission_queue ${completionAdmissionQueue}`,
    '# HELP ptool_bounded_admission_active Active operations admitted by a named BoundedAdmissionGate.',
    '# TYPE ptool_bounded_admission_active gauge',
    ...[...boundedAdmissionGateStates.entries()].map(([gate, state]) => `ptool_bounded_admission_active{gate="${escapeLabel(gate)}"} ${state.active}`),
    '# HELP ptool_bounded_admission_queue Queued operations waiting on a named BoundedAdmissionGate.',
    '# TYPE ptool_bounded_admission_queue gauge',
    ...[...boundedAdmissionGateStates.entries()].map(([gate, state]) => `ptool_bounded_admission_queue{gate="${escapeLabel(gate)}"} ${state.queued}`),
    '# HELP ptool_bounded_admission_rejections_total BoundedAdmissionGate rejections by gate and reason.',
    '# TYPE ptool_bounded_admission_rejections_total counter',
    ...[...boundedAdmissionRejectionCounts.values()].map(({ labels, count }) => `ptool_bounded_admission_rejections_total{${labelsText(labels)}} ${count}`),
    '# HELP ptool_prisma_call_duration_seconds Prisma call wall-clock latency by model and action.',
    '# TYPE ptool_prisma_call_duration_seconds histogram',
    ...histogramLines('ptool_prisma_call_duration_seconds', prismaCallHistograms),
    '# HELP ptool_prisma_errors_total Prisma error codes observed by middleware.',
    '# TYPE ptool_prisma_errors_total counter',
    ...[...prismaErrorCounts.entries()].map(([code, count]) => `ptool_prisma_errors_total{code="${escapeLabel(code)}"} ${count}`),
  ]
  if (memory) {
    lines.push(
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memory.rss}`,
      '# HELP process_heap_used_bytes V8 heap used in bytes.',
      '# TYPE process_heap_used_bytes gauge',
      `process_heap_used_bytes ${memory.heapUsed}`,
      '# HELP process_heap_total_bytes V8 heap total in bytes.',
      '# TYPE process_heap_total_bytes gauge',
      `process_heap_total_bytes ${memory.heapTotal}`,
    )
  }
  if (sqlEventCollectionEnabled()) {
    lines.push(
      '# HELP ptool_prisma_sql_events_total Process-wide Prisma SQL events; not HTTP requests or network round trips.',
      '# TYPE ptool_prisma_sql_events_total counter',
      `ptool_prisma_sql_events_total ${prismaSqlEventCount}`,
      '# HELP ptool_prisma_sql_event_duration_seconds_total Process-wide SQL event durations.',
      '# TYPE ptool_prisma_sql_event_duration_seconds_total counter',
      `ptool_prisma_sql_event_duration_seconds_total ${prismaSqlEventDurationMs / 1_000}`,
    )
  }
  return lines
}

/** Test-only reset for the process-local metric registry. */
export const resetRuntimeObservabilityForTests = (): void => {
  httpRequestHistograms.clear()
  phaseHistograms.clear()
  prismaCallHistograms.clear()
  slowRequestCounts.clear()
  serializableAttemptCounts.clear()
  serializationConflictCounts.clear()
  completionAdmissionRejectionCounts.clear()
  boundedAdmissionRejectionCounts.clear()
  boundedAdmissionGateStates.clear()
  prismaErrorCounts.clear()
  prismaSqlEventCount = 0
  prismaSqlEventDurationMs = 0
  activeRequests = 0
  gcEvents = 0
  gcDurationMs = 0
  completionAdmissionActive = 0
  completionAdmissionQueue = 0
  eventLoopDelay.reset()
}
