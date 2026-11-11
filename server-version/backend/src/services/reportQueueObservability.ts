import { appendFileSync } from 'node:fs'
import { prisma } from '../config/database'

const obsPath = (): string => process.env.ASSESSMENT_REPORT_QUEUE_OBS_PATH?.trim() || ''

/** Env-gated only. Unset path => no-op. Never throws into product paths. */
export const reportQueueObsEnabled = (): boolean => obsPath().length > 0

export const recordReportQueueEvent = (event: Record<string, unknown>): void => {
  const dest = obsPath()
  if (!dest) return
  try {
    appendFileSync(dest, `${JSON.stringify({
      v: 1,
      tMs: Date.now(),
      monoNs: process.hrtime.bigint().toString(),
      pid: process.pid,
      ...event,
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

export const sampleReportQueuePending = async (slotsBusy: number, concurrency: number): Promise<void> => {
  if (!reportQueueObsEnabled()) return
  try {
    const rows = await prisma.$queryRaw<Array<{ pending: number }>>`
      SELECT count(*)::int AS pending FROM "composite_report_jobs"
      WHERE "status" = 'PENDING' AND "next_attempt_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    `
    recordReportQueueEvent({ kind: 'pending_sample', pending: rows[0]?.pending ?? 0, slotsBusy, concurrency })
  } catch { /* ignore */ }
}
