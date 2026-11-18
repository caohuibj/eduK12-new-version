import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { BoundedAdmissionBusyError, BoundedAdmissionGate, configuredInteger } from './boundedAdmissionGate'
import { InstrumentFinalSubmitError } from './instrumentFinalSubmit'
import { logger } from '../utils/logger'
export type AssessmentResourceSample = {
  at: number
  availableBytes: number | null
  cpuPercent: number | null
  cpuAt?: number
}
export type ResourceClaimDecision = { mode: 'normal' | 'limited' | 'protected'; limit: number; delayMs: number; reason: string | null }
export type LowMemoryTrickleConfig = {
  floorMiB: number
  releaseMiB: number
  maxCpuPercent: number
  maxConcurrent: number
  maxQueue: number
  maxWaitMs: number
}
export type StartAdmissionDecision =
  | { action: 'allow'; reason: null; retryHint: null }
  | { action: 'trickle'; reason: 'low_memory_trickle'; retryHint: null }
  | {
      action: 'reject_memory' | 'reject_cpu'
      reason: 'observation_unavailable' | 'host_memory' | 'host_cpu' | 'low_memory_cpu_busy' | 'cpu_observation_unavailable'
      retryHint: 'memory' | 'cpu'
    }

// Only the typed START resource-gate rejection is safe to fail fast during
// scale precomputation. Other HTTP 503s may be transient and must retain the
// existing in-transaction fallback.
export const isAssessmentStartResourceGateError = (error: unknown): error is InstrumentFinalSubmitError =>
  error instanceof InstrumentFinalSubmitError
  && error.code === 'INSTRUMENT_NOT_AVAILABLE'
  && error.statusCode === 503
const enabled = () => process.env.ASSESSMENT_RESOURCE_PROTECTION_ENABLED === 'true'
export const isLowMemoryTrickleEnabled = (): boolean =>
  enabled() && process.env.ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED === 'true'
const MiB = 1024 * 1024
// host_cpu spikes recede in 2-3s (R1/R2 measured); configurable so the value can
// be rolled back to 10 without a redeploy if R3 shows retry-window collisions.
const HOST_CPU_RETRY_AFTER_SECONDS = configuredInteger('ASSESSMENT_HOST_CPU_RETRY_AFTER_SECONDS', 3)
export const configuredMemoryRetryAfterSeconds = (): number => {
  const value = configuredInteger('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', 10)
  if (value > 60) throw new Error('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS must be at most 60')
  return value
}
const HOST_MEMORY_RETRY_AFTER_SECONDS = configuredMemoryRetryAfterSeconds()
const configuredBoundedInteger = (
  name: string,
  fallback: number,
  min: number,
  max: number,
  allowZero = false,
): number => {
  const value = configuredInteger(name, fallback, allowZero)
  if (value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}
let cachedTrickleConfig: { key: string; value: LowMemoryTrickleConfig } | null = null
export const configuredLowMemoryTrickleConfig = (): LowMemoryTrickleConfig => {
  const key = [
    process.env.ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB ?? '',
    process.env.ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB ?? '',
    process.env.ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT ?? '',
    process.env.ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT ?? '',
    process.env.ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE ?? '',
    process.env.ASSESSMENT_START_LOW_MEMORY_MAX_WAIT_MS ?? '',
  ].join('|')
  if (cachedTrickleConfig && cachedTrickleConfig.key === key) return cachedTrickleConfig.value
  const floorMiB = configuredBoundedInteger('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', 650, 512, 699)
  const defaultReleaseMiB = Math.min(700, floorMiB + 20)
  const releaseMiB = configuredBoundedInteger(
    'ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB',
    defaultReleaseMiB,
    floorMiB,
    700,
  )
  const value: LowMemoryTrickleConfig = {
    floorMiB,
    releaseMiB,
    maxCpuPercent: configuredBoundedInteger('ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT', 80, 1, 94),
    maxConcurrent: configuredBoundedInteger('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', 1, 0, 10, true),
    maxQueue: configuredBoundedInteger('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', 1, 0, 20, true),
    maxWaitMs: configuredBoundedInteger('ASSESSMENT_START_LOW_MEMORY_MAX_WAIT_MS', 2000, 100, 15000),
  }
  cachedTrickleConfig = { key, value }
  return value
}
if (isLowMemoryTrickleEnabled()) {
  configuredLowMemoryTrickleConfig()
}
let sample: AssessmentResourceSample | null = null
let memSampleAt = -Infinity
let cpuSampleAt = -Infinity
let previousCpu: { total: number; idle: number } | null = null
export const sampleAssessmentHostResources = (options?: { forceMemoryRefresh?: boolean }): AssessmentResourceSample => {
  const at = performance.now()
  const needsMemory = Boolean(options?.forceMemoryRefresh) || !sample || at - memSampleAt >= 1000
  const needsCpu = !sample || at - cpuSampleAt >= 1000
  if (!needsMemory && !needsCpu && sample) return sample

  let availableBytes = sample?.availableBytes ?? null
  let cpuPercent = sample?.cpuPercent ?? null
  let nextCpuSampleAt = cpuSampleAt

  if (needsMemory) {
    availableBytes = null
    try {
      const memory = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))
      if (memory) availableBytes = Number(memory[1]) * 1024
    } catch { /* Missing observation narrows concurrency; it never loses a receipt. */ }
    memSampleAt = at
  }

  if (needsCpu) {
    cpuPercent = null
    try {
      const times = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number)
      if (times.length === 8 && times.every(Number.isFinite)) {
        const total = times.reduce((a, v) => a + v, 0), idle = times[3] + times[4]
        if (previousCpu && total > previousCpu.total) cpuPercent = Math.max(0, Math.min(100, 100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total))))
        previousCpu = { total, idle }
      }
    } catch { /* Missing observation narrows concurrency; it never loses a receipt. */ }
    cpuSampleAt = at
    nextCpuSampleAt = at
  }

  return (sample = { at, availableBytes, cpuPercent, cpuAt: nextCpuSampleAt })
}
export class AssessmentResourceProtection {
  private lastAt = -Infinity
  private lastCpuAt = -Infinity
  private lastTrickleAt = -Infinity
  private highCpu = 0
  private cpuProtectedSamples = 0
  private lastCpuProtectedReleaseAt = -Infinity
  private sustainedCpuEpisodes = 0
  private cpuRejectSequence = 0
  private memoryProtected = false
  private cpuProtected = false
  private trickleMemoryProtected = false
  private syncSampleState(value: AssessmentResourceSample, trickleConfig?: LowMemoryTrickleConfig): void {
    const cpuAt = value.cpuAt ?? value.at
    if (cpuAt !== this.lastCpuAt) {
      const wasCpuProtected = this.cpuProtected
      this.lastCpuAt = cpuAt
      this.highCpu = value.cpuPercent !== null && value.cpuPercent >= 95 ? this.highCpu + 1 : 0
      if (this.highCpu >= 2) this.cpuProtected = true
      // A 95% CPU spike must not strand START admission while the host settles
      // at a healthy 86–90%; keep the two-sample trip point unchanged.
      if (value.cpuPercent === null || value.cpuPercent <= 90) this.cpuProtected = false
      if (!wasCpuProtected && this.cpuProtected) {
        if (cpuAt - this.lastCpuProtectedReleaseAt <= 8_000) {
          this.sustainedCpuEpisodes = Math.min(3, this.sustainedCpuEpisodes + 1)
        } else {
          this.sustainedCpuEpisodes = 0
        }
        this.cpuProtectedSamples = 1
      } else if (wasCpuProtected && this.cpuProtected) {
        this.cpuProtectedSamples += 1
      } else if (wasCpuProtected && !this.cpuProtected) {
        this.lastCpuProtectedReleaseAt = cpuAt
        this.cpuProtectedSamples = 0
      } else if (!this.cpuProtected && cpuAt - this.lastCpuProtectedReleaseAt > 8_000) {
        this.sustainedCpuEpisodes = 0
      }
    }
    if (value.at !== this.lastAt) {
      this.lastAt = value.at
      if (value.availableBytes !== null && value.availableBytes < 512 * MiB) this.memoryProtected = true
      if (value.availableBytes !== null && value.availableBytes >= 700 * MiB) this.memoryProtected = false
    }
    if (trickleConfig && value.at !== this.lastTrickleAt) {
      this.lastTrickleAt = value.at
      if (value.availableBytes !== null && value.availableBytes < trickleConfig.floorMiB * MiB) {
        this.trickleMemoryProtected = true
      }
      if (value.availableBytes !== null && value.availableBytes >= trickleConfig.releaseMiB * MiB) {
        this.trickleMemoryProtected = false
      }
    }
  }
  reset(): void {
    this.lastAt = -Infinity
    this.lastCpuAt = -Infinity
    this.lastTrickleAt = -Infinity
    this.highCpu = 0
    this.cpuProtectedSamples = 0
    this.lastCpuProtectedReleaseAt = -Infinity
    this.sustainedCpuEpisodes = 0
    this.cpuRejectSequence = 0
    this.memoryProtected = false
    this.cpuProtected = false
    this.trickleMemoryProtected = false
  }
  recommendedCpuRetryAfterSeconds(baseSeconds = HOST_CPU_RETRY_AFTER_SECONDS): number {
    const durationSeverity = this.cpuProtectedSamples >= 6 ? 2 : this.cpuProtectedSamples >= 3 ? 1 : 0
    const severity = Math.max(this.sustainedCpuEpisodes, durationSeverity)
    if (severity === 0) return baseSeconds
    if (severity === 1) {
      const spread = this.cpuRejectSequence++ % 3
      return Math.min(30, baseSeconds * 2 + spread)
    }
    const spread = this.cpuRejectSequence++ % 4
    return Math.min(30, baseSeconds * 3 + spread)
  }
  decision(value: AssessmentResourceSample, concurrency: number, now = performance.now()): ResourceClaimDecision {
    this.syncSampleState(value)
    if (now - value.at > 5000 || value.availableBytes === null) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'observation_unavailable' }
    if (this.memoryProtected || this.cpuProtected) return { mode: 'protected', limit: 0, delayMs: 1000,
      reason: this.memoryProtected ? 'host_memory' : 'host_cpu' }
    if (value.cpuPercent === null) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'cpu_observation_unavailable' }
    if (value.availableBytes < 768 * MiB) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'memory_headroom' }
    return { mode: 'normal', limit: concurrency, delayMs: 0, reason: null }
  }
  startAdmissionDecision(
    value: AssessmentResourceSample,
    now = performance.now(),
    trickleConfig: LowMemoryTrickleConfig = configuredLowMemoryTrickleConfig(),
  ): StartAdmissionDecision {
    this.syncSampleState(value, trickleConfig)
    if (now - value.at > 5000 || value.availableBytes === null) {
      return { action: 'reject_memory', reason: 'observation_unavailable', retryHint: 'memory' }
    }
    if (this.memoryProtected || this.trickleMemoryProtected || value.availableBytes < trickleConfig.floorMiB * MiB) {
      return { action: 'reject_memory', reason: 'host_memory', retryHint: 'memory' }
    }
    if (this.cpuProtected) {
      return {
        action: 'reject_cpu',
        reason: 'host_cpu',
        retryHint: value.availableBytes < 700 * MiB ? 'memory' : 'cpu',
      }
    }
    if (value.availableBytes >= 700 * MiB) {
      return { action: 'allow', reason: null, retryHint: null }
    }
    if (value.cpuPercent === null) {
      return { action: 'reject_memory', reason: 'cpu_observation_unavailable', retryHint: 'memory' }
    }
    if (value.cpuPercent > trickleConfig.maxCpuPercent) {
      return { action: 'reject_memory', reason: 'low_memory_cpu_busy', retryHint: 'memory' }
    }
    return { action: 'trickle', reason: 'low_memory_trickle', retryHint: null }
  }
}
const policy = new AssessmentResourceProtection()
let previousMode = '', modeSince = performance.now()
let previousStartMode = '', startModeSince = performance.now()
let trickleGateCache: {
  maxConcurrent: number
  maxQueue: number
  maxWaitMs: number
  gate: BoundedAdmissionGate
} | null = null
const lowMemoryTrickleContext = new AsyncLocalStorage<{ active: boolean }>()

const buildStartResourceError = (retryHint: 'memory' | 'cpu'): InstrumentFinalSubmitError => {
  const err = new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙，请稍后开始测评；已经提交的答案不受影响。', 503)
  ;(err as { preferredRetryAfterSeconds?: number }).preferredRetryAfterSeconds =
    retryHint === 'cpu'
      ? policy.recommendedCpuRetryAfterSeconds(HOST_CPU_RETRY_AFTER_SECONDS)
      : HOST_MEMORY_RETRY_AFTER_SECONDS
  return err
}

const logStartAdmissionTransition = (decision: StartAdmissionDecision, value: AssessmentResourceSample): void => {
  const modeKey = decision.reason ? `${decision.action}:${decision.reason}` : decision.action
  if (modeKey !== previousStartMode) {
    logger.info(
      'ASSESSMENT_START_ADMISSION_MODE '
        + JSON.stringify({
          action: decision.action,
          reason: decision.reason,
          previousMode: previousStartMode,
          previousModeMs: performance.now() - startModeSince,
          ...value,
        }),
    )
    previousStartMode = modeKey
    startModeSince = performance.now()
  }
}

const getLowMemoryTrickleGate = (config: LowMemoryTrickleConfig): BoundedAdmissionGate | null => {
  if (config.maxConcurrent === 0) return null
  if (
    trickleGateCache
    && trickleGateCache.maxConcurrent === config.maxConcurrent
    && trickleGateCache.maxQueue === config.maxQueue
    && trickleGateCache.maxWaitMs === config.maxWaitMs
  ) {
    return trickleGateCache.gate
  }
  const gate = new BoundedAdmissionGate({
    name: 'low_memory_start_admission',
    maxConcurrent: config.maxConcurrent,
    maxQueue: config.maxQueue,
    maxWaitMs: config.maxWaitMs,
    retryAfterSeconds: HOST_MEMORY_RETRY_AFTER_SECONDS,
    busyCode: 'INSTRUMENT_NOT_AVAILABLE',
    busyMessage: '系统繁忙，请稍后开始测评；已经提交的答案不受影响。',
  })
  trickleGateCache = {
    maxConcurrent: config.maxConcurrent,
    maxQueue: config.maxQueue,
    maxWaitMs: config.maxWaitMs,
    gate,
  }
  return gate
}

export const resetAssessmentResourceProtectionForTests = (): void => {
  sample = null
  memSampleAt = -Infinity
  cpuSampleAt = -Infinity
  previousCpu = null
  policy.reset()
  previousMode = ''
  modeSince = performance.now()
  previousStartMode = ''
  startModeSince = performance.now()
  cachedTrickleConfig = null
  trickleGateCache = null
}

export const reportResourceClaimDecision = (concurrency: number): ResourceClaimDecision => {
  if (!enabled()) return { mode: 'normal', limit: concurrency, delayMs: 0, reason: null }
  const value = sampleAssessmentHostResources(), decision = policy.decision(value, concurrency)
  if (decision.mode !== previousMode) {
    logger.info('ASSESSMENT_RESOURCE_MODE ' + JSON.stringify({ ...decision, previousMode, previousModeMs: performance.now() - modeSince, ...value }))
    previousMode = decision.mode; modeSince = performance.now()
  }
  return decision
}

/** Optional early refusal for a new plain public START. Study admission may
 * resolve an existing attempt inside its transaction and is excluded by the
 * caller. The in-transaction freeze guard remains authoritative. */
export const anonymousStartCriticalMemory = (availableBytes:number|null):boolean =>
  availableBytes === null || !Number.isFinite(availableBytes) || availableBytes < 650 * MiB

export const assertAnonymousStartCriticalMemory = ():void => {
  if (!enabled() || process.env.ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED !== 'true') return
  if (anonymousStartCriticalMemory(sampleAssessmentHostResources().availableBytes)) {
    const err = new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙，请稍后开始测评；已经提交的答案不受影响。', 503)
    ;(err as { preferredRetryAfterSeconds?: number }).preferredRetryAfterSeconds = HOST_MEMORY_RETRY_AFTER_SECONDS
    throw err
  }
}

/** Opt-in low-memory trickle admission for START. Outside [floor, 700) MiB,
 * it fast-passes (>=700 MiB) or fast-fails (<floor MiB) before heavy loads.
 * Inside [floor, 700) MiB with idle CPU, it bounds concurrent allocations,
 * refreshes live MemAvailable on gate-slot acquisition without disturbing the
 * 1s /proc/stat CPU window, and scopes a revocable trickle permit strictly to
 * the active slot lifetime. */
export const runWithLowMemoryTrickleAdmission = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (!enabled()) return operation()
  if (!isLowMemoryTrickleEnabled()) {
    assertAssessmentStartResources()
    return operation()
  }
  const config = configuredLowMemoryTrickleConfig()
  const value = sampleAssessmentHostResources()
  const decision = policy.startAdmissionDecision(value, performance.now(), config)
  logStartAdmissionTransition(decision, value)
  if (decision.action === 'allow') return operation()
  if (decision.action === 'reject_memory' || decision.action === 'reject_cpu') {
    throw buildStartResourceError(decision.retryHint)
  }
  const gate = getLowMemoryTrickleGate(config)
  if (!gate) {
    throw buildStartResourceError('memory')
  }
  try {
    return await gate.run(async () => {
      const fresh = sampleAssessmentHostResources({ forceMemoryRefresh: true })
      const recheck = policy.startAdmissionDecision(fresh, performance.now(), config)
      logStartAdmissionTransition(recheck, fresh)
      if (recheck.action === 'reject_memory' || recheck.action === 'reject_cpu') {
        throw buildStartResourceError(recheck.retryHint)
      }
      if (recheck.action === 'allow') {
        return operation()
      }
      const permit = { active: true }
      return await lowMemoryTrickleContext.run(permit, async () => {
        try {
          return await operation()
        } finally {
          permit.active = false
        }
      })
    })
  } catch (error) {
    if (error instanceof BoundedAdmissionBusyError) {
      throw buildStartResourceError('memory')
    }
    throw error
  }
}

/** Fast pre-gate check so callers can keep already-bound replays outside the
 * resource wrapper while rejecting or trickling constrained NEW starts before
 * pool checkout, locks, or publication loads. */
export const isAssessmentStartResourceConstrained = (): boolean => {
  if (!enabled()) return false
  const value = sampleAssessmentHostResources()
  if (isLowMemoryTrickleEnabled()) {
    return policy.startAdmissionDecision(value, performance.now(), configuredLowMemoryTrickleConfig()).action !== 'allow'
  }
  const decision = policy.decision(value, 1)
  return decision.mode === 'protected'
    || decision.reason === 'observation_unavailable'
    || (value.availableBytes !== null && value.availableBytes < 700 * MiB)
}

/** Only creation of NEW frozen runtimes is guarded. Existing durable answers,
 * retries and report reads retain their normal persistence/recovery paths. */
export const assertAssessmentStartResources = (): void => {
  if (!enabled()) return
  const permit = lowMemoryTrickleContext.getStore()
  const trickleEnabled = isLowMemoryTrickleEnabled()
  const value = sampleAssessmentHostResources(
    trickleEnabled && permit?.active === true ? { forceMemoryRefresh: true } : undefined,
  )
  if (trickleEnabled) {
    const config = configuredLowMemoryTrickleConfig()
    const decision = policy.startAdmissionDecision(value, performance.now(), config)
    logStartAdmissionTransition(decision, value)
    if (decision.action === 'allow') return
    if (decision.action === 'trickle' && permit?.active === true) return
    throw buildStartResourceError(decision.retryHint ?? 'memory')
  }
  const decision = policy.decision(value, 1)
  if ((value.availableBytes !== null && value.availableBytes < 700 * MiB) || decision.reason === 'host_cpu') {
    // Keep CPU and memory hints independent; the controller preserves the hint.
    if (decision.reason === 'host_cpu' && (value.availableBytes === null || value.availableBytes >= 700 * MiB)) {
      throw buildStartResourceError('cpu')
    }
    throw buildStartResourceError('memory')
  }
}
