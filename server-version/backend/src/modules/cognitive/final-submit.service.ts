import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  assertAttemptEpoch,
  assertDefinitionHash,
  assertFinalOnly,
  assertSubmissionPayloadSize,
  assertSubmissionReplay,
  computeSubmissionPayloadHash,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  isInstrumentFinalSubmitError,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { loadFrozenMeasurementContext } from './profile-freeze'
import { encryptCognitivePayload, hashTrialPayload } from './cognitive.security'
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

export type FinalCognitiveSubmitInput = {
  sessionId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  trials: unknown[]
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
  const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
  if (!storedConfig.snapshot) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '该认知记录不是最终提交模式，请重启后重新作答', 409)
  }
  const snapshot = storedConfig.snapshot
  assertDefinitionHash(snapshot.configHash, input.definitionHash)
  const definition = getCognitiveV2TaskDefinition(
    session.testType,
    session.engineVersion,
    session.scoringVersion,
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${session.testType}/${session.engineVersion}/${session.scoringVersion}`)
  const trials = normalizedTrials(definition, input.trials)
  assertSubmissionPayloadSize({ trials }, FINAL_SUBMISSION_MAX_BYTES.cognitive, '认知提交数据')
  return { snapshot, definition, trials, payloadHash: computeSubmissionPayloadHash({ trials }) }
}

const prepareFinalCognitiveData = async (
  session: any,
  input: FinalCognitiveSubmitInput,
  preparedPayload: PreparedCognitivePayload = prepareCognitivePayload(session, input),
): Promise<FinalizedCognitiveData> => {
  const { snapshot, definition, trials, payloadHash } = preparedPayload
  let scored
  try {
    // This is intentionally outside the write transaction. It validates the
    // frozen protocol, trial continuity, payload schemas and score in one
    // deterministic pass before any row is mutated.
    scored = runAuthoritativeScorer({
      definition,
      session: snapshot,
      trials,
      randomSeed: session.randomSeed,
    })
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      error instanceof Error ? error.message : '认知试次不满足完成条件',
      400,
    )
  }

  let contextState
  try {
    contextState = await readCognitiveAssessmentContext(prisma, session)
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

  const references = scored.quality.state === 'invalid'
    ? []
    : await loadCognitiveReferenceSets(prisma as any, session.testType)
  const resolvedReferences = scored.quality.state === 'invalid'
    ? []
    : resolveCognitiveMetricReferences({
        definition,
        metrics: scored.metrics,
        references,
        context: contextState.context,
        quality: scored.quality,
      })
  const freeze = await loadFrozenMeasurementContext(prisma, session.assignmentId)
  const report = projectThreeLayerReport({
    testType: session.testType,
    configVersion: session.configVersion,
    protocolSignature: snapshot.protocolSignature,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    profile: freeze.profile,
    definition: definition.report,
    metrics: scored.metrics,
    score: scored,
    metricDefinitions: definition.metrics,
    qualityDefinitions: definition.quality,
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

  return {
    payloadHash,
    trials,
    persistedTrials: trials.map((trial) => ({
      trialIndex: trial.trialIndex,
      payloadEncrypted: encryptCognitivePayload(trial),
      payloadHash: hashTrialPayload(trial),
    })),
    resultSnapshot,
    resultSnapshotEncrypted: encryptCognitivePayload(resultSnapshot),
    metricsEncrypted: encryptCognitivePayload(scored.metrics),
    qualityFlagsEncrypted: encryptCognitivePayload(scored.quality.flags),
  }
}

const submitWithPrincipal = async (input: FinalCognitiveSubmitInput) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      userId: true,
      compositeAttemptId: true,
      recoveryTokenHash: true,
      testType: true,
      attemptNo: true,
      status: true,
      deliveryMode: true,
      configVersion: true,
      configSnapshotEncrypted: true,
      engineVersion: true,
      scoringVersion: true,
      randomSeed: true,
      assignmentId: true,
      resultSnapshotEncrypted: true,
      submissionId: true,
      submissionPayloadHash: true,
      compositeAttempt: { select: { userId: true, recoveryTokenHash: true } },
    },
  })
  if (!session) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
  assertPrincipal(session, input)
  assertFinalOnly(session.deliveryMode)
  assertAttemptEpoch(session.attemptNo, input.attemptEpoch)

  const payload = prepareCognitivePayload(session, input)
  if (session.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(session, submissionId, payload.payloadHash)
    if (replay === 'replay') {
      if (!session.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const snapshot = parseCognitiveResultSnapshot(
        (await import('./cognitive.security')).decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted),
      )
      return {
        submissionId,
        replayed: true,
        payloadHash: payload.payloadHash,
        response: responseFromSnapshot(session.id, snapshot),
      }
    }
  }

  // Context reads, reference resolution, scoring and report generation stay
  // outside the write transaction. The transaction below only persists the
  // already-prepared result after it re-checks the authoritative session row.
  const prepared = await prepareFinalCognitiveData(session, input, payload)
  const committed = await prisma.$transaction(async (tx) => {
    // Embedded Cognitive always uses parent → child locking. Standalone
    // sessions have no parent and lock only the session row.
    if (session.compositeAttemptId) await lockCompositeParent(tx, session.compositeAttemptId)
    const current = await lockSession(tx, input.sessionId)
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptNo, input.attemptEpoch)
    const replay = assertSubmissionReplay(current, submissionId, prepared.payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      if (!current.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const snapshot = parseCognitiveResultSnapshot(
        // The result is already durable; replay never re-runs a write.
        (await import('./cognitive.security')).decryptCognitivePayload<unknown>(current.resultSnapshotEncrypted),
      )
      return { replayed: true, payloadHash: prepared.payloadHash, response: responseFromSnapshot(current.id, snapshot) }
    }
    if (current.compositeAttemptId) {
      const parent = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: current.compositeAttemptId },
        select: { contextSnapshotHash: true },
      })
      if ((input.contextSnapshotHash ?? null) !== (parent?.contextSnapshotHash ?? null)) {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
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
    return {
      replayed: false,
      payloadHash: prepared.payloadHash,
      response: responseFromSnapshot(current.id, prepared.resultSnapshot),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

  if (session.compositeAttemptId) {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    await finalizeCompositeAttemptIfReady(session.compositeAttemptId)
  }
  return { submissionId, ...committed }
}

export const submitCognitiveSessionFinal = (userId: string, input: Omit<FinalCognitiveSubmitInput, 'userId'>) =>
  submitWithPrincipal({ ...input, userId })

export const submitCognitiveSessionFinalForPublic = (
  input: Omit<FinalCognitiveSubmitInput, 'userId'>,
  recoveryTokenHash: string,
) => submitWithPrincipal({ ...input, userId: null, recoveryTokenHash })
