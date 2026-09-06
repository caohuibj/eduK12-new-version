import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  buildAssessmentContext,
  hashAssessmentContext,
  type ContextFormAnswer,
  type ContextFormItem,
} from '../assessment-context'
import { encryptAssessmentContext } from '../assessment-context/security'
import {
  assertAttemptEpoch,
  assertCanonicalSubmissionPayloadSize,
  assertDefinitionHash,
  assertSubmissionReplay,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import { persistExistingFormAnswerBatch, type BulkFormAnswerMutation } from '../../services/questionnaire-form-answer-batch'
import {
  normalizeQuestionnaireSectionAnswers,
  type SectionRow,
  type SectionSubmitInput as QuestionnaireSectionSubmitInput,
} from '../../services/questionnaire-form-section.service'
import {
  normalizeCompositeSectionAnswers,
  persistCompositeFormSection,
  type SectionSubmitInput as CompositeSectionSubmitInput,
  type CompositeSection,
} from '../composite/final-submit.service'
import { encryptUnifiedRuntimePayload } from './security'
import { createFormSectionCollectionFacts } from './form-facts'
import { insertCompletedUnitSnapshot } from './persistence'
import { formSectionSlotKey } from './slot-set'
import { canonicalJsonBytes } from './canonical'
import type { FrozenUnitAdmissionV1 } from './admission-snapshot'
import { assertAdmissionParentBinding } from './unit-admission'
import {
  activateStoredOrCatalogCompositeFormAdmission,
  activateStoredOrCatalogQuestionnaireFormAdmission,
  ensureCompositeSectionAttempt,
  ensureQuestionnaireSectionAttempt,
  loadCompositeFormDefinition,
  loadQuestionnaireFormDefinition,
} from './form-admission.service'

type NormalizedSectionEntry = {
  item: {
    id: string
    label?: string
    formLabel?: string
    contextKey: string | null
    type?: string
    formType?: string
    required: boolean
    options?: unknown
    formOptions?: unknown
  }
  normalizedValue: string | string[] | null
  storedValue: string | null
  status?: string
  completed?: boolean
}

const canonicalSubmission = (payload: unknown) => {
  const bytes = measureRequestPhaseSync('final_submit_serialization', () => canonicalJsonBytes(payload))
  return {
    bytes: bytes.byteLength,
    hash: createHash('sha256').update(bytes).digest('hex'),
  }
}

const contextForEntries = (entries: NormalizedSectionEntry[], input: {
  id: string
  type: string | null
  label?: string | null
  required: boolean
  options?: unknown
  contextKey?: string | null
}[]): { encrypted: string; hash: string } => {
  const items: ContextFormItem[] = input.map((item) => ({
    id: item.id,
    type: item.type ?? 'single_choice',
    label: item.label ?? null,
    required: item.required,
    options: item.options,
    contextKey: item.contextKey ?? null,
  }))
  const answers: ContextFormAnswer[] = entries
    .filter((entry) => Boolean(entry.item.contextKey) && entry.storedValue !== null)
    .map((entry) => ({ formItemId: entry.item.id, value: entry.storedValue as string }))
  try {
    const context = buildAssessmentContext({ items, answers })
    return { encrypted: encryptAssessmentContext(context), hash: hashAssessmentContext(context) }
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      error instanceof Error ? error.message : '人口学上下文无效',
      409,
    )
  }
}

const formFactsFor = (sectionKey: string, entries: NormalizedSectionEntry[]) => createFormSectionCollectionFacts({
  sectionKey,
  items: entries.map((entry) => ({
    key: entry.item.id,
    label: entry.item.label ?? entry.item.formLabel ?? entry.item.id,
    value: entry.normalizedValue,
  })),
})

const questionnaireContextItems = (section: SectionRow) => section.items.map((item) => ({
  id: item.id,
  type: item.type,
  label: item.label,
  required: item.required,
  options: item.options,
  contextKey: item.contextKey,
}))

const compositeContextItems = (section: CompositeSection) => section.items.map((item) => ({
  id: item.id,
  type: item.formType,
  label: item.formLabel,
  required: item.required,
  options: item.formOptions,
  contextKey: item.contextKey,
}))

const assertFormPrincipal = (
  admission: FrozenUnitAdmissionV1,
  input: { userId?: string | null; sessionId?: string; recoveryTokenHash?: string; resumeTokenHash?: string },
  kind: 'questionnaire' | 'composite',
): void => {
  if (input.userId && admission.principal.userId === input.userId) return
  const recovery = input.recoveryTokenHash ?? input.resumeTokenHash
  if (!input.userId && recovery && admission.principal.recoveryTokenHash === recovery) {
    if (kind === 'questionnaire' && input.sessionId && admission.principal.questionnaireSessionId !== input.sessionId) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此问卷测评', 403)
    }
    return
  }
  throw new InstrumentFinalSubmitError(
    'STALE_ATTEMPT',
    kind === 'questionnaire' ? '无权限操作此问卷测评' : '无权限操作此综合测评',
    403,
  )
}

const assertFormFrozenAdmission = (
  admission: FrozenUnitAdmissionV1,
  input: {
    sectionId: string
    attemptEpoch: number
    definitionHash: string
    contextSnapshotHash?: string | null
    userId?: string | null
    sessionId?: string
    recoveryTokenHash?: string
    resumeTokenHash?: string
  },
  parent: { questionnaireAssessmentId?: string | null; compositeAttemptId?: string | null },
  kind: 'questionnaire' | 'composite',
): void => {
  if (!admission.formSection || admission.formSection.id !== input.sectionId || admission.formSection.kind !== kind) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '表单区段准入快照身份不匹配', 409)
  }
  if (admission.attemptEpoch !== input.attemptEpoch) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段准入快照与当前作答轮次不匹配', 409)
  }
  if (admission.governance.status === 'HOLD') {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      admission.governance.holdReason ?? '表单区段准入处于 HOLD，无法提交',
      409,
    )
  }
  assertFormPrincipal(admission, input, kind)
  assertAdmissionParentBinding(parent, admission)
  assertDefinitionHash(admission.formSection.identityHash, input.definitionHash)
  if ((input.contextSnapshotHash ?? null) !== (admission.contextSnapshotHash ?? null)) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上下文版本已变化，请重试', 409)
  }
}

export const submitUnifiedQuestionnaireFormSectionFinal = async (
  input: QuestionnaireSectionSubmitInput,
  preloadedChild?: {
    id: string
    attemptEpoch: number
    frozenAdmissionSnapshotEncrypted: string | null
    frozenAdmissionSnapshotHash: string | null
  },
  _parent?: unknown,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  // Callers that already resolved the section attempt (the dispatcher's
  // combined child+runtime read) pass it in to skip the re-read; cold callers
  // fall back to the lazy ensure path.
  const child = preloadedChild ?? await ensureQuestionnaireSectionAttempt(input.questionnaireAssessmentId, input.sectionId, input.attemptEpoch)
  const admission = await measureRequestPhase('final_submit_admission', () => activateStoredOrCatalogQuestionnaireFormAdmission({
    parentId: input.questionnaireAssessmentId,
    sectionId: input.sectionId,
    child,
  }))
  assertFormFrozenAdmission(admission, input, {
    questionnaireAssessmentId: input.questionnaireAssessmentId,
    compositeAttemptId: null,
  }, 'questionnaire')
  const mappedSection = loadQuestionnaireFormDefinition(admission)
  const normalized = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeQuestionnaireSectionAnswers(mappedSection, input.answers),
  )
  const canonical = canonicalSubmission({ answers: normalized.payloadAnswers })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '问卷区段提交数据')
  const payloadHash = canonical.hash
  const context = mappedSection.contextSection && !admission.contextSnapshotHash
    ? contextForEntries(normalized.normalized as NormalizedSectionEntry[], questionnaireContextItems(mappedSection))
    : null
  const factsEncrypted = encryptUnifiedRuntimePayload(formFactsFor(mappedSection.id, normalized.normalized as NormalizedSectionEntry[]))
  const slotKey = admission.parent?.slotKey ?? formSectionSlotKey(mappedSection.id)
  const sourceDefinitionHash = admission.parent?.sourceDefinitionHash ?? admission.formSection!.identityHash
  void _parent

  const committed = await measureRequestPhase('final_submit_db_query', () => withQuestionnaireFormUnitTransaction(async (tx) => {
    const currentSection = await tx.questionnaireFormSectionAttempt.findUnique({
      where: { id: child.id },
      select: {
        id: true,
        status: true,
        attemptEpoch: true,
        submissionId: true,
        submissionPayloadHash: true,
        frozenAdmissionSnapshotHash: true,
      },
    })
    if (!currentSection) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(currentSection.attemptEpoch, input.attemptEpoch)
    if (currentSection.frozenAdmissionSnapshotHash && currentSection.frozenAdmissionSnapshotHash !== admission.snapshotHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段准入快照已变化，请重试', 409)
    }
    const replay = assertSubmissionReplay(currentSection, submissionId, payloadHash)
    if (replay === 'replay' && currentSection.status === 'COMPLETED') {
      return { replayed: true, sectionAttemptId: currentSection.id, contextSnapshotHash: admission.contextSnapshotHash }
    }
    if (currentSection.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束，请重试', 409)

    const mutations: BulkFormAnswerMutation[] = normalized.normalized.map((entry: any) => ({
      formItemId: entry.item.id,
      formSectionAttemptId: currentSection.id,
      value: entry.storedValue,
      status: entry.status,
      revision: 0,
    }))
    // UNIFIED_V1 attempts always carry pre-created PENDING rows; a count
    // mismatch means the pre-create invariant broke and must fail closed.
    const updatedAnswers = await measureRequestPhase('form_answer_persist', () =>
      persistExistingFormAnswerBatch(tx, input.questionnaireAssessmentId, mutations))
    if (updatedAnswers !== mutations.length) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷答案行缺失，请重启测评后重新作答', 409)
    }
    let contextSnapshotHash = admission.contextSnapshotHash
    if (context) {
      const updatedContext = await tx.questionnaireAssessment.updateMany({
        where: {
          id: input.questionnaireAssessmentId,
          status: 'IN_PROGRESS',
          runtimeGeneration: 'UNIFIED_V1',
          attemptEpoch: input.attemptEpoch,
          contextSnapshotEncrypted: null,
          contextSnapshotHash: null,
        },
        data: { contextSnapshotEncrypted: context.encrypted, contextSnapshotHash: context.hash, contextFrozenAt: new Date() },
      })
      if (updatedContext.count === 1) contextSnapshotHash = context.hash
      else if (!contextSnapshotHash) contextSnapshotHash = context.hash
    }
    const completedAt = new Date()
    const updated = await tx.questionnaireFormSectionAttempt.updateMany({
      where: {
        id: currentSection.id,
        status: 'IN_PROGRESS',
        attemptEpoch: input.attemptEpoch,
        questionnaireAssessment: {
          is: {
            id: input.questionnaireAssessmentId,
            status: 'IN_PROGRESS',
            runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: input.attemptEpoch,
            deliveryMode: 'FINAL_ONLY',
            ...(contextSnapshotHash === null ? { contextSnapshotHash: null } : { contextSnapshotHash }),
          },
        },
      },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: completedAt },
    } as any)
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评状态已变化，请重试', 409)
    await insertCompletedUnitSnapshot(tx, {
      questionnaireAssessmentId: input.questionnaireAssessmentId,
      attemptEpoch: input.attemptEpoch,
      slotKey,
      unitType: 'FORM_SECTION',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'QUESTIONNAIRE_FORM_SECTION',
      sourceAttemptId: currentSection.id,
      sourceSubmissionId: submissionId,
      sourceDefinitionHash,
      collectionFactsEncrypted: factsEncrypted,
      completedAt,
    })
    return { replayed: false, sectionAttemptId: currentSection.id, contextSnapshotHash, payloadHash }
  }))
  return { submissionId, sectionId: input.sectionId, ...committed, parent: null }
}

export const submitUnifiedCompositeFormSectionFinal = async (
  input: CompositeSectionSubmitInput,
  _parent?: unknown,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  const child = await ensureCompositeSectionAttempt(input.attemptId, input.sectionId, input.attemptEpoch)
  const admission = await measureRequestPhase('final_submit_admission', () => activateStoredOrCatalogCompositeFormAdmission({
    parentId: input.attemptId,
    sectionId: input.sectionId,
    child,
  }))
  assertFormFrozenAdmission(admission, input, {
    questionnaireAssessmentId: null,
    compositeAttemptId: input.attemptId,
  }, 'composite')
  const mappedSection = loadCompositeFormDefinition(admission)
  const normalized = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeCompositeSectionAnswers(mappedSection, input.answers),
  )
  const canonical = canonicalSubmission({ answers: normalized.payloadAnswers })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '综合测评区段提交数据')
  const payloadHash = canonical.hash
  const context = mappedSection.contextSection && !admission.contextSnapshotHash
    ? contextForEntries(normalized.normalized as NormalizedSectionEntry[], compositeContextItems(mappedSection))
    : null
  const factsEncrypted = encryptUnifiedRuntimePayload(formFactsFor(mappedSection.id, normalized.normalized as NormalizedSectionEntry[]))
  const slotKey = admission.parent?.slotKey ?? formSectionSlotKey(mappedSection.id)
  const sourceDefinitionHash = admission.parent?.sourceDefinitionHash ?? admission.formSection!.identityHash
  void _parent

  const committed = await measureRequestPhase('final_submit_db_query', () => withCompositeFormUnitTransaction(async (tx) => {
    const currentSection = await tx.compositeFormSectionAttempt.findUnique({
      where: { id: child.id },
      select: {
        id: true,
        status: true,
        attemptEpoch: true,
        submissionId: true,
        submissionPayloadHash: true,
        frozenAdmissionSnapshotHash: true,
      },
    })
    if (!currentSection) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(currentSection.attemptEpoch, input.attemptEpoch)
    if (currentSection.frozenAdmissionSnapshotHash && currentSection.frozenAdmissionSnapshotHash !== admission.snapshotHash) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段准入快照已变化，请重试', 409)
    }
    const replay = assertSubmissionReplay(currentSection, submissionId, payloadHash)
    if (replay === 'replay' && currentSection.status === 'COMPLETED') {
      return { replayed: true, sectionAttemptId: currentSection.id, contextSnapshotHash: admission.contextSnapshotHash }
    }
    if (currentSection.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束，请重试', 409)
    await persistCompositeFormSection(tx, input.attemptId, currentSection.id, normalized.normalized.map((entry: any) => ({ itemId: entry.item.id, value: entry.storedValue })))
    let contextSnapshotHash = admission.contextSnapshotHash
    if (context) {
      await tx.compositeAssessmentAttempt.updateMany({
        where: {
          id: input.attemptId,
          status: 'IN_PROGRESS',
          runtimeGeneration: 'UNIFIED_V1',
          attemptEpoch: input.attemptEpoch,
          contextSnapshotEncrypted: null,
          contextSnapshotHash: null,
        },
        data: { contextSnapshotEncrypted: context.encrypted, contextSnapshotHash: context.hash, contextFrozenAt: new Date() },
      })
      contextSnapshotHash = context.hash
    }
    const completedAt = new Date()
    const updated = await tx.compositeFormSectionAttempt.updateMany({
      where: {
        id: currentSection.id,
        status: 'IN_PROGRESS',
        attemptEpoch: input.attemptEpoch,
        attempt: {
          is: {
            id: input.attemptId,
            status: 'IN_PROGRESS',
            runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: input.attemptEpoch,
            deliveryMode: 'FINAL_ONLY',
            ...(contextSnapshotHash === null ? { contextSnapshotHash: null } : { contextSnapshotHash }),
          },
        },
      },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: completedAt },
    } as any)
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评状态已变化，请重试', 409)
    await insertCompletedUnitSnapshot(tx, {
      compositeAttemptId: input.attemptId,
      attemptEpoch: input.attemptEpoch,
      slotKey,
      unitType: 'FORM_SECTION',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'COMPOSITE_FORM_SECTION',
      sourceAttemptId: currentSection.id,
      sourceSubmissionId: submissionId,
      sourceDefinitionHash,
      collectionFactsEncrypted: factsEncrypted,
      completedAt,
    })
    return { replayed: false, sectionAttemptId: currentSection.id, contextSnapshotHash, payloadHash }
  }))
  return { submissionId, sectionId: input.sectionId, ...committed, parent: null }
}

const withQuestionnaireFormUnitTransaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => (
  prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' })
)

const withCompositeFormUnitTransaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => (
  prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' })
)
