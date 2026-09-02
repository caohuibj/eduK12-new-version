import { createHash } from 'node:crypto'
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
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { loadFrozenMeasurementContext } from './profile-freeze'
import { decryptCognitivePayload, encryptCognitivePayload } from './cognitive.security'
import { readCognitiveSessionConfig } from './session.service'
import { getCognitiveV2TaskDefinition } from './v2/registry'
import { readCognitiveAssessmentContext } from './v2/assessment-context'
import { validateAndNormalizeTrials } from './v2/trial-normalizer'
import { runAuthoritativeScorer } from './v2/authoritative-scorer'
import { resolveCognitiveMetricReferences } from './v2/reference-adapter'
import { projectThreeLayerReport } from './v2/report'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from './v2/result-snapshot'
import type { CognitiveResultSnapshot, TrialEnvelope } from './v2/types'
import { parseCompiledInstrumentRuntime } from '../assessment-runtime/compiler'
import { canonicalJsonBytes } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadFrozenReferenceSets } from '../assessment-runtime/reference-binding'
import {
  createCanonicalUnitResultEnvelope,
  projectCognitiveCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import { compositeItemSlotKey, getFrozenActiveSlot } from '../assessment-runtime/slot-set'
import {
  createUnifiedCognitiveRawSubmissionPayload,
  UNIFIED_COGNITIVE_RAW_ENCODING_VERSION,
  UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION,
} from './unified-raw-submission'

export type UnifiedCognitiveFinalSubmitInput = {
  sessionId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  trials: unknown[]
  userId?: string | null
  recoveryTokenHash?: string
}

export type UnifiedCognitiveAdmission = {
  id: string
  userId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  recoveryTokenHash: string | null
  testType: string
  attemptNo: number
  status: string
  deliveryMode: string
  runtimeGeneration: 'UNIFIED_V1' | null
  compiledRuntimeHash: string | null
  configVersion: string
  configSnapshotEncrypted: string
  engineVersion: string
  scoringVersion: string
  randomSeed: string
  assignmentId: string | null
  resultSnapshotEncrypted: string | null
  submissionId: string | null
  submissionPayloadHash: string | null
  compositeAttempt?: {
    userId: string | null
    recoveryTokenHash: string | null
    status: string
    deliveryMode: string
    attemptEpoch: number
    contextSnapshotHash: string | null
    frozenActiveSlotSetEncrypted: string | null
    frozenActiveSlotSetHash: string | null
    compositeAssessment: {
      formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
    }
  } | null
}

const responseFromSnapshot = (sessionId: string, snapshot: CognitiveResultSnapshot) => {
  const result = {
    metrics: snapshot.metrics,
    quality: snapshot.quality,
    qualityFlags: snapshot.quality.flags,
    references: referencesForCognitiveResult(snapshot),
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

const assertPrincipal = (session: UnifiedCognitiveAdmission, input: UnifiedCognitiveFinalSubmitInput): void => {
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

const requiresFrozenContext = (session: UnifiedCognitiveAdmission): boolean => Boolean(
  session.compositeAttempt?.compositeAssessment.formSections.some((section) => (
    section.contextSection || section.items.some((item) => Boolean(item.contextKey))
  )),
)

const assertAdmission = (session: UnifiedCognitiveAdmission, input: UnifiedCognitiveFinalSubmitInput): void => {
  if (session.runtimeGeneration !== 'UNIFIED_V1' || !session.compiledRuntimeHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知运行时快照缺失，请重启后重新作答', 409)
  }
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
  const contextHash = session.compositeAttempt?.contextSnapshotHash ?? null
  if (requiresFrozenContext(session) && contextHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== contextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评上下文版本已变化，请重试', 409)
  }
  if (session.compositeAttempt && session.compositeItemId) {
    let slot
    try {
      slot = getFrozenActiveSlot({
        encrypted: session.compositeAttempt.frozenActiveSlotSetEncrypted,
        storedHash: session.compositeAttempt.frozenActiveSlotSetHash,
        attemptEpoch: input.attemptEpoch,
        slotKey: compositeItemSlotKey(session.compositeItemId, 'COGNITIVE'),
      })
    } catch (error) {
      throw new InstrumentFinalSubmitError(
        'DEFINITION_MISMATCH',
        error instanceof Error ? error.message : '认知冻结单元不可用',
        409,
      )
    }
    if (
      slot.unitType !== 'COGNITIVE'
      || !slot.required
      || slot.sourceDefinitionIdentity.key !== session.testType
    ) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知冻结单元身份不匹配', 409)
    }
  }
}

const normalizeSubmission = (
  definition: ReturnType<typeof getCognitiveV2TaskDefinition>,
  values: unknown[],
): TrialEnvelope[] => {
  if (!definition) throw new Error('Cognitive task definition is unavailable')
  try {
    const trials = validateAndNormalizeTrials({ definition, values, maxTrials: 1000 })
    for (const [index, trial] of trials.entries()) {
      if (trial.trialIndex !== index) throw new Error('Trial envelopes must be ordered and contiguous')
    }
    return trials
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      error instanceof Error ? error.message : '存在无效的认知试次数据',
      400,
    )
  }
}

const prepareRuntime = (session: UnifiedCognitiveAdmission, input: UnifiedCognitiveFinalSubmitInput) => {
  const stored = readCognitiveSessionConfig(session.configSnapshotEncrypted)
  if (!stored.snapshot || stored.snapshot.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知运行时快照不可用，请重启后重新作答', 409)
  }
  const snapshot = stored.snapshot
  const runtime = parseCompiledInstrumentRuntime(snapshot.compiledRuntime)
  if (
    runtime.instrumentType !== 'COGNITIVE'
    || runtime.instrumentKey !== snapshot.testType
    || runtime.instrumentVersion !== snapshot.engineVersion
    || runtime.scorerVersion !== snapshot.scoringVersion
    || session.compiledRuntimeHash !== runtime.compiledRuntimeHash
  ) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知编译运行时身份已变化，请重启后重试', 409)
  }
  if (session.compositeAttempt && session.compositeItemId) {
    let slot
    try {
      slot = getFrozenActiveSlot({
        encrypted: session.compositeAttempt.frozenActiveSlotSetEncrypted,
        storedHash: session.compositeAttempt.frozenActiveSlotSetHash,
        attemptEpoch: input.attemptEpoch,
        slotKey: compositeItemSlotKey(session.compositeItemId, 'COGNITIVE'),
      })
    } catch (error) {
      throw new InstrumentFinalSubmitError(
        'DEFINITION_MISMATCH',
        error instanceof Error ? error.message : '认知冻结单元不可用',
        409,
      )
    }
    const slotCompiledRuntimeHash = slot.sourceBinding.compiledRuntimeHash
    if (
      slot.sourceDefinitionIdentity.hash !== runtime.sourceDefinitionHash
      || slot.sourceDefinitionIdentity.version !== runtime.instrumentVersion
      || (slotCompiledRuntimeHash !== undefined && slotCompiledRuntimeHash !== runtime.compiledRuntimeHash)
    ) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知冻结单元运行时不匹配', 409)
    }
  }
  assertDefinitionHash(snapshot.configHash, input.definitionHash)
  const definition = getCognitiveV2TaskDefinition(
    snapshot.testType,
    snapshot.engineVersion,
    snapshot.scoringVersion,
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${snapshot.testType}/${snapshot.engineVersion}/${snapshot.scoringVersion}`)
  const trials = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeSubmission(definition, input.trials),
  )
  const payload = { trials }
  const bytes = canonicalJsonBytes(payload)
  const payloadHash = createHash('sha256').update(bytes).digest('hex')
  assertCanonicalSubmissionPayloadSize({ bytes: bytes.byteLength }, FINAL_SUBMISSION_MAX_BYTES.cognitive, '认知提交数据')
  return { snapshot, runtime, definition, trials, payloadHash }
}

export const submitUnifiedCognitiveSessionFinal = async (
  input: UnifiedCognitiveFinalSubmitInput,
  admission: UnifiedCognitiveAdmission,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  assertAdmission(admission, input)
  const prepared = measureRequestPhaseSync('final_submit_definition_prepare', () => prepareRuntime(admission, input))

  if (admission.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(admission, submissionId, prepared.payloadHash)
    if (replay === 'replay') {
      if (!admission.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const snapshot = parseCognitiveResultSnapshot(
        decryptCognitivePayload<unknown>(admission.resultSnapshotEncrypted),
      )
      return {
        submissionId,
        payloadHash: prepared.payloadHash,
        replayed: true,
        response: responseFromSnapshot(admission.id, snapshot),
      }
    }
  }

  let contextState
  try {
    contextState = await measureRequestPhase('final_submit_context_read', () => readCognitiveAssessmentContext(
      prisma,
      { compositeAttemptId: admission.compositeAttemptId, requiresFrozenContext: requiresFrozenContext(admission) },
    ))
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      error instanceof Error ? error.message : '认知测评上下文无法读取',
      409,
    )
  }
  if ((input.contextSnapshotHash ?? null) !== (contextState.reference?.snapshotHash ?? null)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评上下文版本已过期，请重试', 409)
  }

  let scored
  try {
    scored = await measureRequestPhase('final_submit_scoring', async () => runAuthoritativeScorer({
      definition: prepared.definition,
      session: prepared.snapshot,
      trials: prepared.trials,
      preparedTrials: prepared.trials,
      randomSeed: admission.randomSeed,
    }))
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      error instanceof Error ? error.message : '认知试次不满足完成条件',
      400,
    )
  }

  const referenceDefinitions = scored.quality.state === 'invalid' || prepared.snapshot.referenceBindings?.length === 0
    ? []
    : await measureRequestPhase('final_submit_db_query', () => loadFrozenReferenceSets(prisma as any, {
        instrumentType: 'COGNITIVE',
        instrumentKey: prepared.runtime.instrumentKey,
        bindings: prepared.snapshot.referenceBindings ?? [],
      }))
  const resolvedReferences = scored.quality.state === 'invalid'
    ? []
    : prepared.definition.references.length === 0
      ? []
      : resolveCognitiveMetricReferences({
          definition: prepared.definition,
          metrics: scored.metrics,
          references: referenceDefinitions,
          context: contextState.context,
          quality: scored.quality,
        })
  const freeze = await measureRequestPhase('final_submit_db_query', () => loadFrozenMeasurementContext(prisma, admission.assignmentId))
  const resultSnapshot = parseCognitiveResultSnapshot({
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    testType: prepared.snapshot.testType,
    configVersion: prepared.snapshot.configVersion,
    engineVersion: prepared.snapshot.engineVersion,
    scoringVersion: prepared.snapshot.scoringVersion,
    protocolSignature: prepared.snapshot.protocolSignature,
    profile: freeze.profile,
    metrics: scored.metrics,
    quality: scored.quality,
    references: resolvedReferences as unknown as Array<Record<string, unknown>>,
    report: projectThreeLayerReport({
      testType: prepared.snapshot.testType,
      configVersion: prepared.snapshot.configVersion,
      protocolSignature: prepared.snapshot.protocolSignature,
      engineVersion: prepared.snapshot.engineVersion,
      scoringVersion: prepared.snapshot.scoringVersion,
      profile: freeze.profile,
      definition: prepared.definition.report,
      metrics: scored.metrics,
      score: scored,
      metricDefinitions: prepared.definition.metrics,
      qualityDefinitions: prepared.definition.quality,
    }) as unknown as Record<string, unknown>,
    assessmentContext: contextState.reference,
  })

  const canonicalResult = admission.compositeAttemptId && prepared.runtime.runtimeCapabilities.aggregateEligible
    ? (() => {
        if (
          admission.assignmentId
          && (
            !freeze.resolvedConfigHash
            || !/^[0-9a-f]{64}$/.test(freeze.resolvedConfigHash)
            || freeze.resolvedConfigHash !== prepared.snapshot.configHash
          )
        ) {
          throw new InstrumentFinalSubmitError(
            'DEFINITION_MISMATCH',
            '认知会话冻结配置与分发冻结配置不匹配，请重启后重试',
            409,
          )
        }
        return projectCognitiveCanonicalUnitResult({
          snapshot: resultSnapshot,
          runtime: prepared.runtime,
          contextHash: contextState.reference?.snapshotHash ?? null,
          referenceBindings: prepared.snapshot.referenceBindings ?? [],
          resolvedConfigHash: freeze.resolvedConfigHash ?? prepared.snapshot.configHash,
        })
      })()
    : null
  const completedAt = new Date(resultSnapshot.completedAt)
  const encrypted = await measureRequestPhase('final_submit_encryption', async () => ({
    rawSubmission: encryptUnifiedRuntimePayload(createUnifiedCognitiveRawSubmissionPayload({
      attemptEpoch: input.attemptEpoch,
      trials: prepared.trials,
    })),
    resultSnapshot: encryptCognitivePayload(resultSnapshot),
    canonicalResult: canonicalResult
      ? encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope({
          core: canonicalResult,
          completedAt,
          persistenceProvenance: {
            sourceType: 'COGNITIVE_SESSION',
            sourceAttemptId: admission.id,
            sourceSubmissionId: submissionId,
          },
        }))
      : null,
  }))

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    const current = await tx.cognitiveSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        compositeAttemptId: true,
        status: true,
        deliveryMode: true,
        attemptNo: true,
        runtimeGeneration: true,
        compiledRuntimeHash: true,
        submissionId: true,
        submissionPayloadHash: true,
        resultSnapshotEncrypted: true,
      },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptNo, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '认知测评')
    if (current.runtimeGeneration !== 'UNIFIED_V1' || current.compiledRuntimeHash !== prepared.runtime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知运行时身份已变化，请重试', 409)
    }
    const replay = assertSubmissionReplay(current, submissionId, prepared.payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      if (!current.resultSnapshotEncrypted) throw new Error('Completed Cognitive session result snapshot is missing')
      const stored = parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(current.resultSnapshotEncrypted))
      return { replayed: true, response: responseFromSnapshot(current.id, stored) }
    }
    if (current.status !== 'IN_PROGRESS') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评已结束，请重试', 409)
    }

    try {
      await tx.cognitiveRawSubmission.create({
        data: {
          sessionId: current.id,
          attemptEpoch: input.attemptEpoch,
          trialCount: prepared.trials.length,
          payloadEncrypted: encrypted.rawSubmission,
          payloadSchemaVersion: UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION,
          encodingVersion: UNIFIED_COGNITIVE_RAW_ENCODING_VERSION,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评提交已被其他请求接收，请重试', 409)
      }
      throw error
    }
    const updateWhere: Record<string, unknown> = {
      id: current.id,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptNo: input.attemptEpoch,
      submissionId: null,
    }
    if (current.compositeAttemptId) {
      updateWhere.compositeAttempt = {
        is: {
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          runtimeGeneration: 'UNIFIED_V1',
          attemptEpoch: input.attemptEpoch,
        },
      }
    }
    const updated = await tx.cognitiveSession.updateMany({
      where: updateWhere as any,
      data: {
        status: 'COMPLETED',
        finishedAt: completedAt,
        scoreEncrypted: null,
        metricsEncrypted: null,
        qualityFlagsEncrypted: null,
        resultSnapshotEncrypted: encrypted.resultSnapshot,
        submissionId,
        submissionPayloadHash: prepared.payloadHash,
        submittedAt: completedAt,
      },
    })
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评状态已变化，请重试', 409)

    if (encrypted.canonicalResult && admission.compositeAttemptId && admission.compositeItemId) {
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        compositeAttemptId: admission.compositeAttemptId,
        attemptEpoch: input.attemptEpoch,
        slotKey: compositeItemSlotKey(admission.compositeItemId, 'COGNITIVE'),
        unitType: 'COGNITIVE',
        payloadKind: 'UNIT_RESULT',
        sourceType: 'COGNITIVE_SESSION',
        sourceAttemptId: current.id,
        sourceSubmissionId: submissionId,
        sourceDefinitionHash: prepared.runtime.sourceDefinitionHash,
        compiledRuntimeHash: prepared.runtime.compiledRuntimeHash,
        canonicalResultEncrypted: encrypted.canonicalResult,
        completedAt,
      })
    }
    return { replayed: false, response: responseFromSnapshot(current.id, resultSnapshot) }
  })

  const parent = admission.compositeAttemptId
    ? await measureRequestPhase('final_submit_parent_finalization', async () => {
        const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
        return finalizeCompositeAttemptIfReady(admission.compositeAttemptId as string)
      })
    : null
  return { submissionId, payloadHash: prepared.payloadHash, ...committed, parent }
}
