import {assertCurrentStudyPrincipal,type AcceptedStudyReceipt} from '../anonymous-study/admission-principal'
import { lockTrainingFlowFinalAdmission, requiresTrainingFlowFinalLock } from '../composite/training-variant-child-scope'
import {normalizeTrainingScaleTiming} from '../assessment-runtime/training-scale-timing'
import { rethrowScaleSubmissionIdConflict, rethrowConfirmedScaleBatchSubmissionConflict } from './scale-final-submit-conflict'
import { loadScaleAnswers } from './scale-workflow.service'
import { compactAssessmentStorageEnabled } from '../assessment-runtime/compact-field-codec'
import { prepareCompactScaleFacts } from '../assessment-runtime/compact-scale-facts'
import { makeCanonicalFactsReference } from '../assessment-runtime/compact-assessment-storage'
import { makeScaleFactsReference, makeScaleRawReference, persistScaleFactRecords, attachCommittedScaleFacts, type ScaleFactRecord } from '../assessment-runtime/scale-fact-records'
import { ReportProcessingLeaseLostError } from '../assessment-runtime/report-outbox.service'
import { assertTrainingScaleCollectionAllowed } from './scale-collection-guard'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import type { WholeReceiptExecution } from '../composite/whole-questionnaire.service'
import { createHash } from 'node:crypto'
import { Prisma, type CompositeReportJob } from '@prisma/client'
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
import { missingRequiredScaleItemCodes, validateScaleAnswers, type ScaleAnswer } from './scale-scoring'
import { buildScaleResult, type ScaleResultV2 } from './scale-result'
import { encryptScaleAnswers, encryptScaleResult, readScaleAnswers, loadScaleAssessmentForResponse } from './scale-workflow.service'
import {
  type VersionedFrozenScaleRuntimeSnapshot,
} from '../assessment-runtime/runtime-snapshot'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import {
  createCanonicalUnitResultEnvelope,
  projectScaleCanonicalUnitResult,
} from '../assessment-runtime/unit-result'
import { insertCompletedUnitSnapshot } from '../assessment-runtime/persistence'
import { loadFrozenReferenceSets, type FrozenReferenceDb } from '../assessment-runtime/reference-binding'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { canonicalJsonBytes, canonicalHash } from '../assessment-runtime/canonical'
import type { VersionedFrozenUnitAdmission } from '../assessment-runtime/admission-snapshot-v2'
import { buildScaleBundleBridge } from '../assessment-bundle/sources'
import type { DeviceInputProvenanceV1 } from './device-input-provenance'
import {
  activateScaleAdmission,
  loadScaleAdmissionRuntime,
  assertAdmissionParentBinding,
  type ScaleAdmissionChildRow,
} from './scale-admission.service'

export type UnifiedScaleFinalSubmitInput = {
  assessmentId: string
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string | null
  itemTimings?: Record<string,unknown>
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

const assertPrincipal = async (child: ScaleAdmissionChildRow, admission: VersionedFrozenUnitAdmission, input: UnifiedScaleFinalSubmitInput, receipt?:AcceptedStudyReceipt): Promise<void> => {
  if(await assertCurrentStudyPrincipal(prisma,{attemptId:child.compositeAttemptId,userId:input.userId,recoveryTokenHash:input.recoveryTokenHash,
    attemptEpoch:input.attemptEpoch,frozenHash:admission.principal.recoveryTokenHash,receipt,unit:input}))return
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
    byItem.set(answer.itemCode, normalized)
  }
  try {
    validateScaleAnswers(definition, [...byItem.values()])
  } catch (error) {
    if (error instanceof Error) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', error.message, 400)
    throw error
  }
  return definition.items.flatMap((item) => {
    const answer = byItem.get(item.itemCode)
    return answer ? [answer] : []
  })
}

const assertFrozenAdmission = async (
  child: ScaleAdmissionChildRow,
  admission: VersionedFrozenUnitAdmission,
  input: UnifiedScaleFinalSubmitInput, receipt?:AcceptedStudyReceipt,
): Promise<void> => {
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
  await assertPrincipal(child, admission, input, receipt)
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
  admission: VersionedFrozenUnitAdmission, referenceDb: FrozenReferenceDb = prisma as any,
): Promise<ScaleResultV2> => {
  let references: Awaited<ReturnType<typeof loadFrozenReferenceSets>> = []
  if (snapshot.referenceBindings.length > 0) {
    references = await measureRequestPhase('final_submit_db_query', () => loadFrozenReferenceSets(referenceDb, {
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
  runtimeSnapshotEncrypted: true,
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

export const assertUnifiedScaleDelivery = async (input: UnifiedScaleFinalSubmitInput, child: ScaleAdmissionChildRow, admission: VersionedFrozenUnitAdmission, snapshot: VersionedFrozenScaleRuntimeSnapshot): Promise<void> => {
  await assertFrozenAdmission(child, admission, input)
  assertRuntimeAgainstAdmission(child, admission, snapshot, input)
}

export const prepareUnifiedScaleFinalSubmission = async (
  input: UnifiedScaleFinalSubmitInput, child: ScaleAdmissionChildRow, referenceTimeMs = Date.now(), receipt?:AcceptedStudyReceipt,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const admission = await measureRequestPhase('final_submit_admission', () => activateScaleAdmission(child, undefined, referenceTimeMs))
  await assertFrozenAdmission(child, admission, input, receipt)
  const snapshot = (await measureRequestPhase('final_submit_definition_prepare', async () => {
    const parsed = (await loadScaleAdmissionRuntime(child))
    assertRuntimeAgainstAdmission(child, admission, parsed, input)
    return parsed
  }))
  const answers = measureRequestPhaseSync('final_submit_payload_validation', () => normalizeAnswers(snapshot.definition, input.answers))
  const missing = missingRequiredScaleItemCodes(snapshot.definition, answers)
  if (missing.length > 0) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', `还有 ${missing.length} 道必答题未作答`, 409)
  const timing=normalizeTrainingScaleTiming(admission.trainingTiming,snapshot.definition.items.map(item=>item.itemCode),answers.map(answer=>answer.itemCode),input.itemTimings)
  const canonical = measureRequestPhaseSync('final_submit_serialization', () => {
    const bytes = measureRequestPhaseSync('final_submit_payload_hash', () => canonicalJsonBytes({
      answers,
      ...(timing ? {trainingTiming:timing} : {}),
      ...(input.deviceInputProvenance ? { deviceInputProvenance: input.deviceInputProvenance } : {}),
    }))
    return { bytes: bytes.byteLength, hash: createHash('sha256').update(bytes).digest('hex') }
  })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.scale, '量表提交数据')
  const payloadHash = canonical.hash

  if (child.status !== 'COMPLETED' && admission.schemaVersion === 2 && admission.scalePolicy?.deployment?.completionDeadline
    && referenceTimeMs > Date.parse(admission.scalePolicy.deployment.completionDeadline)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '本轮测评已超过冻结完成期限，请重新开始', 409)
  }
  return { submissionId, admission, snapshot, answers, payloadHash, timing }
}

type PreparedScaleSubmission = Awaited<ReturnType<typeof prepareUnifiedScaleFinalSubmission>>
const prepareUnifiedScaleWrite = async (
  input: UnifiedScaleFinalSubmitInput, child: ScaleAdmissionChildRow, prepared: PreparedScaleSubmission,
  wholeReceipt?: WholeReceiptExecution, referenceDb?: FrozenReferenceDb,
) => {
  const { submissionId, admission, snapshot, answers } = prepared
  // The child row is already loaded by the final-submit admission path. Resolve
  // stored provenance and build the encrypted answer envelope before entering
  // the completion transaction; the transaction must only adjudicate and persist.
  const storedProvenance = (await loadScaleAnswers(child.answers, child)).deviceInputProvenance
  const persistedProvenance = input.deviceInputProvenance ?? storedProvenance
  const compact = compactAssessmentStorageEnabled()
  const wholeRawParent = compact && wholeReceipt ? child.compositeAttemptId : null
  const inlineRaw = wholeRawParent ? null : encryptScaleAnswers(answers, persistedProvenance)
  const encryptedAnswers = compact ? makeScaleRawReference(input.attemptEpoch) : inlineRaw!

  const result = await measureRequestPhase('final_submit_scoring', () => buildResult(child, snapshot, answers, admission, referenceDb))
  const unitResult = snapshot.compiledRuntime.runtimeCapabilities.aggregateEligible
    && Boolean(child.questionnaireAssessmentId || child.compositeAttemptId)
    ? projectScaleCanonicalUnitResult({
        result,
        runtime: snapshot.compiledRuntime,
        contextHash: admission.contextSnapshotHash,
        participantContext:admission.contextValues??undefined,
        referenceBindings: snapshot.referenceBindings,
      })
    : null
  // Accepted whole answers were complete at receipt time, not at queue drain.
  const completedAt = new Date(wholeReceipt?.acceptedAtMs ?? Date.now())
  const envelope = unitResult ? createCanonicalUnitResultEnvelope({ core: unitResult, completedAt,
    persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: child.id, sourceSubmissionId: submissionId },
    bundleBridge: buildScaleBundleBridge(result) }) : null
  const binding = { assessmentId: child.id, attemptEpoch: input.attemptEpoch, submissionId, payloadHash: prepared.payloadHash }
  let compactFact: ScaleFactRecord | null = null
  const encrypted = await measureRequestPhase('final_submit_encryption', async () => {
    if (compact) {
      const stored = await prepareCompactScaleFacts({ result, itemOrder: snapshot.definition.items.map(item => item.itemCode), binding, canonical: envelope })
      compactFact = { id: child.id, attemptEpoch: input.attemptEpoch, submissionId, submissionPayloadHash: prepared.payloadHash,
        sourceResultHash: envelope?.bundleBridge?.sourceResultHash ?? canonicalHash(result), canonicalResultHash: envelope?.resultHash ?? null,
        factsEncrypted: stored, rawAnswersEncrypted: inlineRaw, rawReceiptAttemptId: wholeRawParent ?? null, completedAt, totalTime: 0 }
      return { result: makeScaleFactsReference(input.attemptEpoch), canonicalResult: envelope ? makeCanonicalFactsReference(binding, envelope.resultHash) : null }
    }
    return { result: encryptScaleResult(result), canonicalResult: envelope ? encryptUnifiedRuntimePayload(envelope) : null }
  })

  const timingEncrypted=prepared.timing ? encryptUnifiedRuntimePayload(prepared.timing) : null
  return { timingEncrypted, result, canonical: envelope, compactFact: compactFact as ScaleFactRecord | null, persistedProvenance, encryptedAnswers, encrypted, completedAt }
}

export const submitUnifiedScaleAssessmentFinal = async (
  input: UnifiedScaleFinalSubmitInput, child: ScaleAdmissionChildRow, wholeReceipt?: WholeReceiptExecution, referenceDb?: FrozenReferenceDb,
  receiptOnly = false,
) => {
  const { submissionId, admission, snapshot, answers, payloadHash, timing } = await prepareUnifiedScaleFinalSubmission(input, child, wholeReceipt?.acceptedAtMs, wholeReceipt?.studyReceipt)
  const responseRuntime = { assessmentId: child.id, attemptEpoch: child.attemptEpoch,
    compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
    encrypted: child.runtimeSnapshotEncrypted, runtime: snapshot }

  if (child.status === 'COMPLETED') {
    const replay = assertSubmissionReplay(child, submissionId, payloadHash)
    if (replay === 'replay') {
      if (requiresTrainingFlowFinalLock(child.compositeAttemptId, child.compositeAttempt) || await assertCurrentStudyPrincipal(prisma,{attemptId:child.compositeAttemptId,userId:input.userId,recoveryTokenHash:input.recoveryTokenHash,attemptEpoch:input.attemptEpoch,frozenHash:admission.principal.recoveryTokenHash,receipt:wholeReceipt?.studyReceipt,unit:input})) {
        await withFinalOnlyCompletionTransaction(async tx => {
          await assertCurrentStudyPrincipal(tx,{attemptId:child.compositeAttemptId,userId:input.userId,recoveryTokenHash:input.recoveryTokenHash,attemptEpoch:input.attemptEpoch,frozenHash:admission.principal.recoveryTokenHash,receipt:wholeReceipt?.studyReceipt,unit:input},true)
          const assertFlowFinal = await lockTrainingFlowFinalAdmission(tx, { attemptId: child.compositeAttemptId, parent: child.compositeAttempt, attemptEpoch: input.attemptEpoch, itemId: child.compositeItemId, sourceAttemptId: child.id, submissionId })
          assertFlowFinal(true)
        })
      }
      return {
        submissionId,
        payloadHash,
        replayed: true,
        assessment: wholeReceipt || receiptOnly ? null : await loadScaleAssessmentForResponse(child, {}, undefined, responseRuntime),
        parent: null,
      }
    }
  }

  const { timingEncrypted, result, compactFact, persistedProvenance, encryptedAnswers, encrypted, completedAt } = await prepareUnifiedScaleWrite(
    input, child, { submissionId, admission, snapshot, answers, payloadHash, timing }, wholeReceipt, referenceDb)

  const committed = await withFinalOnlyCompletionTransaction(async (tx) => {
    if(child.compositeAttempt?.compositeAssessment?.creationKey?.startsWith('education-composition:')){
      // Only this new education lane needs the Run continuation fence here.
      // Acquire org -> Run -> execution before the native child UPDATE lock;
      // old Survey/Training finals do not gain an extra source/authority query.
      const {assertPrivateFormFinalCurrent}=await import('../assessment-run/educationPrivateFormExecution')
      await assertPrivateFormFinalCurrent(tx,{attemptId:child.compositeAttemptId!,actorUserId:input.userId})
    }
    await assertCurrentStudyPrincipal(tx,{attemptId:child.compositeAttemptId,userId:input.userId,recoveryTokenHash:input.recoveryTokenHash,attemptEpoch:input.attemptEpoch,frozenHash:admission.principal.recoveryTokenHash,receipt:wholeReceipt?.studyReceipt,unit:input},true)
    const assertFlowFinal = await lockTrainingFlowFinalAdmission(tx, { attemptId: child.compositeAttemptId, parent: child.compositeAttempt, attemptEpoch: input.attemptEpoch, itemId: child.compositeItemId, sourceAttemptId: child.id, submissionId })
    const current = await tx.assessment.findUnique({
      where: { id: input.assessmentId },
      select: { ...txAdmissionSelect, runtimeSnapshotEncrypted: !(wholeReceipt || receiptOnly) },
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
      assertFlowFinal(true)
      return { replayed: true, current }
    }
    if (current.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评已结束', 409)
    // Current epoch and frozen runtime/admission are locked and checked above.
    // Existing standalone FINAL keeps emergency collection policy, not new-entry policy.
    if(child.compositeAttemptId){
      await assertTrainingScaleCollectionAllowed(tx, [child.scaleId],{compositeAttemptId:child.compositeAttemptId,compositeAttemptEpoch:input.attemptEpoch,compositeItemIds:child.compositeItemId?[child.compositeItemId]:[],acceptedReceipt:wholeReceipt})
    }else await assertScaleLibraryCollectionAllowed(tx,[],[child.scaleId])
    assertFlowFinal(false)
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
    if (compactFact) await persistScaleFactRecords(tx, [{ ...compactFact, totalTime }])
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
        ...(timingEncrypted ? { timingEncrypted } : {}),
      },
    }).catch(rethrowScaleSubmissionIdConflict)
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评状态已变化，请重试', 409)
    const slotKey = admission.parent?.slotKey
    if (encrypted.canonicalResult && current.questionnaireAssessmentId) {
      if (!slotKey) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
      await insertCompletedUnitSnapshot(tx as Prisma.TransactionClient, {
        wholeReceipt,
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
        wholeReceipt,
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
        ...(timingEncrypted ? { timingEncrypted } : {}),
      },
    }
  })
  return {
    submissionId,
    payloadHash,
    replayed: committed.replayed,
    assessment: wholeReceipt || receiptOnly ? null : await loadScaleAssessmentForResponse({ ...committed.current, scale: child.scale }, {}, undefined, responseRuntime),
    parent: null,
  }
}

/** All scoring/encryption is outside a short, any-size collection transaction.
 * Ordered child locks precede the job/parent lock, matching the old path.
 * An old partial receipt is replayed, never rescored or overwritten.
 */
export const submitUnifiedScaleCollectionBatch = async (
  job: CompositeReportJob,
  units: Array<{ input: UnifiedScaleFinalSubmitInput; child: ScaleAdmissionChildRow }>,
  execution: WholeReceiptExecution, referenceDb: FrozenReferenceDb,
) => {
  if (!units.length || new Set(units.map(unit => unit.child.id)).size !== units.length)
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表单元缺失或重复', 409)
  const prepared: Array<{
    input: UnifiedScaleFinalSubmitInput; child: ScaleAdmissionChildRow;
    data: Awaited<ReturnType<typeof prepareUnifiedScaleFinalSubmission>>;
    write: Awaited<ReturnType<typeof prepareUnifiedScaleWrite>> | null;
  }> = []
  for (const { input, child } of units) {
    const data = await prepareUnifiedScaleFinalSubmission(input, child, execution.acceptedAtMs, execution.studyReceipt)
    if (child.compositeAttemptId !== job.attemptId || input.compositeAttemptId !== job.attemptId
      || child.questionnaireAssessmentId || input.assessmentId !== child.id || !data.admission.parent?.slotKey
      || !data.snapshot.compiledRuntime.runtimeCapabilities.aggregateEligible)
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表与冻结问卷绑定不匹配', 409)
    const replay = assertSubmissionReplay(child, data.submissionId, data.payloadHash)
    prepared.push({ input, child, data, write: replay === 'replay' && child.status === 'COMPLETED'
      ? null : await prepareUnifiedScaleWrite(input, child, data, execution, referenceDb) })
  }
  return withFinalOnlyCompletionTransaction(async tx => {
    // New study admissions always lock parent -> accepted job -> child. The
    // historical batch lock order remains untouched for unbound protocols.
    for(const unit of prepared)await assertCurrentStudyPrincipal(tx,{attemptId:unit.child.compositeAttemptId,userId:unit.input.userId,
      recoveryTokenHash:unit.input.recoveryTokenHash,attemptEpoch:unit.input.attemptEpoch,
      frozenHash:unit.data.admission.principal.recoveryTokenHash,receipt:execution.studyReceipt,unit:unit.input},true)
    const rows = await tx.$queryRaw<Array<{
      id: string; status: string; deliveryMode: string; runtimeGeneration: string | null; attemptEpoch: number;
      compiledRuntimeHash: string | null; frozenAdmissionSnapshotHash: string | null;
      submissionId: string | null; submissionPayloadHash: string | null; startedAt: Date; compositeItemId: string | null;
      snapshotId: string | null; snapshotSlot: string | null; snapshotSubmission: string | null;
      snapshotDefinition: string | null; snapshotRuntime: string | null; snapshotPayload: string | null;
      snapshotUnitType: string | null; snapshotState: string | null; snapshotKind: string | null; snapshotSourceType: string | null;
    }>>`
      SELECT child."id", child."status", child."delivery_mode" AS "deliveryMode",
        child."runtime_generation" AS "runtimeGeneration", child."attempt_epoch" AS "attemptEpoch",
        child."compiled_runtime_hash" AS "compiledRuntimeHash",
        child."frozen_admission_snapshot_hash" AS "frozenAdmissionSnapshotHash",
        child."submission_id" AS "submissionId", child."submission_payload_hash" AS "submissionPayloadHash",
        child."started_at" AS "startedAt", child."composite_item_id" AS "compositeItemId",
        snap."id" AS "snapshotId", snap."slot_key" AS "snapshotSlot",
        snap."source_submission_id" AS "snapshotSubmission", snap."source_definition_hash" AS "snapshotDefinition",
        snap."compiled_runtime_hash" AS "snapshotRuntime", snap."canonical_result_encrypted" AS "snapshotPayload",
        snap."unit_type" AS "snapshotUnitType", snap."terminal_state" AS "snapshotState",
        snap."payload_kind" AS "snapshotKind", snap."source_type" AS "snapshotSourceType"
      FROM "assessments" child
      LEFT JOIN "assessment_unit_snapshots" snap ON snap."composite_attempt_id" = child."composite_attempt_id"
        AND snap."attempt_epoch" = child."attempt_epoch" AND snap."source_attempt_id" = child."id"
      WHERE child."id" IN (${Prisma.join(prepared.map(unit => unit.child.id))})
        AND child."composite_attempt_id" = ${job.attemptId} AND child."attempt_epoch" = ${job.attemptEpoch}
      ORDER BY child."id" FOR UPDATE OF child
    `
    if (rows.length !== prepared.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表记录已变化', 409)
    // A completed parent may rebuild a report only from already committed,
    // identity-checked unit receipts. New writes still require IN_PROGRESS.
    const completedReplay = prepared.every(unit => unit.write === null)
    const lease = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT job."id" FROM "composite_report_jobs" job
      JOIN "composite_assessment_attempts" parent ON parent."id" = job."attempt_id"
      WHERE job."id" = ${job.id} AND job."attempt_id" = ${job.attemptId} AND job."attempt_epoch" = ${job.attemptEpoch}
        AND job."slot_set_hash" = ${job.slotSetHash} AND job."context_hash" IS NOT DISTINCT FROM ${job.contextHash}
        AND parent."attempt_epoch" = job."attempt_epoch"
        AND (parent."status" = 'IN_PROGRESS' OR (${completedReplay} AND parent."status" = 'COMPLETED'))
        AND parent."delivery_mode" = 'FINAL_ONLY' AND parent."runtime_generation" = 'UNIFIED_V1'
        AND parent."async_report_epoch" = parent."attempt_epoch"
        AND parent."frozen_active_slot_set_hash" = job."slot_set_hash"
        AND parent."context_snapshot_hash" IS NOT DISTINCT FROM job."context_hash"
        AND job."whole_submission_id" = ${execution.submissionId} AND job."whole_payload_hash" = ${job.wholePayloadHash}
        AND job."whole_accepted_at" = ${new Date(execution.acceptedAtMs)}
        AND job."status" = 'PROCESSING' AND job."whole_answers_encrypted" IS NOT NULL AND job."lease_token" = ${execution.leaseToken}
        AND job."lease_expires_at" > (clock_timestamp() AT TIME ZONE 'UTC')
      FOR UPDATE OF job, parent
    `
    if (lease.length !== 1) throw new ReportProcessingLeaseLostError()
    const byId = new Map(rows.map(row => [row.id, row]))
    const writes = [], facts: ScaleFactRecord[] = [], snapshots: Prisma.AssessmentUnitSnapshotCreateManyInput[] = []
    for (const unit of prepared) {
      const current = byId.get(unit.child.id)!, { admission, snapshot, submissionId, payloadHash } = unit.data
      assertFinalOnly(current.deliveryMode); assertAttemptEpoch(current.attemptEpoch, unit.input.attemptEpoch)
      assertFinalSubmitStatus(current.status, '量表测评')
      if (current.runtimeGeneration !== 'UNIFIED_V1' || current.compiledRuntimeHash !== snapshot.compiledRuntime.compiledRuntimeHash
        || current.frozenAdmissionSnapshotHash !== admission.snapshotHash || current.compositeItemId !== unit.child.compositeItemId)
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表冻结身份已变化', 409)
      if (assertSubmissionReplay(current, submissionId, payloadHash) === 'replay' && current.status === 'COMPLETED') {
        if (!current.snapshotId || current.snapshotSlot !== admission.parent!.slotKey
          || current.snapshotSubmission !== submissionId || current.snapshotDefinition !== snapshot.sourceDefinitionHash
          || current.snapshotRuntime !== snapshot.compiledRuntime.compiledRuntimeHash || !current.snapshotPayload
          || current.snapshotUnitType !== 'SCALE' || current.snapshotState !== 'COMPLETED'
          || current.snapshotKind !== 'UNIT_RESULT' || current.snapshotSourceType !== 'ASSESSMENT')
          throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '已完成单元与权威快照不匹配', 409)
        continue
      }
      if (current.status !== 'IN_PROGRESS' || !unit.write || current.snapshotId)
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表提交状态已变化', 409)
      await assertTrainingScaleCollectionAllowed(tx, [unit.child.scaleId],{compositeAttemptId:unit.child.compositeAttemptId,compositeAttemptEpoch:unit.input.attemptEpoch,compositeItemIds:unit.child.compositeItemId?[unit.child.compositeItemId]:[],acceptedReceipt:execution})
      const { completedAt, encryptedAnswers, encrypted } = unit.write
      if (!encrypted.canonicalResult) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表缺少权威结果', 409)
      const totalTime = Math.max(0, completedAt.getTime() - current.startedAt.getTime())
      writes.push({ id: current.id, submissionId, payloadHash, answers: encryptedAnswers, result: encrypted.result,
        completedAt: completedAt.toISOString(), totalTime, timingEncrypted:unit.write.timingEncrypted })
      if (unit.write.compactFact) facts.push({ ...unit.write.compactFact, totalTime })
      snapshots.push({ compositeAttemptId: job.attemptId, attemptEpoch: job.attemptEpoch, slotKey: admission.parent!.slotKey,
        unitType: 'SCALE', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', sourceType: 'ASSESSMENT',
        sourceAttemptId: current.id, sourceSubmissionId: submissionId, sourceDefinitionHash: snapshot.sourceDefinitionHash,
        compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        canonicalResultEncrypted: encrypted.canonicalResult, completedAt })
    }
    if (writes.length) {
      await persistScaleFactRecords(tx, facts)
      const changed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "assessments" child SET "status" = 'COMPLETED', "answers" = source."answers", "result" = source."result",
          "progress" = 100, "completed_at" = source."completedAt", "total_time" = source."totalTime",
          "submission_id" = source."submissionId", "submission_payload_hash" = source."payloadHash",
          "submission_completed_at" = source."completedAt", "timing_encrypted" = source."timingEncrypted"
        FROM jsonb_to_recordset(${JSON.stringify(writes)}::jsonb) AS source(
          "id" text, "answers" jsonb, "result" jsonb, "completedAt" timestamp,
          "totalTime" integer, "submissionId" text, "payloadHash" text, "timingEncrypted" text)
        WHERE child."id" = source."id" AND child."composite_attempt_id" = ${job.attemptId}
          AND child."attempt_epoch" = ${job.attemptEpoch} AND child."status" = 'IN_PROGRESS'
          AND child."submission_id" IS NULL AND child."delivery_mode" = 'FINAL_ONLY' AND child."runtime_generation" = 'UNIFIED_V1'
        RETURNING child."id"
      `
      if (changed.length !== writes.length || new Set(changed.map(row => row.id)).size !== writes.length)
        throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表更新行数不匹配', 409)
      const inserted = await tx.assessmentUnitSnapshot.createMany({ data: snapshots })
      if (inserted.count !== snapshots.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '批量量表快照行数不匹配', 409)
    }
    const fenced = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "composite_report_jobs" WHERE "id" = ${job.id}
        AND "status" = 'PROCESSING' AND "lease_token" = ${execution.leaseToken}
        AND "lease_expires_at" > (clock_timestamp() AT TIME ZONE 'UTC')
    `
    if (fenced.length !== 1) throw new ReportProcessingLeaseLostError()
    // This value escapes only after COMMIT succeeds. Partial/replayed work
    // deliberately uses the durable reconstruction path, never a fresh score.
    if (writes.length !== prepared.length || prepared.some(unit => !unit.write)) return null
    const byWriteId = new Map(writes.map(row => [row.id, row]))
    const byFactId = new Map(facts.map(row => [row.id, row]))
    return prepared.map(({ child, write }) => {
      const saved = byWriteId.get(child.id)!
      const record = { ...child, status: 'COMPLETED' as const, answers: saved.answers, result: saved.result,
        progress: 100, completedAt: write!.completedAt, totalTime: saved.totalTime,
        submissionId: saved.submissionId, submissionPayloadHash: saved.payloadHash, submissionCompletedAt: write!.completedAt }
      const fact = byFactId.get(child.id)
      return fact ? attachCommittedScaleFacts(record, { row: fact, result: write!.result, canonical: write!.canonical }) : record
    })
  }).catch(error => rethrowConfirmedScaleBatchSubmissionConflict(error,
    prepared.map(unit => unit.data.submissionId), prepared.map(unit => unit.child.id), prisma))
}
