import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { prisma } from '../config/database'

const obsPath = (): string => process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH?.trim() || ''

/** Same irreversible identifier digest as the assessment timeline. */
export const reportQueueIdentityHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 24)

/** Env-gated only. Unset path => no-op. Never throws into product paths.
 * This channel is independently path-gated and off by default. It does not
 * require the timeline's PERF_ISOLATED_TEST_MODE double gate; identifiers
 * are hashed so a diagnostic file cannot be joined to raw attempt or job ids. */
export const reportQueueObsEnabled = (): boolean => obsPath().length > 0

const sanitizeEvent = (event: Record<string, unknown>): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if ((key === 'attemptId' || key === 'jobId') && typeof value === 'string') {
      sanitized[key === 'attemptId' ? 'attemptHash' : 'jobHash'] = reportQueueIdentityHash(value)
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

export const recordReportQueueEvent = (event: Record<string, unknown>): void => {
  const dest = obsPath()
  if (!dest) return
  try {
    appendFileSync(dest, `${JSON.stringify({
      v: 1,
      tMs: Date.now(),
      monoNs: process.hrtime.bigint().toString(),
      pid: process.pid,
      ...sanitizeEvent(event),
    })}\n`)
  } catch { /* diagnostic sink must not affect receipts, leases, or publish */ }
}

export const recordReceiptCommit = (input: {
  attemptId: string
  attemptEpoch: number
  acceptedAt: Date
  queueDepth?: number
  replayed: boolean
}): void => {
  if (!reportQueueObsEnabled()) return
  recordReportQueueEvent({
    kind: 'receipt_commit',
    attemptId: input.attemptId,
    attemptEpoch: input.attemptEpoch,
    acceptedAtMs: input.acceptedAt.getTime(),
    commitMs: Date.now(),
    queueDepth: input.queueDepth ?? null,
    replayed: input.replayed,
  })
}

/** Minimum gap between pending-count samples. Not configurable: this is a
 * diagnostic guard, not a product knob. */
export const REPORT_QUEUE_PENDING_SAMPLE_MIN_INTERVAL_MS = 1000
let pendingSampleInFlight = false
let lastPendingSampleAt = 0

export const resetReportQueuePendingSamplerForTests = (): void => {
  pendingSampleInFlight = false
  lastPendingSampleAt = 0
}

export const sampleReportQueuePending = async (slotsBusy: number, concurrency: number): Promise<void> => {
  if (!reportQueueObsEnabled()) return
  const now = Date.now()
  if (pendingSampleInFlight || now - lastPendingSampleAt < REPORT_QUEUE_PENDING_SAMPLE_MIN_INTERVAL_MS) return
  pendingSampleInFlight = true
  lastPendingSampleAt = now
  try {
    const rows = await prisma.$queryRaw<Array<{ pending: number }>>`
      SELECT count(*)::int AS pending FROM "composite_report_jobs"
      WHERE "status" = 'PENDING' AND "next_attempt_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    `
    recordReportQueueEvent({ kind: 'pending_sample', pending: rows[0]?.pending ?? 0, slotsBusy, concurrency })
  } catch { /* ignore */ }
  finally { pendingSampleInFlight = false }
}
