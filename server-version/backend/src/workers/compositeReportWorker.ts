import { isScaleSubmissionKeyConflictError, REPORT_SUBMISSION_KEY_CONFLICT } from '../modules/scale/scale-final-submit-conflict'
import { reportResourceClaimDecision } from '../services/assessmentResourceProtection'
import { reportClaimDecision, reportPriorityClaimed, startReportClaimPriority, stopReportClaimPriority } from '../services/wholeSubmissionPriority'
import { publishReportReady } from '../services/reportReadyNotifications'
import { withAssessmentReportTimeline, markAssessmentTimeline, traceAssessmentPhase } from '../services/runtimeObservability'
import type { CompositeReportJob } from '@prisma/client'
import { prisma } from '../config/database'
import { assessmentReportConfig } from '../config/assessmentReports'
import { logger } from '../utils/logger'
import { isInstrumentFinalSubmitError } from '../services/instrumentFinalSubmit'
import { isQuestionnaireCompletionAdmissionBusyError, isTransientCompletionDatabaseError } from '../services/questionnaireCompletionAdmission'
import {
  assertReportJobIdentity,
  claimCompositeReportJob,
  returnUnstartedCompositeReportJob,
  finishCompositeReportJob,
  REPORT_PARENT_SELECT,
  renewCompositeReportLease,
  type ReportJobOutcome,
} from '../modules/assessment-runtime/report-outbox.service'

let stopped = true
let timer: ReturnType<typeof setTimeout> | null = null
const active = new Set<Promise<void>>()

/** This processor never accepts answers, changes scoring rules or opens HTTP. */
export const processCompositeReportJob = async (job: CompositeReportJob): Promise<void> => withAssessmentReportTimeline(job, async () => {
  const settings = assessmentReportConfig()
  const heartbeat = setInterval(() => {
    void renewCompositeReportLease(job).catch(error => logger.warn('Report lease renewal failed', { jobId: job.id, error: String(error) }))
  }, Math.max(10, Math.floor(settings.leaseMs / 3)))
  heartbeat.unref()
  let outcome: ReportJobOutcome
  try {
    const wholeService = await traceAssessmentPhase('report.whole_module_import', () => import('../modules/composite/whole-questionnaire.service'))
    let reportContext: import('../modules/composite/whole-questionnaire.service').WholeQuestionnaireReportContext | undefined
    const whole = await traceAssessmentPhase('report.units_and_snapshot_persistence',
      () => wholeService.processWholeQuestionnaireAnswers(job, process.env.ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED === 'true'
        ? context => { reportContext = context } : undefined))
    const committed = reportContext?.committed
    const committedParent = committed && committed.submissionId === job.wholeSubmissionId
      && committed.leaseToken === job.leaseToken ? committed.parent : undefined
    const parent = committedParent ?? await prisma.compositeAssessmentAttempt.findUnique({ where: { id: job.attemptId }, select: { ...REPORT_PARENT_SELECT, startedAt: true, completedItems: true,
      frozenActiveSlotSetEncrypted: true, contextSnapshotEncrypted: true, compiledBundleRuntimeHash: true } })
    if (!parent || parent.status === 'ABANDONED') outcome = { kind: 'cancelled' }
    else {
      assertReportJobIdentity(parent, { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash })
      const { finalizeCompositeAttemptIfReady, materializeCompositeQuestionnaireReport } = await traceAssessmentPhase('report.aggregate_module_import', () => import('../modules/composite/composite.service'))
      const result = await traceAssessmentPhase('report.aggregate_finalize', () => finalizeCompositeAttemptIfReady(job.attemptId, {
        preloadedParent: parent, committedGraph: committedParent,
        reportJob: { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash },
      }))
      if (whole && result?.status !== 'COMPLETED') throw new Error('WHOLE_QUESTIONNAIRE_CANONICAL_NOT_COMPLETE')
      if (result?.status !== 'COMPLETED') outcome = { kind: 'waiting' }
      else outcome = { kind: 'ready', ...await traceAssessmentPhase('report.aggregate_materialize', () => materializeCompositeQuestionnaireReport(job.attemptId, {
        attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash,
      }, reportContext, committedParent && result.aggregateInputHash && result.totalTime !== undefined
        ? { ...committedParent, status: 'COMPLETED', progress: 100, completedAt: result.completedAt,
            aggregateInputHash: result.aggregateInputHash, totalTime: result.totalTime } : undefined)) }
    }
  } catch (error) {
    const stale = isInstrumentFinalSubmitError(error) && error.code === 'STALE_ATTEMPT'
    const capacity = isQuestionnaireCompletionAdmissionBusyError(error) || isTransientCompletionDatabaseError(error)
    // Technical failures have bounded automatic retries. A failed report keeps
    // its durable receipt and can be explicitly requeued after diagnosis; it
    // never asks the participant to resubmit answers.
    outcome = isScaleSubmissionKeyConflictError(error) ? { kind: 'failed', errorCode: REPORT_SUBMISSION_KEY_CONFLICT }
      : stale ? { kind: 'cancelled' }
      : job.attemptCount < settings.maxAttempts
        ? { kind: 'retry', errorCode: capacity ? 'REPORT_BUSY' : 'REPORT_GENERATION_FAILED',
            delayMs: Math.min(30_000, 1_000 * 2 ** Math.min(job.attemptCount - 1, 5)) + Math.floor(Math.random() * 500) }
        : { kind: 'failed', errorCode: 'REPORT_GENERATION_FAILED' }
    logger.warn('Report generation deferred', { jobId: job.id, attempt: job.attemptCount,
      outcome: outcome.kind, code: isInstrumentFinalSubmitError(error) ? error.code : 'REPORT_GENERATION_FAILED' })
  } finally {
    clearInterval(heartbeat)
  }
  const published = await traceAssessmentPhase('report.outcome_commit_roundtrip', () => finishCompositeReportJob(job, outcome))
  if (published && outcome.kind === 'ready') {
    markAssessmentTimeline('report.ready_commit_confirmed')
    if (job.wholeSubmissionId) void publishReportReady(job.attemptId, job.attemptEpoch)
  }
})

/** Load processor code at worker startup, before the first participant waits. */
export const prepareCompositeReportRuntime = async (): Promise<void> => {
  const started = process.hrtime.bigint()
  await Promise.all([
    import('../modules/composite/whole-questionnaire.service'),
    import('../modules/composite/composite.service'),
  ])
  logger.info('REPORT_RUNTIME_PREPARED ' + JSON.stringify({
    processId: process.pid, monotonicNs: process.hrtime.bigint().toString(), wallMs: Date.now(),
    durationMs: Number(process.hrtime.bigint() - started) / 1e6,
  }))
}

let pumping: Promise<void> | null = null
let wakeRequested = false
const scheduleTick = (delayMs: number): void => {
  if (stopped) return
  if (pumping) { if (delayMs === 0) wakeRequested = true; return }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void tick() }, delayMs)
  timer.unref()
}
const pump = async (): Promise<void> => {
  const settings = assessmentReportConfig()
  let exhausted = false
  let priorityDelay = 0
  try {
    while (!stopped && active.size < settings.workerConcurrency) {
      const resources = reportResourceClaimDecision(settings.workerConcurrency)
      if (active.size >= resources.limit || resources.delayMs > 0) { priorityDelay = Math.max(50, resources.delayMs); break }
      const decision = reportClaimDecision(settings.workerConcurrency, active.size)
      if (active.size >= decision.limit || decision.delayMs > 0) { priorityDelay = Math.max(50, decision.delayMs); break }
      const job = await claimCompositeReportJob()
      if (!job) { exhausted = true; break }
      if (stopped) { await returnUnstartedCompositeReportJob(job); break }
      reportPriorityClaimed()
      const running = processCompositeReportJob(job)
        .catch(error => logger.error('Report worker operation failed; lease recovery remains enabled', { jobId: job.id, error: String(error) }))
        .finally(() => { active.delete(running); scheduleTick(0) })
      active.add(running)
    }
  } catch (error) {
    exhausted = true
    logger.warn('Report outbox poll failed; will retry', { error: String(error) })
  } finally {
    // tick() clears the single-flight owner before scheduling the next pass.
    nextDelay = priorityDelay || (exhausted ? Math.max(100, settings.pollMs) : settings.pollMs)
  }
}
let nextDelay = 500
const tick = (): Promise<void> => {
  if (stopped) return Promise.resolve()
  if (pumping) return pumping
  wakeRequested = false
  pumping = pump().finally(() => {
    pumping = null
    if (stopped) return
    if (wakeRequested) scheduleTick(0)
    else if (active.size < assessmentReportConfig().workerConcurrency) scheduleTick(nextDelay)
    // A full worker is woken immediately by task completion, without polling.
  })
  return pumping
}

export const startCompositeReportWorker = (): void => {
  if (!stopped) return
  stopped = false
  startReportClaimPriority()
  void tick()
}

export const stopCompositeReportWorker = async (timeoutMs: number): Promise<void> => {
  stopped = true
  stopReportClaimPriority()
  if (timer) clearTimeout(timer)
  timer = null
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => { if (pumping) await pumping; await Promise.allSettled([...active]) })(),
      new Promise<void>(resolve => { deadline = setTimeout(resolve, timeoutMs) }),
    ])
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}

export const activeCompositeReportJobs = (): number => active.size
