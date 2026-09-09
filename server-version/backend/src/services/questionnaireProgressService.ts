import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { buildQuestionnaireCollectionReport, collectionReportForStorage } from '../modules/reporting/questionnaire-collection-report'
import { encryptField } from '../utils/encryption'
import { isFormAnswerComplete } from './questionnaireFormAnswerState'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  questionnaireCompletionAdmission,
  toCompletionAdmissionBusyError,
} from './questionnaireCompletionAdmission'
import { InstrumentFinalSubmitError } from './instrumentFinalSubmit'
import {
  measureRequestPhase,
  recordRequestPhase,
  recordSerializableAttempt,
  recordSerializationConflict,
} from './runtimeObservability'

type DatabaseClient = typeof prisma | Prisma.TransactionClient

export type QuestionnaireProgressSnapshot = {
  id: string
  questionnaireId: string
  userId?: string | null
  sessionId?: string | null
  status: string
  progress: number
  completedScales: number
  completedForms: number
  startedAt: Date
  completedAt: Date | null
  totalTime: number | null
  aggregateReport: unknown
  aggregateReportEncrypted: string | null
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
  contextFrozenAt: Date | null
  questionnaire: {
    name?: string | null
    formItems: Array<{
      id: string
      type: string
      label: string
      required: boolean
      options: unknown
      position: number
      contextKey?: string | null
    }>
    questionnaireScales: Array<{
      id: string
      scaleId: string
      position?: number | null
      scale?: { code?: string | null; name?: string | null } | null
    }>
  }
  scaleAssessments: Array<{
    id: string
    scaleId: string
    status: string
    result?: unknown
    completedAt?: Date | null
    totalTime?: number | null
    scale?: { code?: string | null; name?: string | null } | null
  }>
  formAnswers: Array<{
    formItemId: string
    value: string | null
    status?: string | null
  }>
}

/**
 * Minimal authoritative projection used by completion/progress paths. Keep
 * the report/result fields needed by collection reporting, but do not load
 * scale definitions, encrypted answer revisions, or unrelated relations.
 */
export const questionnaireProgressSelect = {
  id: true,
  questionnaireId: true,
  userId: true,
  sessionId: true,
  status: true,
  progress: true,
  completedScales: true,
  completedForms: true,
  startedAt: true,
  completedAt: true,
  totalTime: true,
  aggregateReport: true,
  aggregateReportEncrypted: true,
  contextSnapshotEncrypted: true,
  contextSnapshotHash: true,
  contextFrozenAt: true,
  questionnaire: {
    select: {
      name: true,
      formItems: {
        select: {
          id: true,
          type: true,
          label: true,
          required: true,
          options: true,
          position: true,
          contextKey: true,
        },
        orderBy: { position: 'asc' as const },
      },
      questionnaireScales: {
        select: {
          id: true,
          scaleId: true,
          position: true,
          scale: { select: { code: true, name: true } },
        },
        orderBy: { position: 'asc' as const },
      },
    },
  },
  scaleAssessments: {
    select: {
      id: true,
      scaleId: true,
      status: true,
      result: true,
      completedAt: true,
      totalTime: true,
      scale: { select: { code: true, name: true } },
    },
    orderBy: { startedAt: 'asc' as const },
  },
  formAnswers: {
    select: {
      formItemId: true,
      value: true,
      status: true,
    },
  },
} as const

export type QuestionnaireProgressResult = {
  status: string
  progress: number
  completedScales: number
  completedForms: number
  completed: boolean
  completedAt: Date | null
  totalTime: number | null
  collectionReport: any | null
}

type IncrementalQuestionnaireAssessment = {
  id: string
  status: string
  progress: number
  completedScales: number
  completedForms: number
}

export type IncrementalQuestionnaireProgressResult = {
  completedScales: number
  completedForms: number
  progress: number
}

/**
 * Update the cached form counter without materialising the questionnaire graph.
 * The caller must have already validated and persisted the affected answer in
 * the same serializable transaction. `increment` is deliberately expressed as
 * a Prisma field operation so concurrent answers cannot lose a counter update.
 */
export const applyQuestionnaireProgressDelta = async (
  db: DatabaseClient,
  assessment: IncrementalQuestionnaireAssessment,
  completedFormsDelta: number,
  totalItems: number,
): Promise<IncrementalQuestionnaireProgressResult> => {
  const completedScales = Math.max(0, assessment.completedScales)
  const completedForms = Math.max(0, assessment.completedForms + completedFormsDelta)
  const completedItems = completedScales + completedForms
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))

  const data: Prisma.QuestionnaireAssessmentUpdateManyMutationInput = { progress }
  if (completedFormsDelta !== 0) data.completedForms = { increment: completedFormsDelta }
  await db.questionnaireAssessment.updateMany({
    where: { id: assessment.id, status: 'IN_PROGRESS' },
    data,
  })

  return { completedScales, completedForms, progress }
}

/**
 * Recomputes cached questionnaire progress from child rows and performs the
 * final state transition conditionally.  This function must be called from a
 * serializable transaction when it follows a child completion/write.
 */
export const refreshQuestionnaireProgress = async (
  db: DatabaseClient,
  questionnaireAssessmentId: string,
  loadedAssessment?: QuestionnaireProgressSnapshot,
): Promise<QuestionnaireProgressResult | null> => {
  const qa = loadedAssessment?.id === questionnaireAssessmentId
    ? loadedAssessment
    : await db.questionnaireAssessment.findUnique({
        where: { id: questionnaireAssessmentId },
        select: questionnaireProgressSelect,
      }) as QuestionnaireProgressSnapshot | null

  if (!qa) return null

  const scaleIds = new Set(qa.questionnaire.questionnaireScales.map((item) => item.scaleId))
  const formItemIds = new Set(qa.questionnaire.formItems.map((item) => item.id))
  const completedScales = qa.scaleAssessments.filter(
    (assessment) => scaleIds.has(assessment.scaleId) && assessment.status === 'COMPLETED',
  ).length
  const formAnswerByItem = new Map(qa.formAnswers
    .filter((answer) => formItemIds.has(answer.formItemId))
    .map((answer) => [answer.formItemId, answer]))
  const completedForms = qa.questionnaire.formItems.filter((item) => (
    isFormAnswerComplete(item, formAnswerByItem.get(item.id))
  )).length
  const totalItems = scaleIds.size + formItemIds.size
  const completedItems = completedScales + completedForms
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  const completed = completedItems >= totalItems

  const resultFor = (row: typeof qa, isCompleted: boolean, completedAt: Date | null, totalTime: number | null, collectionReport: any | null): QuestionnaireProgressResult => ({
    status: row.status,
    progress: row.status === 'IN_PROGRESS' ? progress : row.progress,
    completedScales,
    completedForms,
    completed: isCompleted,
    completedAt,
    totalTime,
    collectionReport,
  })

  if (qa.status === 'COMPLETED') {
    return resultFor(qa, true, qa.completedAt, qa.totalTime, buildQuestionnaireCollectionReport(qa))
  }

  // ABANDONED and any future terminal states are database facts, not states
  // that this helper may reopen or complete as a side effect of a stale write.
  if (qa.status !== 'IN_PROGRESS') {
    return resultFor(qa, false, qa.completedAt, qa.totalTime, null)
  }

  if (!completed) {
    const updated = await db.questionnaireAssessment.updateMany({
      where: { id: questionnaireAssessmentId, status: 'IN_PROGRESS' },
      data: {
        completedScales,
        completedForms,
        progress,
      },
    })

    if (updated.count === 1) return resultFor(qa, false, null, null, null)

    const current = await db.questionnaireAssessment.findUnique({
      where: { id: questionnaireAssessmentId },
      select: questionnaireProgressSelect,
    }) as QuestionnaireProgressSnapshot | null
    if (!current) return null
    return current.status === 'COMPLETED'
      ? resultFor(current, true, current.completedAt, current.totalTime, buildQuestionnaireCollectionReport(current))
      : resultFor(current, false, current.completedAt, current.totalTime, null)
  }

  const collectionReport = buildQuestionnaireCollectionReport(qa)
  const storedCollectionReport = collectionReportForStorage(collectionReport)
  const completedAt = new Date()
  const totalTime = completedAt.getTime() - new Date(qa.startedAt).getTime()

  const updated = await db.questionnaireAssessment.updateMany({
    where: { id: questionnaireAssessmentId, status: 'IN_PROGRESS' },
    data: {
      status: 'COMPLETED',
      completedScales,
      completedForms,
      progress: 100,
      completedAt,
      totalTime,
      // New completions must never dual-write the legacy plaintext column.
      // The nullable column remains only for the application-level backfill
      // and dual-read compatibility window.
      aggregateReport: Prisma.DbNull,
      aggregateReportEncrypted: encryptField(storedCollectionReport),
    },
  })

  if (updated.count === 1) {
    return {
      status: 'COMPLETED',
      progress: 100,
      completedScales,
      completedForms,
      completed: true,
      completedAt,
      totalTime,
      collectionReport,
    }
  }

  // Another serializable transaction won the completion race. Return its
  // persisted result rather than inventing a second completion timestamp or
  // report in the caller.
  const current = await db.questionnaireAssessment.findUnique({
    where: { id: questionnaireAssessmentId },
    select: questionnaireProgressSelect,
  }) as QuestionnaireProgressSnapshot | null
  if (!current) return null
  if (current.status === 'COMPLETED') {
    return resultFor(current, true, current.completedAt, current.totalTime, buildQuestionnaireCollectionReport(current))
  }
  return resultFor(current, false, current.completedAt, current.totalTime, null)
}

type SerializableOperation = 'questionnaire_completion' | 'questionnaire_mutation' | 'scale_completion'

type SerializableTransactionOptions = {
  operation: SerializableOperation
  maxAttempts?: number
  maxWait?: number
  timeout?: number
}

const isSerializationConflict = (err: any): boolean => (
  err?.code === 'P2034'
  // Prisma exposes serialization failures raised by a raw query as P2010;
  // the PostgreSQL SQLSTATE remains available in the nested metadata.
  || err?.code === '40001'
  || err?.meta?.code === '40001'
)

const serializationErrorCode = (err: any): string => (
  err?.code === 'P2034' ? 'P2034' : err?.code === '40001' || err?.meta?.code === '40001' ? '40001' : 'unknown'
)

const waitBeforeRetry = (attempt: number) => new Promise<void>((resolve) => {
  // A small exponential backoff with jitter prevents concurrent clients from
  // retrying the same SSI conflict in lockstep.
  const baseDelayMs = 25 * (2 ** (attempt - 1))
  const jitterMs = Math.floor(Math.random() * baseDelayMs)
  setTimeout(resolve, baseDelayMs + jitterMs)
})

const runSerializableTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTransactionOptions,
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 5

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    recordSerializableAttempt(options.operation, attempt)
    try {
      const requestedAt = process.hrtime.bigint()
      return await measureRequestPhase('transaction', () => prisma.$transaction(async (tx) => {
        const acquiredAt = process.hrtime.bigint()
        recordRequestPhase(
          'transaction_acquisition',
          Number(acquiredAt - requestedAt) / 1_000_000,
          requestedAt,
          acquiredAt,
        )
        return callback(tx)
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: options.maxWait ?? 2_000,
        timeout: options.timeout ?? 10_000,
      }))
    } catch (err: any) {
      if (!isSerializationConflict(err)) throw err
      recordSerializationConflict(options.operation, serializationErrorCode(err))
      if (attempt === maxAttempts) throw err
      await measureRequestPhase('serialization_backoff', () => waitBeforeRetry(attempt))
    }
  }

  throw new Error('questionnaire transaction retry exhausted')
}

/** Finalization policy: Serializable, bounded retry, and bounded admission. */
export const withQuestionnaireCompletionTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  const requestedAt = process.hrtime.bigint()
  try {
    return await questionnaireCompletionAdmission.run(async () => {
      const admittedAt = process.hrtime.bigint()
      recordRequestPhase(
        'completion_queue_wait',
        Number(admittedAt - requestedAt) / 1_000_000,
        requestedAt,
        admittedAt,
      )
      return runSerializableTransaction(callback, {
        operation: 'questionnaire_completion',
        // Completion remains explicitly bounded, but the high-contention
        // PostgreSQL gate exercises bursts of independent assessments. Five
        // attempts can still exhaust on transient SSI conflicts before the
        // queue has drained; eight keeps the policy bounded while allowing a
        // short jittered tail to settle.
        maxAttempts: 8,
        maxWait: 2_000,
        timeout: 10_000,
      })
    })
  } catch (err) {
    if (isQuestionnaireCompletionAdmissionBusyError(err)) {
      const rejectedAt = process.hrtime.bigint()
      recordRequestPhase(
        'completion_queue_wait',
        Number(rejectedAt - requestedAt) / 1_000_000,
        requestedAt,
        rejectedAt,
      )
    }
    throw err
  }
}

/** Serializable questionnaire mutation that is not terminal completion. */
export const withQuestionnaireSerializableTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => runSerializableTransaction(callback, {
  operation: 'questionnaire_mutation',
  maxAttempts: 3,
  maxWait: 2_000,
  timeout: 10_000,
})

/** Scale completion keeps Serializable semantics without using questionnaire admission. */
export const withScaleCompletionTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => runSerializableTransaction(callback, {
  operation: 'scale_completion',
  maxAttempts: 5,
  maxWait: 2_000,
  timeout: 10_000,
})

/** Backward-compatible name for existing isolated integration callers. */
export const withSerializableQuestionnaireTransaction = withQuestionnaireSerializableTransaction

const runReadCommittedLockedTransaction = async <T>(
  lock: (tx: Prisma.TransactionClient) => Promise<void>,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  const requestedAt = process.hrtime.bigint()
  return measureRequestPhase('transaction', () => prisma.$transaction(async (tx) => {
    const acquiredAt = process.hrtime.bigint()
    recordRequestPhase(
      'transaction_acquisition',
      Number(acquiredAt - requestedAt) / 1_000_000,
      requestedAt,
      acquiredAt,
    )
    await lock(tx)
    return callback(tx)
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  }))
}

/**
 * FINAL_ONLY completion transaction.
 *
 * Final-only child writes and parent promotion use a short READ COMMITTED
 * transaction. Heavy report/analysis work is prepared before entering this
 * boundary; the callback is responsible for taking the authoritative parent
 * lock and rechecking the child fingerprint.
 */
export const withFinalOnlyCompletionTransaction = async <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  const requestedAt = process.hrtime.bigint()
  let callbackFinishedAt: bigint | null = null
  try {
    const result = await measureRequestPhase('transaction', () => measureRequestPhase(
      'final_submit_transaction_wall_time',
      () => prisma.$transaction(async (tx) => {
        const acquiredAt = process.hrtime.bigint()
        recordRequestPhase(
          'final_submit_transaction_wait',
          Number(acquiredAt - requestedAt) / 1_000_000,
          requestedAt,
          acquiredAt,
        )
        const value = await callback(tx)
        callbackFinishedAt = process.hrtime.bigint()
        return value
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 2_000,
        timeout: 10_000,
      }),
    ))
    const committedAt = process.hrtime.bigint()
    if (callbackFinishedAt !== null && committedAt > callbackFinishedAt) {
      recordRequestPhase(
        'final_submit_commit',
        Number(committedAt - callbackFinishedAt) / 1_000_000,
        callbackFinishedAt,
        committedAt,
      )
    }
    return result
  } catch (error) {
    throw toCompletionAdmissionBusyError(error, 1)
  }
}

export type FinalOnlyCompositeProgressHint = {
  parentId: string
  status: string
  progress: number
  completedItems: number
  totalItems: number
  terminalCandidate: boolean
}

/**
 * Recompute the FINAL_ONLY Composite progress cache from the current child
 * rows.  The cache is only a trigger hint; the finalizer performs the same
 * epoch-aware check before promoting the parent to COMPLETED.
 */
export const refreshCompositeFinalOnlyProgress = async (
  db: Prisma.TransactionClient,
  attemptId: string,
): Promise<FinalOnlyCompositeProgressHint> => {
  const parent = await measureRequestPhase('final_submit_db_compute', () => measureRequestPhase('final_submit_db_query', () => db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      deliveryMode: true,
      attemptEpoch: true,
      progress: true,
      completedItems: true,
      compositeAssessment: {
        select: {
          items: { select: { id: true, type: true, required: true, contextKey: true } },
          formSections: { select: { id: true } },
        },
      },
      scaleAssessments: { select: { compositeItemId: true, status: true, attemptEpoch: true } },
      cognitiveSessions: { select: { compositeItemId: true, status: true, attemptNo: true } },
      situationalAttempts: { select: { compositeItemId: true, status: true, attemptEpoch: true } },
      formSectionAttempts: { select: { sectionId: true, status: true, attemptEpoch: true } },
    },
  })))
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)

  const items = parent.compositeAssessment.items.filter((item) => item.type !== 'FORM')
  const itemIds = new Set(items
    .map((item) => item.id))
  const completedItemIds = new Set([
    ...items
      .filter((item) => !item.required && !item.contextKey)
      .map((item) => item.id),
    ...parent.scaleAssessments
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptEpoch === parent.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
    ...parent.cognitiveSessions
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptNo === parent.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
    ...(parent.situationalAttempts ?? [])
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptEpoch === parent.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
  ])
  const sectionIds = new Set(parent.compositeAssessment.formSections.map((section) => section.id))
  const completedSectionIds = new Set(parent.formSectionAttempts
    .filter((section) => sectionIds.has(section.sectionId)
      && section.attemptEpoch === parent.attemptEpoch
      && section.status === 'COMPLETED')
    .map((section) => section.sectionId))
  const totalItems = itemIds.size + sectionIds.size
  const completedItems = completedItemIds.size + completedSectionIds.size
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  const terminalCandidate = parent.deliveryMode === 'FINAL_ONLY'
    && totalItems > 0
    && completedItems >= totalItems

  if (parent.status === 'IN_PROGRESS' && parent.deliveryMode === 'FINAL_ONLY') {
    await db.compositeAssessmentAttempt.update({
      where: { id: parent.id, status: 'IN_PROGRESS' },
      data: { completedItems, progress, lastSavedAt: new Date() },
    })
  }

  return {
    parentId: parent.id,
    status: parent.status,
    progress: parent.status === 'IN_PROGRESS' ? progress : parent.progress,
    completedItems: parent.status === 'IN_PROGRESS' ? completedItems : parent.completedItems,
    totalItems,
    terminalCandidate: parent.status === 'IN_PROGRESS' && terminalCandidate,
  }
}

/** Run an ordinary scale answer mutation with a lock on its own Assessment row. */
export const withScaleAnswerTransaction = async <T>(
  assessmentId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => runReadCommittedLockedTransaction(
  (tx) => measureRequestPhase('row_lock_roundtrip', () => tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `).then(() => undefined),
  callback,
)

/** Run an authenticated questionnaire form answer mutation with a parent-row lock. */
export const withQuestionnaireAssessmentAnswerTransaction = async <T>(
  assessmentId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => runReadCommittedLockedTransaction(
  (tx) => measureRequestPhase('row_lock_roundtrip', () => tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "questionnaire_assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `).then(() => undefined),
  callback,
)

/**
 * Run an ordinary form-answer mutation with a row lock on its assessment.
 *
 * Completion/finalization still uses Serializable above.  A normal answer
 * only needs to serialize writers for the same assessment, however; keeping
 * unrelated students in separate READ COMMITTED transactions avoids SSI
 * false conflicts on the shared questionnaire definition and answer indexes.
 */
export const withQuestionnaireAnswerTransaction = async <T>(
  sessionId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => runReadCommittedLockedTransaction(
  (tx) => measureRequestPhase('row_lock_roundtrip', () => tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "questionnaire_assessments"
      WHERE "session_id" = ${sessionId}
      FOR UPDATE
    `).then(() => undefined),
  callback,
)
