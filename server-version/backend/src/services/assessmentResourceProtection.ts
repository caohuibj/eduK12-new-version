import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { InstrumentFinalSubmitError } from './instrumentFinalSubmit'
import { logger } from '../utils/logger'
export type AssessmentResourceSample = { at: number; availableBytes: number | null; cpuPercent: number | null }
export type ResourceClaimDecision = { mode: 'normal' | 'limited' | 'protected'; limit: number; delayMs: number; reason: string | null }
const enabled = () => process.env.ASSESSMENT_RESOURCE_PROTECTION_ENABLED === 'true'
const MiB = 1024 * 1024
let sample: AssessmentResourceSample | null = null
let previousCpu: { total: number; idle: number } | null = null
export const sampleAssessmentHostResources = (): AssessmentResourceSample => {
  const at = performance.now()
  if (sample && at - sample.at < 1000) return sample
  let availableBytes: number | null = null, cpuPercent: number | null = null
  try {
    const memory = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))
    if (memory) availableBytes = Number(memory[1]) * 1024
    const times = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number)
    if (times.length === 8 && times.every(Number.isFinite)) {
      const total = times.reduce((a, v) => a + v, 0), idle = times[3] + times[4]
      if (previousCpu && total > previousCpu.total) cpuPercent = Math.max(0, Math.min(100, 100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total))))
      previousCpu = { total, idle }
    }
  } catch { /* Missing observation narrows concurrency; it never loses a receipt. */ }
  return (sample = { at, availableBytes, cpuPercent })
}
export class AssessmentResourceProtection {
  private lastAt = -Infinity
  private highCpu = 0
  private memoryProtected = false
  private cpuProtected = false
  decision(value: AssessmentResourceSample, concurrency: number, now = performance.now()): ResourceClaimDecision {
    if (value.at !== this.lastAt) {
      this.lastAt = value.at
      this.highCpu = value.cpuPercent !== null && value.cpuPercent >= 95 ? this.highCpu + 1 : 0
      if (value.availableBytes !== null && value.availableBytes < 512 * MiB) this.memoryProtected = true
      if (value.availableBytes !== null && value.availableBytes >= 700 * MiB) this.memoryProtected = false
      if (this.highCpu >= 2) this.cpuProtected = true
      if (value.cpuPercent === null || value.cpuPercent <= 85) this.cpuProtected = false
    }
    if (now - value.at > 5000 || value.availableBytes === null) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'observation_unavailable' }
    if (this.memoryProtected || this.cpuProtected) return { mode: 'protected', limit: 0, delayMs: 1000,
      reason: this.memoryProtected ? 'host_memory' : 'host_cpu' }
    if (value.cpuPercent === null) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'cpu_observation_unavailable' }
    if (value.availableBytes < 768 * MiB) return { mode: 'limited', limit: Math.min(1, concurrency), delayMs: 0, reason: 'memory_headroom' }
    return { mode: 'normal', limit: concurrency, delayMs: 0, reason: null }
  }
}
const policy = new AssessmentResourceProtection()
let previousMode = '', modeSince = performance.now()
export const reportResourceClaimDecision = (concurrency: number): ResourceClaimDecision => {
  if (!enabled()) return { mode: 'normal', limit: concurrency, delayMs: 0, reason: null }
  const value = sampleAssessmentHostResources(), decision = policy.decision(value, concurrency)
  if (decision.mode !== previousMode) {
    logger.info('ASSESSMENT_RESOURCE_MODE ' + JSON.stringify({ ...decision, previousMode, previousModeMs: performance.now() - modeSince, ...value }))
    previousMode = decision.mode; modeSince = performance.now()
  }
  return decision
}
/** Only creation of NEW frozen runtimes is guarded. Existing durable answers,
 * retries and report reads retain their normal persistence/recovery paths. */
export const assertAssessmentStartResources = (): void => {
  if (!enabled()) return
  const value = sampleAssessmentHostResources()
  const decision = policy.decision(value, 1)
  if ((value.availableBytes !== null && value.availableBytes < 700 * MiB) || decision.reason === 'host_cpu') {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙，请稍后开始测评；已经提交的答案不受影响。', 503)
  }
}
