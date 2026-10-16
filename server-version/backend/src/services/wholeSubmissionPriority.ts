import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { RequestHandler } from 'express'
import { onReportSchedulingHint, prepareReportReadyNotifications, publishReportSchedulingHint } from './reportReadyNotifications'
import { runtimeEventLoopDelayMs } from './runtimeObservability'
import { logger } from '../utils/logger'

const enabled = () => process.env.ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED === 'true'
const now = () => performance.now()
const TTL_MS = 1500
const COALESCE_MS = 100
const QUIET_MS = 200
const MAX_YIELD_MS = 2000
const YIELD_COOLDOWN_MS = 10000
const RECOVERY_MS = 300

type Hint = { source: string; seq: number; active: number; busy: boolean; lagMs: number; expires: number }
export type ClaimDecision = { mode: 'normal' | 'yield' | 'minimum' | 'recover' | 'sustained' | 'disabled'; limit: number; delayMs: number; sources: number }

/** Process-local advisory state. No answer, authorization, budget or lease authority. */
export class ReportClaimPriority {
  private sources = new Map<string, Hint>()
  private busySince: number | null = null
  private recoveringUntil = 0
  private yieldUntil = 0
  private nextYieldAllowedAt = 0
  private override: { enabled: boolean; expires: number } | null = null
  constructor(private readonly clock = now, private readonly isolated = false) {}
  receive(message: string): void {
    if (message.length > 350) return
    let value: Record<string, unknown>
    try { value = JSON.parse(message) } catch { return }
    if (!value || typeof value !== 'object' || value.v !== 1) return
    const at = this.clock()
    if (value.kind === 'control') {
      // Private Redis admin control, only in an explicitly isolated load test.
      // Expires automatically; no HTTP endpoint or durable configuration change.
      if (this.isolated && typeof value.enabled === 'boolean' && typeof value.ttlMs === 'number'
          && Number.isFinite(value.ttlMs) && value.ttlMs > 0 && value.ttlMs <= 120000) {
        this.override = { enabled: value.enabled, expires: at + value.ttlMs }
      }
      return
    }
    if (value.kind !== 'pressure' || typeof value.source !== 'string' || !/^[a-f0-9]{32}$/.test(value.source)
        || typeof value.seq !== 'number' || !Number.isSafeInteger(value.seq) || value.seq < 0
        || typeof value.active !== 'number' || !Number.isSafeInteger(value.active) || value.active < 0 || value.active > 10000
        || typeof value.busy !== 'boolean') return
    for (const [key, hint] of this.sources) if (hint.expires <= at) this.sources.delete(key)
    const prior = this.sources.get(value.source)
    if (prior && prior.seq >= value.seq) return
    if (!prior && this.sources.size >= 32) return
    this.sources.set(value.source, { source: value.source, seq: value.seq, active: value.active, busy: value.busy,
      lagMs: typeof value.lagMs === 'number' && Number.isFinite(value.lagMs) ? Math.max(0, Math.min(60000, value.lagMs)) : 100,
      expires: at + TTL_MS })
  }
  decision(configuredConcurrency: number): ClaimDecision {
    const at = this.clock()
    for (const [key, hint] of this.sources) if (hint.expires <= at) this.sources.delete(key)
    if (this.override && this.override.expires <= at) this.override = null
    if (this.override?.enabled === false) {
      this.busySince = null; this.recoveringUntil = 0
      return { mode: 'disabled', limit: configuredConcurrency, delayMs: 0, sources: this.sources.size }
    }
    const busy = [...this.sources.values()].some(hint => hint.busy)
    if (busy) {
      if (this.busySince === null) {
        this.busySince = at
        // Repeated short quiet gaps cannot starve durable reports indefinitely.
        if (at >= this.nextYieldAllowedAt) {
          this.yieldUntil = at + MAX_YIELD_MS
          this.nextYieldAllowedAt = at + YIELD_COOLDOWN_MS
        } else this.yieldUntil = 0
      }
      this.recoveringUntil = 0
      if (at < this.yieldUntil) return { mode: 'yield', limit: 0, delayMs: 50, sources: this.sources.size }
      // A fixed claim interval caps throughput even when CPU is idle.
      // Keep one runnable task only for CURRENT high API loop delay; when the
      // API is responsive, restore existing slots without adding processes.
      const strained = [...this.sources.values()].some(hint => hint.busy && hint.lagMs >= 80)
      return { mode: strained ? 'minimum' : 'sustained', limit: strained ? Math.min(1, configuredConcurrency) : configuredConcurrency,
        delayMs: 0, sources: this.sources.size }
    }
    if (this.busySince !== null) {
      this.busySince = null
      // Missing/expired signals fail open immediately. A real quiet hint ramps.
      this.recoveringUntil = this.sources.size ? at + RECOVERY_MS : 0
    }
    if (at < this.recoveringUntil) return { mode: 'recover', limit: Math.min(1, configuredConcurrency), delayMs: 0, sources: this.sources.size }
    return { mode: 'normal', limit: configuredConcurrency, delayMs: 0, sources: this.sources.size }
  }
  claimed(): void { /* No artificial delay between completed durable jobs. */ }
}

/** Deterministic coalescing state, also exercised with a fake clock. */
export class WholeSubmissionPressure {
  active = 0
  private lastHighPressureAt = -Infinity
  private slowUntil = 0
  private latched = false
  constructor(private readonly clock = now) {}
  begin(): () => void {
    const started = this.clock(); this.active++
    let ended = false
    return () => {
      if (ended) return
      ended = true; this.active = Math.max(0, this.active - 1)
      if (this.clock() - started >= 300) this.slowUntil = this.clock() + QUIET_MS
    }
  }
  snapshot(lagMs = 0): { active: number; busy: boolean } {
    const at = this.clock()
    if (this.active >= 4 || (this.active >= 2 && (lagMs >= 80 || at < this.slowUntil))) {
      this.latched = true; this.lastHighPressureAt = at
    }
    // Quiet means low pressure, not zero traffic. A continuous light stream
    // must recover full report capacity after a preceding burst.
    const low = this.active <= 1 || (this.active <= 2 && lagMs < 40 && at >= this.slowUntil)
    if (low && at - this.lastHighPressureAt >= QUIET_MS) this.latched = false
    return { active: this.active, busy: this.latched }
  }
}
const pressure = new WholeSubmissionPressure()
const source = randomUUID().replace(/-/g, '')
let sequence = 0
let publishTimer: ReturnType<typeof setTimeout> | null = null
let scheduledAt = Infinity
let lastPublishedAt = -Infinity
let lastBusyPublished = false
let publishing = false
let publisherActive = false
const emitPressure = async (): Promise<void> => {
  publishTimer = null; scheduledAt = Infinity
  if (!enabled() || publishing) return
  const state = pressure.snapshot(runtimeEventLoopDelayMs())
  // No per-submission Redis operation for the normal single-person path.
  // A quiet hint is needed only to clear a previously published busy hint.
  if (!state.busy && !lastBusyPublished) return
  publishing = true; lastPublishedAt = now(); lastBusyPublished = state.busy
  try { await publishReportSchedulingHint(JSON.stringify({ v: 1, kind: 'pressure', source, seq: ++sequence, ...state, lagMs: runtimeEventLoopDelayMs() })) }
  finally {
    publishing = false
    if (enabled() && (pressure.active > 0 || state.busy)) schedulePressure()
  }
}
const schedulePressure = (delay = COALESCE_MS): void => {
  if (publishing) return
  const deadline = Math.max(now() + delay, lastPublishedAt + COALESCE_MS)
  if (publishTimer && scheduledAt <= deadline) return
  if (publishTimer) clearTimeout(publishTimer)
  scheduledAt = deadline
  publishTimer = setTimeout(() => { void emitPressure() }, Math.max(0, deadline - now())); publishTimer.unref()
}
export const authenticatedWholeSubmissionPriority: RequestHandler = (req, res, next) => {
  // Authentication can finish after a client/proxy has already closed the
  // response. Such finish/close events will not be replayed to late listeners.
  const closed = () => req.aborted || res.destroyed || res.writableEnded || res.writableFinished
  if (!enabled() || !req.user || closed()) return next()
  const finish = pressure.begin()
  let released = false
  const ended = () => {
    if (released) return
    released = true
    finish()
    res.removeListener('finish', ended); res.removeListener('close', ended)
    req.removeListener?.('aborted', ended)
    schedulePressure()
  }
  res.once('finish', ended); res.once('close', ended)
  req.once?.('aborted', ended)
  if (closed()) ended()
  // On entry this is a timer, never a Redis operation per submission.
  schedulePressure(pressure.snapshot(runtimeEventLoopDelayMs()).busy ? 0 : COALESCE_MS)
  return next()
}
export const prepareWholeSubmissionPriority = (): void => {
  if (!enabled() || publisherActive) return
  publisherActive = true
  // Establish the shared advisory publisher before the first participant waits.
  void publishReportSchedulingHint(JSON.stringify({ v: 1, kind: 'pressure', source, seq: ++sequence, active: 0, busy: false }))
}
let policy: ReportClaimPriority | null = null
let detach: (() => void) | null = null
let reconnectTimer: ReturnType<typeof setInterval> | null = null
let previousMode = ''
let modeStartedAt = now()
let lastObservationAt = -Infinity
const modeDurations: Record<string, number> = {}
export const startReportClaimPriority = (): void => {
  if (!enabled() || policy) return
  policy = new ReportClaimPriority(now, process.env.PERF_ISOLATED_TEST_MODE === '1')
  detach = onReportSchedulingHint(message => policy?.receive(message))
  reconnectTimer = setInterval(() => { void prepareReportReadyNotifications() }, 1000); reconnectTimer.unref()
}
export const reportClaimDecision = (concurrency: number, active: number): ClaimDecision => {
  const decision = policy?.decision(concurrency) ?? { mode: 'normal' as const, limit: concurrency, delayMs: 0, sources: 0 }
  const at = now(), changed = decision.mode !== previousMode
  if (changed) {
    if (previousMode) modeDurations[previousMode] = (modeDurations[previousMode] ?? 0) + at - modeStartedAt
    previousMode = decision.mode; modeStartedAt = at
  }
  if (policy && (changed || at - lastObservationAt >= 1000)) {
    lastObservationAt = at
    const durationsMs = { ...modeDurations, [decision.mode]: (modeDurations[decision.mode] ?? 0) + at - modeStartedAt }
    const line = 'REPORT_CLAIM_SCHEDULE ' + JSON.stringify({ ...decision, activeJobs: active, durationsMs,
      wallMs: Date.now(), monotonicNs: process.hrtime.bigint().toString() })
    // Isolated diagnostics must not disappear when the normal log level is ERROR.
    if (process.env.PERF_ISOLATED_TEST_MODE === '1' && process.env.ASSESSMENT_TIMELINE_ENABLED === 'true') process.stdout.write(line + '\n')
    else if (changed) logger.info(line)
  }
  return decision
}
export const reportPriorityClaimed = (): void => policy?.claimed()
export const stopReportClaimPriority = (): void => {
  detach?.(); detach = null; policy = null; previousMode = ''
  if (reconnectTimer) clearInterval(reconnectTimer)
  reconnectTimer = null
}
