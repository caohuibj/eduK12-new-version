import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  assertAttemptEpoch,
  assertCanonicalSubmissionPayloadSize,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionReplay,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  isInstrumentFinalSubmitError,
  prepareCanonicalSubmission,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { loadFrozenMeasurementContext } from './profile-freeze'
import { decryptCognitivePayload, encryptCognitivePayload, hashTrialPayload } from './cognitive.security'
import { readCognitiveSessionConfig } from './session.service'
import { lockSession } from './session-lock'
import { getCognitiveV2TaskDefinition } from './v2/registry'
import { parseTrialEnvelope } from './v2/trial-envelope'
import { runAuthoritativeScorer } from './v2/authoritative-scorer'
import { readCognitiveAssessmentContext } from './v2/assessment-context'
import { loadCognitiveReferenceSets, resolveCognitiveMetricReferences } from './v2/reference-adapter'
import { projectThreeLayerReport } from './v2/report'
import { parseCognitiveResultSnapshot } from './v2/result-snapshot'
import type { CognitiveResultSnapshot, TrialEnvelope } from './v2/types'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import {
  refreshCompositeFinalOnlyProgress,
  withFinalOnlyCompletionTransaction,
} from '../../services/questionnaireProgressService'
import { submitUnifiedCognitiveSessionFinal } from './unified-final-submit.service'
import { UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT } from './cognitive-admission.service'
import { withUnitSubmitAdmission } from '../../services/unitSubmitAdmission'
import type { AdministrationProvenanceV1 } from './administration-provenance'

export type FinalCognitiveSubmitInput = {
  sessionId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  trials: unknown[]
  administrationProvenance?: AdministrationProvenanceV1
  userId?: string | null
  recoveryTokenHash?: string
}

type FinalizedCognitiveData = {
  payloadHash: string
  trials: TrialEnvelope[]
  persistedTrials: Array<{
    trialIndex: number
    payloadEncrypted: string
    payloadHash: string
  }>
  resultSnapshot: CognitiveResultSnapshot
  resultSnapshotEncrypted: string
  metricsEncrypted: string
  qualityFlagsEncrypted: string
}

type PreparedCognitivePayload = {
  snapshot: NonNullable<ReturnType<typeof readCognitiveSessionConfig>['snapshot']>
  definition: any
  trials: TrialEnvelope[]
  payloadHash: string
}

const responseFromSnapshot = (sessionId: string, snapshot: CognitiveResultSnapshot) => {
  const result = {
    metrics: snapshot.metrics,
    quality: snapshot.quality,
    qualityFlags: snapshot.quality.flags,
    references: snapshot.quality.state === 'invalid' ? [] : snapshot.references,
    report: snapshot.report,
    assessmentContext: snapshot.assessmentContext,
  }
  return {
    sessionId,
    status: 'COMPLETED' as const,
    finishedAt: new Date(snapshot.completedAt),
    ...result,
    result,
  }
}

const lockCompositeParent = async (tx: Prisma.TransactionClient, attemptId: string): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "composite_assessment_attempts"
    WHERE "id" = ${attemptId}
    FOR UPDATE
  `
  if (!rows[0]) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
}

const assertPrincipal = (session: any, input: FinalCognitiveSubmitInput): void => {
  if (input.userId !== null && input.userId !== undefined) {
    if (session.userId !== input.userId) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此认知测评', 403)
    }
    return
  }

  const sessionCredentialMatches = Boolean(
    input.recoveryTokenHash && input.recoveryTokenHash === session.recoveryTokenHash,
  )
  const parentCredentialMatches = Boolean(
    input.recoveryTokenHash
      && session.compositeAttempt?.userId === null
      && input.recoveryTokenHash === session.compositeAttempt.recoveryTokenHash,
  )
  if (session.userId !== null || (!sessionCredentialMatches && !parentCredentialMatches)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此认知测评', 403)
  }
}

const compositeRequiresFrozenContext = (compositeAssessment: any): boolean => Boolean(
  compositeAssessment?.formSections?.some((section: any) => (
    Boolean(section.contextSection) || section.items?.some((item: any) => Boolean(item.contextKey))
  )),
)

const normalizedTrials = (definition: any, values: unknown[]): TrialEnvelope[] => {
  if (values.length === 0 || values.length > 1000) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '试次数量不符合要求', 400)
  }
  try {
    return values.map((value) => {
      const envelope = parseTrialEnvelope(value)
      const parsedPayload = definition.trialSchema.parse(envelope.payload)
      return { ...envelope, payload: parsedPayload }
    }) as TrialEnvelope[]
  } catch (error) {
    if (isInstrumentFinalSubmitError(error)) throw error
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '存在无效的认知试次数据', 400)
  }
}

/**
 * Parse and normalize the submission without reading participant context or
 * doing any scoring. This small prefix is safe to run before the transaction
 * because it lets a completed submission be acknowledged by idempotent
 * replay before any context-dependent work is attempted.
 */
const prepareCognitivePayload = (
  session: any,
  input: FinalCognitiveSubmitInput,
): PreparedCognitivePayload => {
  const storedConfig = measureRequestPhaseSync(
    'final_submit_definition_prepare',
    () => readCognitiveSessionConfig(session.configSnapshotEncrypted),
  )
  if (!storedConfig.snapshot) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '该认知记录不是最终提交模式，请重启后重新作答', 409)
  }
  const snapshot = storedConfig.snapshot
  assertDefinitionHash(snapshot.configHash, input.definitionHash)
  const definition = measureRequestPhaseSync(
    'final_submit_definition_prepare',
    () => getCognitiveV2TaskDefinition(
      session.testType,
      session.engineVersion,
      session.scoringVersion,
    ),
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${session.testType}/${session.engineVersion}/${session.scoringVersion}`)
  const trials = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizedTrials(definition, input.trials),
  )
  const canonical = measureRequestPhaseSync('final_submit_serialization', () => (
    measureRequestPhaseSync('final_submit_payload_hash', () => prepareCanonicalSubmission({ trials }))
  ))
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.cognitive, '认知提交数据')
  return { snapshot, definition, trials, payloadHash: canonical.hash }
}

const prepareFinalCognitiveData = async (
  session: any,
  input: FinalCognitiveSubmitInput,
  preparedPayload: PreparedCognitivePayload = prepareCognitivePayload(session, input),
): Promise<FinalizedCognitiveData> => {
  const { snapshot, definition, trials, payloadHash } = preparedPayload
  let contextState
  try {
    contextState = await measureRequestPhase('final_submit_context_read', () => readCognitiveAssessmentContext(prisma, session))
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      error instanceof Error ? error.message : '认知测评上下文无法读取',
      409,
    )
  }
  const actualContextHash = contextState.reference?.snapshotHash ?? null
  if ((input.contextSnapshotHash ?? null) !== actualContextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评上下文版本已过期，请重启后重新作答', 409)
  }

  let scored
  try {
    // This is intentionally outside the write transaction. It validates the
    // frozen protocol, trial continuity, payload schemas and score in one
    // deterministic pass before any row is mutated.
    scored = await measureRequestPhase('final_submit_scoring', async () => runAuthoritativeScorer({
      definition,
      session: snapshot,
      trials,
      preparedTrials: trials,
      randomSeed: session.randomSeed,
    }))
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      error instanceof Error ? error.message : '认知试次不满足完成条件',
      400,
    )
  }

  const freeze = await measureRequestPhase('final_submit_db_query', () => loadFrozenMeasurementContext(prisma, session.assignmentId))
  const references = scored.quality.state === 'invalid'
    ? []
    : await measureRequestPhase('final_submit_db_query', () => loadCognitiveReferenceSets(prisma as any, session.testType))
  const resolvedReferences = scored.quality.state === 'invalid'
    ? []
    : resolveCognitiveMetricReferences({
        definition,
        metrics: scored.metrics,
        references,
        context: contextState.context,
        quality: scored.quality,
        measurement: freeze,
      })
  const report = projectThreeLayerReport({
    testType: session.testType,
    configVersion: session.configVersion,
    protocolSignature: snapshot.protocolSignature,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    profile: freeze.profile,
    participantPresentation: freeze.frozenReport?.participantPresentation,
    definition: freeze.frozenReport?.v2ReportDefinition ?? definition.report,
    metrics: scored.metrics,
    score: scored,
    metricDefinitions: freeze.frozenReport?.v2MetricDefinitions ?? definition.metrics,
    qualityDefinitions: freeze.frozenReport?.v2QualityDefinitions ?? definition.quality,
  })
  const resultSnapshot = parseCognitiveResultSnapshot({
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    testType: session.testType,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    protocolSignature: snapshot.protocolSignature,
    profile: report.method.profile,
    metrics: scored.metrics,
    quality: scored.quality,
    references: resolvedReferences as unknown as Array<Record<string, unknown>>,
    report: report as unknown as Record<string, unknown>,
    assessmentContext: contextState.reference,
  })

  const encrypted = await measureRequestPhase('final_submit_encryption', async () => ({
    persistedTrials: trials.map((trial) => ({
      trialIndex: trial.trialIndex,
      payloadEncrypted: encryptCognitivePayload(trial),
      payloadHash: hashTrialPayload(trial),
    })),
    resultSnapshotEncrypted: encryptCognitivePayload(resultSnapshot),
    metricsEncrypted: encryptCognitivePayload(scored.metrics),
    qualityFlagsEncrypted: encryptCognitivePayload(scored.quality.flags),
  }))
  return { payloadHash, trials, ...encrypted, resultSnapshot }
}

const submitWithPrincipalImpl = async (input: FinalCognitiveSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const child = await measureRequestPhase('final_submit_admission', () => prisma.cognitiveSession.findUnique({
    where: { id: input.sessionId },
    select: UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT,
  }))
  if (!child) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
  if (child.runtimeGeneration === 'UNIFIED_V1') {
    return submitUnifiedCognitiveSessionFinal(input, child)
  }
  const session = await measureRequestPhase('final_submit_admission', () => prisma.cognitiveSession.findUnique({
    where: { id: input.sessionId },
    select: {
      ...UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT,
      compositeAttempt: {
        select: {
          userId: true,
          recoveryTokenHash: true,
          status: true,
          deliveryMode: true,
          attemptEpoch: true,
          contextSnapshotHash: true,
          frozenActiveSlotSetEncrypted: true,
          frozenActiveSlotSetHash: true,
          compositeAssessment: {
            select: {
              formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } },
            },
          },
        },
      },
    },
  }))
  if (!session) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
  assertPrincipal(session, input)
  assertFinalOnly(session.deliveryMode)
  assertAttemptEpoch(session.attemptNo, input.attemptEpoch)
  assertFinalSubmitStatus(session.status, '认知测评')
  if (session.compositeAttempt) {
    assertFinalOnly(session.compositeAttempt.deliveryMode)
    assertFinalSubmitStatus(session.compositeAttempt.status, '上级测评')
    assertAttemptEpoch(session.compositeAttempt.attemptEpoch, input.attemptEpoch)
    if (session.compositeAttempt.status === 'COMPLETED' && session.status !== 'COMPLETED') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评已结束，请重启后重新作答', 409)
    }
  }
  const requiresFrozenContext = compositeRequiresFrozenContext(session.compositeAttempt?.compositeAssessment)
  const currentContextHash = session.compositeAttempt?.contextSnapshotHash ?? null
  if (requiresFrozenContext && currentContextHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== currentContextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
  }
  const sessionForPreparation = { ...session, requiresFrozenContext }
  const payload = measureRequestPhaseSync('final_submit_non_db_compute', () => prepareCognitivePayload(sessionForPreparation, input))
  if (session.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(session, submissionId, payload.payloadHash)
    if (replay === 'replay') {
      if (!session.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const snapshot = parseCognitiveResultSnapshot(
        decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted),
      )
      return {
        submissionId,
        replayed: true,
        payloadHash: payload.payloadHash,
        response: responseFromSnapshot(session.id, snapshot),
        shouldFinalize: Boolean(session.compositeAttemptId),
        finalizeCompositeAttemptId: session.compositeAttemptId,
      }
    }
  }

  // Context reads, reference resolution, scoring and report generation stay
  // outside the write transaction. The transaction below only persists the
  // already-prepared result after it re-checks the authoritative session row.
  const prepared = await prepareFinalCognitiveData(sessionForPreparation, input, payload)
  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    // FINAL_ONLY embedded writes always lock child → parent. Parent
    // finalization runs after this transaction and never reverses the order.
    const current = await lockSession(tx, input.sessionId)
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptNo, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '认知测评')
    if (current.compositeAttemptId) await lockCompositeParent(tx, current.compositeAttemptId)
    if (current.compositeAttemptId) {
      const parent = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: current.compositeAttemptId },
        select: {
          status: true,
          deliveryMode: true,
          attemptEpoch: true,
          contextSnapshotHash: true,
          compositeAssessment: {
            select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
          },
        },
      })
      if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
      assertFinalOnly(parent.deliveryMode)
      assertFinalSubmitStatus(parent.status, '上级测评')
      assertAttemptEpoch(parent.attemptEpoch, input.attemptEpoch)
      if (parent.status === 'COMPLETED' && current.status !== 'COMPLETED') {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评已结束，请重启后重新作答', 409)
      }
      const currentRequiresFrozenContext = compositeRequiresFrozenContext(parent?.compositeAssessment)
      if (currentRequiresFrozenContext && !parent?.contextSnapshotHash) {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
      }
      if ((input.contextSnapshotHash ?? null) !== (parent?.contextSnapshotHash ?? null)) {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
      }
    }
    const replay = assertSubmissionReplay(current, submissionId, prepared.payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      if (!current.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const snapshot = parseCognitiveResultSnapshot(
        // The result is already durable; replay never re-runs a write.
        decryptCognitivePayload<unknown>(current.resultSnapshotEncrypted),
      )
      const parent = current.compositeAttemptId
        ? await refreshCompositeFinalOnlyProgress(tx, current.compositeAttemptId)
        : null
      return {
        replayed: true,
        payloadHash: prepared.payloadHash,
        response: responseFromSnapshot(current.id, snapshot),
        parent,
        shouldFinalize: Boolean(parent?.terminalCandidate),
      }
    }
    if (current.status !== 'IN_PROGRESS') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评已结束，请重启后重新作答', 409)
    }

    try {
      await tx.cognitiveTrial.createMany({
        data: prepared.persistedTrials.map((trial) => ({
          sessionId: current.id,
          trialIndex: trial.trialIndex,
          payloadEncrypted: trial.payloadEncrypted,
          payloadHash: trial.payloadHash,
        })),
      })
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知试次已发生变化，请重启后重新作答', 409)
      }
      throw error
    }

    const finishedAt = new Date(prepared.resultSnapshot.completedAt)
    const updated = await tx.cognitiveSession.updateMany({
      where: {
        id: current.id,
        status: 'IN_PROGRESS',
        attemptNo: input.attemptEpoch,
        deliveryMode: 'FINAL_ONLY',
        submissionId: null,
      },
      data: {
        status: 'COMPLETED',
        finishedAt,
        scoreEncrypted: null,
        metricsEncrypted: prepared.metricsEncrypted,
        qualityFlagsEncrypted: prepared.qualityFlagsEncrypted,
        resultSnapshotEncrypted: prepared.resultSnapshotEncrypted,
        submissionId,
        submissionPayloadHash: prepared.payloadHash,
        submittedAt: finishedAt,
      },
    })
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评状态已变化，请重试', 409)
    const parent = current.compositeAttemptId
      ? await refreshCompositeFinalOnlyProgress(tx, current.compositeAttemptId)
      : null
    return {
      replayed: false,
      payloadHash: prepared.payloadHash,
      response: responseFromSnapshot(current.id, prepared.resultSnapshot),
      parent,
      shouldFinalize: Boolean(parent?.terminalCandidate),
    }
  })

  const { parent: _parent, shouldFinalize, ...response } = committed
  return {
    submissionId,
    ...response,
    shouldFinalize: Boolean(shouldFinalize),
    finalizeCompositeAttemptId: shouldFinalize ? session.compositeAttemptId : null,
  }
}

/** UNIT gate covers persist/score only; composite aggregate finalizes after release. */
const submitWithPrincipal = async (input: FinalCognitiveSubmitInput): Promise<any> => {
  const result = await withUnitSubmitAdmission(() => submitWithPrincipalImpl(input))
  if (result && typeof result === 'object' && 'finalizeCompositeAttemptId' in result) {
    const { shouldFinalize, finalizeCompositeAttemptId, ...response } = result as any
    if (shouldFinalize && finalizeCompositeAttemptId) {
      const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
      await measureRequestPhase('final_submit_parent_finalization', () => finalizeCompositeAttemptIfReady(finalizeCompositeAttemptId))
    }
    return response
  }
  return result
}

export const submitCognitiveSessionFinal = (userId: string, input: Omit<FinalCognitiveSubmitInput, 'userId'>) =>
  submitWithPrincipal({ ...input, userId })

export const submitCognitiveSessionFinalForPublic = (
  input: Omit<FinalCognitiveSubmitInput, 'userId'>,
  recoveryTokenHash: string,
) => submitWithPrincipal({ ...input, userId: null, recoveryTokenHash })
