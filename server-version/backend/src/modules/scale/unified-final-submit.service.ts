import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { readCompositeAttemptContext, readQuestionnaireAssessmentContext } from '../../services/assessmentContextService'
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
import { encryptScaleAnswers, encryptScaleResult, scaleAssessmentForResponse } from './scale-workflow.service'
import {
  decryptFrozenScaleRuntimeSnapshot,
  type FrozenScaleRuntimeSnapshotV1,
} from '../assessment-runtime/runtime-snapshot'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import {
  createCanonicalUnitResultEnvelope,
  projectScaleCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import { loadFrozenReferenceSets } from '../assessment-runtime/reference-binding'
import { getFrozenActiveSlot, questionnaireScaleSlotKey, compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { canonicalJsonBytes } from '../assessment-runtime/canonical'

export type UnifiedScaleFinalSubmitInput = {
  assessmentId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
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

export type UnifiedScaleAdmission = {
  id: string
  userId: string | null
  status: string
  deliveryMode: string
  runtimeGeneration: 'UNIFIED_V1' | null
  runtimeSnapshotEncrypted: string | null
  compiledRuntimeHash: string | null
  attemptEpoch: number
  startedAt: Date
  submissionId: string | null
  submissionPayloadHash: string | null
  questionnaireAssessmentId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  scale: {
    id: string
    code: string
    name: string
    instrumentVersion: string
  }
  questionnaireAssessment?: {
    id: string
    userId: string | null
    sessionId: string | null
    resumeTokenHash: string | null
    status: string
    deliveryMode: string
    attemptEpoch: number
    contextSnapshotEncrypted: string | null
    contextSnapshotHash: string | null
    frozenActiveSlotSetEncrypted: string | null
    frozenActiveSlotSetHash: string | null
    questionnaire: {
      questionnaireScales: Array<{ id: string; scaleId: string }>
      formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
    }
  } | null
  compositeAttempt?: {
    id: string
    userId: string | null
    recoveryTokenHash: string | null
    status: string
    deliveryMode: string
    attemptEpoch: number
    contextSnapshotEncrypted: string | null
    contextSnapshotHash: string | null
    frozenActiveSlotSetEncrypted: string | null
    frozenActiveSlotSetHash: string | null
    compositeAssessment: {
      formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
    }
  } | null
}

const hasContextSection = (parent: UnifiedScaleAdmission['questionnaireAssessment'] | UnifiedScaleAdmission['compositeAttempt']): boolean => Boolean(
  parent && ('questionnaire' in parent
    ? parent.questionnaire.formSections.some((section: { contextSection: boolean; items: Array<{ contextKey: string | null }> }) => (
        Boolean(section.contextSection) || section.items.some((item: { contextKey: string | null }) => Boolean(item.contextKey))
      ))
    : parent.compositeAssessment.formSections.some((section: { contextSection: boolean; items: Array<{ contextKey: string | null }> }) => (
        Boolean(section.contextSection) || section.items.some((item: { contextKey: string | null }) => Boolean(item.contextKey))
      ))),
)

const assertPrincipal = (assessment: UnifiedScaleAdmission, input: UnifiedScaleFinalSubmitInput): void => {
  if (input.userId && assessment.userId === input.userId) return
  if (input.questionnaireSessionId && assessment.questionnaireAssessment?.sessionId === input.questionnaireSessionId) {
    if (input.userId && assessment.questionnaireAssessment.userId === input.userId) return
    if (!input.userId && input.recoveryTokenHash && assessment.questionnaireAssessment.resumeTokenHash === input.recoveryTokenHash) return
  }
  if (input.compositeAttemptId && assessment.compositeAttemptId === input.compositeAttemptId) {
    if (!input.userId && input.recoveryTokenHash && assessment.compositeAttempt?.recoveryTokenHash === input.recoveryTokenHash) return
    if (input.userId && assessment.compositeAttempt?.userId === input.userId) return
  }
  throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此量表测评', 403)
}

const normalizeAnswers = (
  definition: FrozenScaleRuntimeSnapshotV1['definition'],
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

const contextFor = (assessment: UnifiedScaleAdmission) => {
  if (assessment.questionnaireAssessment) return readQuestionnaireAssessmentContext(assessment.questionnaireAssessment)
  if (assessment.compositeAttempt) return readCompositeAttemptContext(assessment.compositeAttempt)
  return { context: null, hash: null, decryptError: false }
}

const assertAdmission = (assessment: UnifiedScaleAdmission, input: UnifiedScaleFinalSubmitInput): void => {
  if (assessment.runtimeGeneration !== 'UNIFIED_V1' || !assessment.runtimeSnapshotEncrypted) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表运行时快照缺失，请重启后重新作答', 409)
  }
  assertPrincipal(assessment, input)
  assertFinalOnly(assessment.deliveryMode)
  assertAttemptEpoch(assessment.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(assessment.status, '量表测评')
  const parent = assessment.questionnaireAssessment ?? assessment.compositeAttempt
  if (parent) {
    assertFinalOnly(parent.deliveryMode)
    assertFinalSubmitStatus(parent.status, '上级测评')
    assertAttemptEpoch(parent.attemptEpoch, input.attemptEpoch)
    if (parent.status === 'COMPLETED' && assessment.status !== 'COMPLETED') {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评已结束，请重启后重新作答', 409)
    }
  }
  const contextHash = parent?.contextSnapshotHash ?? null
  if (hasContextSection(parent) && contextHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  if ((input.contextSnapshotHash ?? null) !== contextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文版本已变化，请重试', 409)
  }
  assertParentSlotBinding(assessment)
}

const slotKeyFor = (assessment: UnifiedScaleAdmission): string | null => {
  if (assessment.questionnaireAssessmentId) {
    const binding = assessment.questionnaireAssessment?.questionnaire.questionnaireScales.find((item) => item.scaleId === assessment.scale.id)
    return binding ? questionnaireScaleSlotKey(binding.id) : null
  }
  if (assessment.compositeAttemptId && assessment.compositeItemId) return compositeItemSlotKey(assessment.compositeItemId, 'SCALE')
  return null
}

const assertParentSlotBinding = (assessment: UnifiedScaleAdmission): ReturnType<typeof getFrozenActiveSlot> | null => {
  const parent = assessment.questionnaireAssessment ?? assessment.compositeAttempt
  if (!parent) return null
  const slotKey = slotKeyFor(assessment)
  if (!slotKey) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
  let slot
  try {
    slot = getFrozenActiveSlot({
      encrypted: parent.frozenActiveSlotSetEncrypted,
      storedHash: parent.frozenActiveSlotSetHash,
      attemptEpoch: assessment.attemptEpoch,
      slotKey,
    })
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'DEFINITION_MISMATCH',
      error instanceof Error ? error.message : '量表冻结单元不可用',
      409,
    )
  }
  if (
    slot.unitType !== 'SCALE'
    || !slot.required
    || slot.sourceDefinitionIdentity.key !== assessment.scale.code
    || slot.sourceDefinitionIdentity.version !== assessment.scale.instrumentVersion
  ) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元身份不匹配', 409)
  }
  return slot
}

const buildResult = async (
  assessment: UnifiedScaleAdmission,
  snapshot: FrozenScaleRuntimeSnapshotV1,
  answers: ScaleAnswer[],
  context: ReturnType<typeof contextFor>,
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
    scaleId: assessment.scale.id,
    instrumentKey: assessment.scale.code,
    name: assessment.scale.name,
    instrumentVersion: assessment.scale.instrumentVersion,
    definition: snapshot.definition,
    answers,
    referenceSets: references,
    participantContext: context.context?.values,
    participantContextHash: context.hash,
  })
}

export const submitUnifiedScaleAssessmentFinal = async (
  input: UnifiedScaleFinalSubmitInput,
  admission: UnifiedScaleAdmission,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  assertAdmission(admission, input)
  const snapshot = measureRequestPhaseSync('final_submit_definition_prepare', () => {
    const parsed = decryptFrozenScaleRuntimeSnapshot(admission.runtimeSnapshotEncrypted as string)
    if (parsed.instrumentKey !== admission.scale.code || parsed.instrumentVersion !== admission.scale.instrumentVersion) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结的量表运行时身份不匹配', 409)
    }
    if (admission.compiledRuntimeHash !== parsed.compiledRuntime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '冻结的量表编译运行时不匹配', 409)
    }
    const slot = assertParentSlotBinding(admission)
    const slotCompiledRuntimeHash = slot?.sourceBinding.compiledRuntimeHash
    if (
      slot
      && (
        slot.sourceDefinitionIdentity.hash !== parsed.sourceDefinitionHash
        || (slotCompiledRuntimeHash !== undefined && slotCompiledRuntimeHash !== parsed.compiledRuntime.compiledRuntimeHash)
      )
    ) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元运行时不匹配', 409)
    }
    assertDefinitionHash(parsed.legacyDefinitionHash, input.definitionHash)
    return parsed
  })
  const answers = measureRequestPhaseSync('final_submit_payload_validation', () => normalizeAnswers(snapshot.definition, input.answers))
  const missing = missingRequiredScaleItemCodes(snapshot.definition, answers)
  if (missing.length > 0) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `还有 ${missing.length} 道必答题未作答`, 409)
  const canonical = measureRequestPhaseSync('final_submit_serialization', () => {
    const bytes = measureRequestPhaseSync('final_submit_payload_hash', () => canonicalJsonBytes({ answers }))
    return { bytes: bytes.byteLength, hash: createHash('sha256').update(bytes).digest('hex') }
  })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.scale, '量表提交数据')
  const payloadHash = canonical.hash

  if (admission.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(admission, submissionId, payloadHash)
    if (replay === 'replay') {
      return {
        submissionId,
        payloadHash,
        replayed: true,
        assessment: scaleAssessmentForResponse(admission),
        parent: null,
      }
    }
  }

  const context = measureRequestPhaseSync('final_submit_context_read', () => contextFor(admission))
  if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
  const result = await measureRequestPhase('final_submit_scoring', () => buildResult(admission, snapshot, answers, context))
  const unitResult = snapshot.compiledRuntime.runtimeCapabilities.aggregateEligible
    && Boolean(admission.questionnaireAssessmentId || admission.compositeAttemptId)
    ? projectScaleCanonicalUnitResult({
        result,
        runtime: snapshot.compiledRuntime,
        contextHash: context.hash,
        referenceBindings: snapshot.referenceBindings,
      })
    : null
  const completedAt = new Date()
  const encrypted = await measureRequestPhase('final_submit_encryption', async () => ({
    answers: encryptScaleAnswers(answers),
    result: encryptScaleResult(result),
    canonicalResult: unitResult
      ? encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope({
          core: unitResult,
          completedAt,
          persistenceProvenance: {
            sourceType: 'ASSESSMENT',
            sourceAttemptId: admission.id,
            sourceSubmissionId: submissionId,
          },
        }))
      : null,
  }))

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    const current = await tx.assessment.findUnique({
      where: { id: input.assessmentId },
      include: { scale: { select: { id: true, code: true, name: true, instrumentVersion: true } } },
    })
    if (!current) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
    assertFinalOnly(current.deliveryMode)
    assertAttemptEpoch(current.attemptEpoch, input.attemptEpoch)
    assertFinalSubmitStatus(current.status, '量表测评')
    if (current.runtimeGeneration !== 'UNIFIED_V1' || current.compiledRuntimeHash !== snapshot.compiledRuntime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表运行时身份已变化，请重启后重试', 409)
    }
    const replay = assertSubmissionReplay(current, submissionId, payloadHash)
    if (replay === 'replay' && current.status === 'COMPLETED') {
      return { replayed: true, assessment: scaleAssessmentForResponse(current), parent: null }
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
      where.questionnaireAssessment = { is: { status: 'IN_PROGRESS', attemptEpoch: input.attemptEpoch, runtimeGeneration: 'UNIFIED_V1' } }
    }
    if (current.compositeAttemptId) {
      where.compositeAttempt = { is: { status: 'IN_PROGRESS', attemptEpoch: input.attemptEpoch, runtimeGeneration: 'UNIFIED_V1' } }
    }
    const updated = await tx.assessment.updateMany({
      where: where as any,
      data: {
        status: 'COMPLETED',
        answers: encrypted.answers,
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
    if (encrypted.canonicalResult && current.questionnaireAssessmentId) {
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        questionnaireAssessmentId: current.questionnaireAssessmentId,
        attemptEpoch: input.attemptEpoch,
        slotKey: slotKeyFor(admission) as string,
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
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        compositeAttemptId: current.compositeAttemptId,
        attemptEpoch: input.attemptEpoch,
        slotKey: slotKeyFor(admission) as string,
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
      assessment: scaleAssessmentForResponse({
        ...current,
        status: 'COMPLETED',
        answers,
        result,
        progress: 100,
        completedAt,
        totalTime,
        submissionId,
        submissionPayloadHash: payloadHash,
        submissionCompletedAt: completedAt,
      }),
      parent: null,
    }
  })
  const parent = admission.questionnaireAssessmentId
    ? await measureRequestPhase('final_submit_parent_finalization', async () => {
        const { finalizeQuestionnaireAttemptIfReady } = await import('../../services/questionnaire-form-section.service')
        return finalizeQuestionnaireAttemptIfReady(admission.questionnaireAssessmentId as string)
      })
    : admission.compositeAttemptId
      ? await measureRequestPhase('final_submit_parent_finalization', async () => {
          const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
          return finalizeCompositeAttemptIfReady(admission.compositeAttemptId as string)
        })
      : null
  return { submissionId, payloadHash, ...committed, parent }
}
