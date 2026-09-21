import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
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
import { missingRequiredScaleItemCodes, validateScaleAnswer, type ScaleAnswer } from './scale-scoring'
import { buildScaleResult, type ScaleResultV2 } from './scale-result'
import { encryptScaleAnswers, encryptScaleResult, readScaleAnswers, scaleAssessmentForResponse } from './scale-workflow.service'
import {
  decryptFrozenScaleRuntimeSnapshot,
  type VersionedFrozenScaleRuntimeSnapshot,
} from '../assessment-runtime/runtime-snapshot'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import {
  createCanonicalUnitResultEnvelope,
  projectScaleCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import { loadFrozenReferenceSets } from '../assessment-runtime/reference-binding'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { canonicalJsonBytes } from '../assessment-runtime/canonical'
import type { VersionedFrozenUnitAdmission } from '../assessment-runtime/admission-snapshot-v2'
import { buildScaleBundleBridge } from '../assessment-bundle/sources'
import type { DeviceInputProvenanceV1 } from './device-input-provenance'
import {
  activateScaleAdmission,
  assertAdmissionParentBinding,
  type ScaleAdmissionChildRow,
} from './scale-admission.service'

export type UnifiedScaleFinalSubmitInput = {
  assessmentId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  deviceInputProvenance?: DeviceInputProvenanceV1
  answers: Array<{
    itemCode: string
    responseValue: string | number
    responseTimeMs?: number
    changeCount?: number
  }>
  userId?: string | null
  questionnaireSessionId?: string
  compositeAttemptId?: string
  recoveryTokenHash?: string
}

export type UnifiedScaleAdmission = ScaleAdmissionChildRow

const assertPrincipal = (child: ScaleAdmissionChildRow, admission: VersionedFrozenUnitAdmission, input: UnifiedScaleFinalSubmitInput): void => {
  if (input.userId && (child.userId === input.userId || admission.principal.userId === input.userId)) return
  if (input.questionnaireSessionId && admission.principal.questionnaireSessionId === input.questionnaireSessionId) {
    if (input.userId && admission.principal.userId === input.userId) return
    if (!input.userId && input.recoveryTokenHash && admission.principal.recoveryTokenHash === input.recoveryTokenHash) return
  }
  if (input.compositeAttemptId && child.compositeAttemptId === input.compositeAttemptId) {
    if (!input.userId && input.recoveryTokenHash && admission.principal.recoveryTokenHash === input.recoveryTokenHash) return
    if (input.userId && (child.userId === input.userId || admission.principal.userId === input.userId)) return
  }
  throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此量表测评', 403)
}

const normalizeAnswers = (
  definition: VersionedFrozenScaleRuntimeSnapshot['definition'],
  input: UnifiedScaleFinalSubmitInput['answers'],
): ScaleAnswer[] => {
  const byItem = new Map<string, ScaleAnswer>()
  for (const answer of input) {
    if (byItem.has(answer.itemCode)) {
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `量表题目 ${answer.itemCode} 不能重复提交`, 400)
    }
    const normalized: ScaleAnswer = {
      itemCode: answer.itemCode,
      responseValue: answer.responseValue,
      ...(answer.responseTimeMs === undefined ? {} : { responseTimeMs: answer.responseTimeMs }),
      ...(answer.changeCount === undefined ? {} : { changeCount: answer.changeCount }),
    }
    try {
      validateScaleAnswer(definition, normalized)
    } catch (error) {
      if (error instanceof Error) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', error.message, 400)
      throw error
    }
    byItem.set(answer.itemCode, normalized)
  }
  return definition.items.flatMap((item) => {
    const answer = byItem.get(item.itemCode)
    return answer ? [answer] : []
  })
}

const assertFrozenAdmission = (
  child: ScaleAdmissionChildRow,
  admission: VersionedFrozenUnitAdmission,
  input: UnifiedScaleFinalSubmitInput,
): void => {
  if (child.runtimeGeneration !== 'UNIFIED_V1' || !child.runtimeSnapshotEncrypted) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表运行时快照缺失，请重启后重新作答', 409)
  }
  if (admission.attemptEpoch !== child.attemptEpoch) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表准入快照与当前作答轮次不匹配', 409)
  }
  if (
    !admission.scale
    || admission.scale.id !== child.scale.id
    || admission.scale.code !== child.scale.code
    || admission.scale.instrumentVersion !== child.scale.instrumentVersion
  ) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表准入快照身份不匹配', 409)
  }
  if (admission.governance.status === 'HOLD') {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      admission.governance.holdReason ?? '量表准入处于 HOLD，无法提交',
      409,
    )
  }
  assertPrincipal(child, admission, input)
  assertFinalOnly(child.deliveryMode)
  assertAttemptEpoch(child.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(child.status, '量表测评')
  assertAdmissionParentBinding(child, admission)
  if ((input.contextSnapshotHash ?? null) !== (admission.contextSnapshotHash ?? null)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文版本已变化，请重试', 409)
  }
}

const assertRuntimeAgainstAdmission = (
  child: ScaleAdmissionChildRow,
  admission: VersionedFrozenUnitAdmission,
  snapshot: VersionedFrozenScaleRuntimeSnapshot,
  input: UnifiedScaleFinalSubmitInput,
): void => {
  if (snapshot.instrumentKey !== child.scale.code || snapshot.instrumentVersion !== child.scale.instrumentVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结的量表运行时身份不匹配', 409)
  }
  if (child.compiledRuntimeHash !== snapshot.compiledRuntime.compiledRuntimeHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结的量表编译运行时不匹配', 409)
  }
  if (admission.parent) {
    if (
      admission.parent.sourceDefinitionHash !== snapshot.sourceDefinitionHash
      || admission.parent.compiledRuntimeHash !== snapshot.compiledRuntime.compiledRuntimeHash
    ) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元运行时不匹配', 409)
    }
  }
  assertDefinitionHash(snapshot.legacyDefinitionHash, input.definitionHash)
}

const buildResult = async (
  child: ScaleAdmissionChildRow,
  snapshot: VersionedFrozenScaleRuntimeSnapshot,
  answers: ScaleAnswer[],
  admission: VersionedFrozenUnitAdmission,
): Promise<ScaleResultV2> => {
  let references: Awaited<ReturnType<typeof loadFrozenReferenceSets>> = []
  if (snapshot.referenceBindings.length > 0) {
    references = await measureRequestPhase('final_submit_db_query', () => loadFrozenReferenceSets(prisma as any, {
      instrumentType: 'SCALE',
      instrumentKey: snapshot.instrumentKey,
      bindings: snapshot.referenceBindings,
    }))
  }
  return buildScaleResult({
    scaleId: child.scale.id,
    instrumentKey: child.scale.code,
    name: child.scale.name,
    instrumentVersion: child.scale.instrumentVersion,
    definition: snapshot.definition,
    answers,
    referenceSets: references,
    participantContext: admission.contextValues ?? undefined,
    participantContextHash: admission.contextSnapshotHash,
  })
}

const txAdmissionSelect = {
  id: true,
  status: true,
  deliveryMode: true,
  runtimeGeneration: true,
  compiledRuntimeHash: true,
  attemptEpoch: true,
  startedAt: true,
  submissionId: true,
  submissionPayloadHash: true,
  questionnaireAssessmentId: true,
  compositeAttemptId: true,
  frozenAdmissionSnapshotHash: true,
  answers: true,
  result: true,
  progress: true,
  completedAt: true,
  totalTime: true,
} as const

export const submitUnifiedScaleAssessmentFinal = async (
  input: UnifiedScaleFinalSubmitInput,
  child: ScaleAdmissionChildRow,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const admission = await measureRequestPhase('final_submit_admission', () => activateScaleAdmission(child))
  assertFrozenAdmission(child, admission, input)
  const snapshot = measureRequestPhaseSync('final_submit_definition_prepare', () => {
    const parsed = decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted as string)
    assertRuntimeAgainstAdmission(child, admission, parsed, input)
    return parsed
  })
  const answers = measureRequestPhaseSync('final_submit_payload_validation', () => normalizeAnswers(snapshot.definition, input.answers))
  const missing = missingRequiredScaleItemCodes(snapshot.definition, answers)
  if (missing.length > 0) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `还有 ${missing.length} 道必答题未作答`, 409)
  const canonical = measureRequestPhaseSync('final_submit_serialization', () => {
    const bytes = measureRequestPhaseSync('final_submit_payload_hash', () => canonicalJsonBytes({
      answers,
      ...(input.deviceInputProvenance ? { deviceInputProvenance: input.deviceInputProvenance } : {}),
    }))
    return { bytes: bytes.byteLength, hash: createHash('sha256').update(bytes).digest('hex') }
  })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.scale, '量表提交数据')
  const payloadHash = canonical.hash

  if (child.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(child, submissionId, payloadHash)
    if (replay === 'replay') {
      return {
        submissionId,
        payloadHash,
        replayed: true,
        assessment: scaleAssessmentForResponse(child),
        parent: null,
      }
    }
  }

  if (admission.schemaVersion === 2 && admission.scalePolicy?.deployment?.completionDeadline
    && Date.now() > Date.parse(admission.scalePolicy.deployment.completionDeadline)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '本轮测评已超过冻结完成期限，请重新开始', 409)
  }

  // The child row is already loaded by the final-submit admission path. Resolve
  // stored provenance and build the encrypted answer envelope before entering
  // the completion transaction; the transaction must only adjudicate and persist.
  const storedProvenance = readScaleAnswers(child.answers).deviceInputProvenance
  const persistedProvenance = input.deviceInputProvenance ?? storedProvenance
  const encryptedAnswers = encryptScaleAnswers(answers, persistedProvenance)

  const result = await measureRequestPhase('final_submit_scoring', () => buildResult(child, snapshot, answers, admission))
  const unitResult = snapshot.compiledRuntime.runtimeCapabilities.aggregateEligible
    && Boolean(child.questionnaireAssessmentId || child.compositeAttemptId)
    ? projectScaleCanonicalUnitResult({
        result,
        runtime: snapshot.compiledRuntime,
        contextHash: admission.contextSnapshotHash,
        referenceBindings: snapshot.referenceBindings,
      })
    : null
  const completedAt = new Date()
  const encrypted = await measureRequestPhase('final_submit_encryption', async () => ({
    result: encryptScaleResult(result),
    canonicalResult: unitResult
      ? encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope({
          core: unitResult,
          completedAt,
          persistenceProvenance: {
            sourceType: 'ASSESSMENT',
            sourceAttemptId: child.id,
            sourceSubmissionId: submissionId,
          },
          bundleBridge: buildScaleBundleBridge(result),
        }))
      : null,
  }))

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    const current = await tx.assessment.findUnique({
      where: { id: input.assessmentId },
      select: txAdmissionSelect,
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '量表测评')
    if (current.runtimeGeneration !== 'UNIFIED_V1' || current.compiledRuntimeHash !== snapshot.compiledRuntime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表运行时身份已变化，请重启后重试', 409)
    }
    if (current.frozenAdmissionSnapshotHash && current.frozenAdmissionSnapshotHash !== admission.snapshotHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表准入快照已变化，请重试', 409)
    }
    const replay = assertSubmissionReplay(current, submissionId, payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      return { replayed: true, current }
    }
    if (current.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评已结束', 409)
    const totalTime = Math.max(0, completedAt.getTime() - current.startedAt.getTime())
    const where: Record<string, unknown> = {
      id: input.assessmentId,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: input.attemptEpoch,
      submissionId: null,
    }
    if (current.questionnaireAssessmentId) {
      where.questionnaireAssessment = { is: { status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: input.attemptEpoch, runtimeGeneration: 'UNIFIED_V1' } }
    }
    if (current.compositeAttemptId) {
      where.compositeAttempt = { is: { status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: input.attemptEpoch, runtimeGeneration: 'UNIFIED_V1' } }
    }
    const updated = await tx.assessment.updateMany({
      where: where as any,
      data: {
        status: 'COMPLETED',
        answers: encryptedAnswers,
        result: encrypted.result,
        progress: 100,
        completedAt,
        totalTime,
        submissionId,
        submissionPayloadHash: payloadHash,
        submissionCompletedAt: completedAt,
      },
    })
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评状态已变化，请重试', 409)
    const slotKey = admission.parent?.slotKey
    if (encrypted.canonicalResult && current.questionnaireAssessmentId) {
      if (!slotKey) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        questionnaireAssessmentId: current.questionnaireAssessmentId,
        attemptEpoch: input.attemptEpoch,
        slotKey,
        unitType: 'SCALE',
        payloadKind: 'UNIT_RESULT',
        sourceType: 'ASSESSMENT',
        sourceAttemptId: current.id,
        sourceSubmissionId: submissionId,
        sourceDefinitionHash: snapshot.sourceDefinitionHash,
        compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        canonicalResultEncrypted: encrypted.canonicalResult,
        completedAt,
      })
    } else if (encrypted.canonicalResult && current.compositeAttemptId) {
      if (!slotKey) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        compositeAttemptId: current.compositeAttemptId,
        attemptEpoch: input.attemptEpoch,
        slotKey,
        unitType: 'SCALE',
        payloadKind: 'UNIT_RESULT',
        sourceType: 'ASSESSMENT',
        sourceAttemptId: current.id,
        sourceSubmissionId: submissionId,
        sourceDefinitionHash: snapshot.sourceDefinitionHash,
        compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        canonicalResultEncrypted: encrypted.canonicalResult,
        completedAt,
      })
    }
    return {
      replayed: false,
      current: {
        ...current,
        scale: child.scale,
        status: 'COMPLETED',
        answers,
        result,
        deviceInputProvenance: persistedProvenance,
        progress: 100,
        completedAt,
        totalTime,
        submissionId,
        submissionPayloadHash: payloadHash,
        submissionCompletedAt: completedAt,
      },
    }
  })
  return {
    submissionId,
    payloadHash,
    replayed: committed.replayed,
    assessment: scaleAssessmentForResponse({ ...committed.current, scale: child.scale }),
    parent: null,
  }
}
