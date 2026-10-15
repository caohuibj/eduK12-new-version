import type { CompositeReportJob } from '@prisma/client'
import { prisma } from '../config/database'
import { assessmentReportConfig } from '../config/assessmentReports'
import { logger } from '../utils/logger'
import { isInstrumentFinalSubmitError } from '../services/instrumentFinalSubmit'
import { isQuestionnaireCompletionAdmissionBusyError, isTransientCompletionDatabaseError } from '../services/questionnaireCompletionAdmission'
import {
  assertReportJobIdentity,
  claimCompositeReportJob,
  finishCompositeReportJob,
  REPORT_PARENT_SELECT,
  renewCompositeReportLease,
  type ReportJobOutcome,
} from '../modules/assessment-runtime/report-outbox.service'

let stopped = true
let timer: ReturnType<typeof setTimeout> | null = null
const active = new Set<Promise<void>>()

/** This processor never accepts answers, changes scoring rules or opens HTTP. */
export const processCompositeReportJob = async (job: CompositeReportJob): Promise<void> => {
  const settings = assessmentReportConfig()
  const heartbeat = setInterval(() => {
    void renewCompositeReportLease(job).catch(error => logger.warn('Report lease renewal failed', { jobId: job.id, error: String(error) }))
  }, Math.max(10, Math.floor(settings.leaseMs / 3)))
  heartbeat.unref()
  let outcome: ReportJobOutcome
  try {
    const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: job.attemptId }, select: REPORT_PARENT_SELECT })
    if (!parent || parent.status === 'ABANDONED') outcome = { kind: 'cancelled' }
    else {
      assertReportJobIdentity(parent, { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash })
      const { finalizeCompositeAttemptIfReady, materializeCompositeQuestionnaireReport } = await import('../modules/composite/composite.service')
      const result = await finalizeCompositeAttemptIfReady(job.attemptId, {
        reportJob: { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash },
      })
      if (result?.status !== 'COMPLETED') outcome = { kind: 'waiting' }
      else outcome = { kind: 'ready', ...await materializeCompositeQuestionnaireReport(job.attemptId, {
        attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash,
      }) }
    }
  } catch (error) {
    const stale = isInstrumentFinalSubmitError(error) && error.code === 'STALE_ATTEMPT'
    const capacity = isQuestionnaireCompletionAdmissionBusyError(error) || isTransientCompletionDatabaseError(error)
    // Technical failures have bounded automatic retries. A failed report keeps
    // its durable receipt and can be explicitly requeued after diagnosis; it
    // never asks the participant to resubmit answers.
    outcome = stale ? { kind: 'cancelled' }
      : job.attemptCount < settings.maxAttempts
        ? { kind: 'retry', errorCode: capacity ? 'REPORT_BUSY' : 'REPORT_GENERATION_FAILED',
            delayMs: Math.min(30_000, 1_000 * 2 ** Math.min(job.attemptCount - 1, 5)) + Math.floor(Math.random() * 500) }
        : { kind: 'failed', errorCode: 'REPORT_GENERATION_FAILED' }
    logger.warn('Report generation deferred', { jobId: job.id, attempt: job.attemptCount,
      outcome: outcome.kind, code: isInstrumentFinalSubmitError(error) ? error.code : 'REPORT_GENERATION_FAILED' })
  } finally {
    clearInterval(heartbeat)
  }
  await finishCompositeReportJob(job, outcome)
}

const tick = async (): Promise<void> => {
  if (stopped) return
  const settings = assessmentReportConfig()
  try {
    while (!stopped && active.size < settings.workerConcurrency) {
      const job = await claimCompositeReportJob()
      if (!job) break
      const running = processCompositeReportJob(job)
        .catch(error => logger.error('Report worker operation failed; lease recovery remains enabled', { jobId: job.id, error: String(error) }))
        .finally(() => active.delete(running))
      active.add(running)
    }
  } catch (error) {
    logger.warn('Report outbox poll failed; will retry', { error: String(error) })
  } finally {
    if (!stopped) {
      timer = setTimeout(() => { void tick() }, settings.pollMs)
      timer.unref()
    }
  }
}

export const startCompositeReportWorker = (): void => {
  if (!stopped) return
  stopped = false
  // Always drain already acknowledged jobs, even when NEW async enrollment is
  // disabled. The outbox is the source of truth; Redis delivery is unnecessary.
  void tick()
}

export const stopCompositeReportWorker = async (timeoutMs: number): Promise<void> => {
  stopped = true
  if (timer) clearTimeout(timer)
  timer = null
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.allSettled([...active]),
      new Promise<void>(resolve => { deadline = setTimeout(resolve, timeoutMs) }),
    ])
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}

export const activeCompositeReportJobs = (): number => active.size
