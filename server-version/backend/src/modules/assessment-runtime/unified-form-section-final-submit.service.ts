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
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionReplay,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import { persistFormAnswerBatch, type BulkFormAnswerMutation } from '../../services/questionnaire-form-answer-batch'
import {
  mapQuestionnaireSection,
  normalizeQuestionnaireSectionAnswers,
  type SectionRow,
  type SectionSubmitInput as QuestionnaireSectionSubmitInput,
} from '../../services/questionnaire-form-section.service'
import {
  mapCompositeSection,
  normalizeCompositeSectionAnswers,
  persistCompositeFormSection,
  type SectionSubmitInput as CompositeSectionSubmitInput,
  type CompositeSection,
} from '../composite/final-submit.service'
import { encryptUnifiedRuntimePayload } from './security'
import { createFormSectionCollectionFacts } from './form-facts'
import { insertCompletedUnitSnapshot } from './persistence'
import { formSectionSlotKey, getFrozenActiveSlot } from './slot-set'
import { canonicalJsonBytes } from './canonical'
import { formSectionIdentityHash } from './attempt-runtime'

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

const assertFormSectionSlotBinding = (admission: any, sectionId: string, sectionIdentityHash: string) => {
  try {
    const slot = getFrozenActiveSlot({
      encrypted: admission.frozenActiveSlotSetEncrypted,
      storedHash: admission.frozenActiveSlotSetHash,
      attemptEpoch: admission.attemptEpoch,
      slotKey: formSectionSlotKey(sectionId),
    })
    if (
      slot.unitType !== 'FORM_SECTION'
      || !slot.required
      || slot.sourceDefinitionIdentity.key !== sectionId
      || slot.sourceDefinitionIdentity.version !== 'FORM_SECTION_V1'
      || slot.sourceDefinitionIdentity.hash !== sectionIdentityHash
    ) {
      throw new Error('表单区段冻结单元身份不匹配')
    }
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'DEFINITION_MISMATCH',
      error instanceof Error ? error.message : '表单区段冻结单元不可用',
      409,
    )
  }
}

const progressAfterFormSection = (input: {
  completedScales: number
  completedForms: number
  totalUnits: number
  sectionWasInProgress: boolean
}) => {
  const completedForms = input.completedForms + (input.sectionWasInProgress ? 1 : 0)
  const completedUnits = input.completedScales + completedForms
  return {
    completedForms,
    progress: input.totalUnits === 0 ? 100 : Math.min(100, Math.round((completedUnits / input.totalUnits) * 100)),
  }
}

const ensureQuestionnaireSectionAttempt = async (assessmentId: string, sectionId: string, attemptEpoch: number) => {
  let attempt = await prisma.questionnaireFormSectionAttempt.findUnique({
    where: { questionnaireAssessmentId_sectionId: { questionnaireAssessmentId: assessmentId, sectionId } },
  })
  if (!attempt) {
    try {
      attempt = await prisma.questionnaireFormSectionAttempt.create({
        data: { questionnaireAssessmentId: assessmentId, sectionId, attemptEpoch },
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      attempt = await prisma.questionnaireFormSectionAttempt.findUnique({
        where: { questionnaireAssessmentId_sectionId: { questionnaireAssessmentId: assessmentId, sectionId } },
      })
    }
  }
  if (!attempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
  return attempt
}

export const submitUnifiedQuestionnaireFormSectionFinal = async (
  input: QuestionnaireSectionSubmitInput,
  admission: any,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  if (admission.runtimeGeneration !== 'UNIFIED_V1') throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '问卷运行时版本不支持统一提交', 409)
  if (input.userId !== null && input.userId !== undefined) {
    if (admission.userId !== input.userId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此问卷测评', 403)
  } else if (!input.sessionId || admission.sessionId !== input.sessionId || admission.userId !== null || !input.resumeTokenHash || admission.resumeTokenHash !== input.resumeTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此问卷测评', 403)
  }
  assertFinalOnly(admission.deliveryMode)
  assertAttemptEpoch(admission.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(admission.status, '问卷测评')
  const section = admission.questionnaire.formSections.find((candidate: any) => candidate.id === input.sectionId)
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  const mappedSection = mapQuestionnaireSection(section)
  const sectionIdentityHash = formSectionIdentityHash(mappedSection)
  assertDefinitionHash(sectionIdentityHash, input.definitionHash)
  assertFormSectionSlotBinding(admission, mappedSection.id, sectionIdentityHash)
  const normalized = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeQuestionnaireSectionAnswers(mappedSection, input.answers),
  )
  const canonical = canonicalSubmission({ answers: normalized.payloadAnswers })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '问卷区段提交数据')
  const payloadHash = canonical.hash
  const sectionAttempt = await ensureQuestionnaireSectionAttempt(admission.id, mappedSection.id, input.attemptEpoch)
  const context = mappedSection.contextSection && !admission.contextSnapshotHash
    ? contextForEntries(normalized.normalized as NormalizedSectionEntry[], questionnaireContextItems(mappedSection))
    : null
  const factsEncrypted = encryptUnifiedRuntimePayload(formFactsFor(mappedSection.id, normalized.normalized as NormalizedSectionEntry[]))
  const mappedSectionBytes = canonicalJsonBytes(mappedSection)
  const sourceDefinitionHash = mappedSectionBytes.length > 0
    ? createHash('sha256').update(mappedSectionBytes).digest('hex')
    : input.definitionHash

  const committed = await measureRequestPhase('final_submit_db_query', () => withQuestionnaireFormUnitTransaction(async (tx) => {
    const currentSection = await tx.questionnaireFormSectionAttempt.findUnique({ where: { id: sectionAttempt.id } })
    if (!currentSection) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(currentSection.attemptEpoch, input.attemptEpoch)
    const replay = assertSubmissionReplay(currentSection, submissionId, payloadHash)
    if (replay === 'replay' && currentSection.status === 'COMPLETED') {
      const progress = progressAfterFormSection({
        completedScales: admission.completedScales,
        completedForms: admission.completedForms,
        totalUnits: admission.questionnaire.questionnaireScales.length + admission.questionnaire.formSections.length,
        sectionWasInProgress: false,
      })
      return { replayed: true, sectionAttemptId: currentSection.id, contextSnapshotHash: admission.contextSnapshotHash, ...progress }
    }
    if (currentSection.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束，请重试', 409)

    const mutations: BulkFormAnswerMutation[] = normalized.normalized.map((entry: any) => ({
      formItemId: entry.item.id,
      formSectionAttemptId: currentSection.id,
      value: entry.storedValue,
      status: entry.status,
      revision: 0,
    }))
    await persistFormAnswerBatch(tx, admission.id, mutations)
    let contextSnapshotHash = admission.contextSnapshotHash
    if (context) {
      const updatedContext = await tx.questionnaireAssessment.updateMany({
        where: {
          id: admission.id,
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
            id: admission.id,
            status: 'IN_PROGRESS',
            runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: input.attemptEpoch,
            ...(contextSnapshotHash === null ? { contextSnapshotHash: null } : { contextSnapshotHash }),
          },
        },
      },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: completedAt },
    } as any)
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评状态已变化，请重试', 409)
    await insertCompletedUnitSnapshot(tx, {
      questionnaireAssessmentId: admission.id,
      attemptEpoch: input.attemptEpoch,
      slotKey: formSectionSlotKey(mappedSection.id),
      unitType: 'FORM_SECTION',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'QUESTIONNAIRE_FORM_SECTION',
      sourceAttemptId: currentSection.id,
      sourceSubmissionId: submissionId,
      sourceDefinitionHash,
      collectionFactsEncrypted: factsEncrypted,
      completedAt,
    })
    const progress = progressAfterFormSection({
      completedScales: admission.completedScales,
      completedForms: admission.completedForms,
      totalUnits: admission.questionnaire.questionnaireScales.length + admission.questionnaire.formSections.length,
      sectionWasInProgress: true,
    })
    return { replayed: false, sectionAttemptId: currentSection.id, contextSnapshotHash, payloadHash, ...progress }
  }))
  const parent = await measureRequestPhase('final_submit_parent_finalization', async () => {
    const { finalizeQuestionnaireAttemptIfReady } = await import('../../services/questionnaire-form-section.service')
    return finalizeQuestionnaireAttemptIfReady(admission.id)
  })
  return { submissionId, sectionId: input.sectionId, ...committed, parent }
}

const ensureCompositeSectionAttempt = async (attemptId: string, sectionId: string, attemptEpoch: number) => {
  let attempt = await prisma.compositeFormSectionAttempt.findUnique({ where: { attemptId_sectionId: { attemptId, sectionId } } })
  if (!attempt) {
    try {
      attempt = await prisma.compositeFormSectionAttempt.create({ data: { attemptId, sectionId, attemptEpoch } })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      attempt = await prisma.compositeFormSectionAttempt.findUnique({ where: { attemptId_sectionId: { attemptId, sectionId } } })
    }
  }
  if (!attempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
  return attempt
}

export const submitUnifiedCompositeFormSectionFinal = async (
  input: CompositeSectionSubmitInput,
  admission: any,
) => {
  const submissionId = validateSubmissionId(input.submissionId)
  if (admission.runtimeGeneration !== 'UNIFIED_V1') throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '综合测评运行时版本不支持统一提交', 409)
  if (input.userId !== null && input.userId !== undefined) {
    if (admission.userId !== input.userId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限操作此综合测评', 403)
  } else if (admission.userId !== null || !input.recoveryTokenHash || admission.recoveryTokenHash !== input.recoveryTokenHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '恢复凭证无权操作此综合测评', 403)
  }
  assertFinalOnly(admission.deliveryMode)
  assertAttemptEpoch(admission.attemptEpoch, input.attemptEpoch)
  assertFinalSubmitStatus(admission.status, '综合测评')
  const section = admission.compositeAssessment.formSections.find((candidate: any) => candidate.id === input.sectionId)
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  const mappedSection = mapCompositeSection(section)
  const sectionIdentityHash = formSectionIdentityHash(mappedSection)
  assertDefinitionHash(sectionIdentityHash, input.definitionHash)
  assertFormSectionSlotBinding(admission, mappedSection.id, sectionIdentityHash)
  const normalized = measureRequestPhaseSync(
    'final_submit_payload_validation',
    () => normalizeCompositeSectionAnswers(mappedSection, input.answers),
  )
  const canonical = canonicalSubmission({ answers: normalized.payloadAnswers })
  assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.formSection, '综合测评区段提交数据')
  const payloadHash = canonical.hash
  const sectionAttempt = await ensureCompositeSectionAttempt(admission.id, mappedSection.id, input.attemptEpoch)
  const context = mappedSection.contextSection && !admission.contextSnapshotHash
    ? contextForEntries(normalized.normalized as NormalizedSectionEntry[], compositeContextItems(mappedSection))
    : null
  const factsEncrypted = encryptUnifiedRuntimePayload(formFactsFor(mappedSection.id, normalized.normalized as NormalizedSectionEntry[]))
  const sourceDefinitionHash = createHash('sha256').update(canonicalJsonBytes(mappedSection)).digest('hex')

  const committed = await measureRequestPhase('final_submit_db_query', () => withCompositeFormUnitTransaction(async (tx) => {
    const currentSection = await tx.compositeFormSectionAttempt.findUnique({ where: { id: sectionAttempt.id } })
    if (!currentSection) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
    assertAttemptEpoch(currentSection.attemptEpoch, input.attemptEpoch)
    const replay = assertSubmissionReplay(currentSection, submissionId, payloadHash)
    if (replay === 'replay' && currentSection.status === 'COMPLETED') {
      const progress = progressAfterFormSection({
        completedScales: admission.completedItems,
        completedForms: 0,
        totalUnits: admission.compositeAssessment.items.filter((item: any) => item.type !== 'FORM').length + admission.compositeAssessment.formSections.length,
        sectionWasInProgress: false,
      })
      return { replayed: true, sectionAttemptId: currentSection.id, contextSnapshotHash: admission.contextSnapshotHash, ...progress }
    }
    if (currentSection.status !== 'IN_PROGRESS') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段已结束，请重试', 409)
    await persistCompositeFormSection(tx, admission.id, currentSection.id, normalized.normalized.map((entry: any) => ({ itemId: entry.item.id, value: entry.storedValue })))
    let contextSnapshotHash = admission.contextSnapshotHash
    if (context) {
      await tx.compositeAssessmentAttempt.updateMany({
        where: {
          id: admission.id,
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
            id: admission.id,
            status: 'IN_PROGRESS',
            runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: input.attemptEpoch,
            ...(contextSnapshotHash === null ? { contextSnapshotHash: null } : { contextSnapshotHash }),
          },
        },
      },
      data: { status: 'COMPLETED', submissionId, submissionPayloadHash: payloadHash, submittedAt: completedAt },
    } as any)
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评状态已变化，请重试', 409)
    await insertCompletedUnitSnapshot(tx, {
      compositeAttemptId: admission.id,
      attemptEpoch: input.attemptEpoch,
      slotKey: formSectionSlotKey(mappedSection.id),
      unitType: 'FORM_SECTION',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'COMPOSITE_FORM_SECTION',
      sourceAttemptId: currentSection.id,
      sourceSubmissionId: submissionId,
      sourceDefinitionHash,
      collectionFactsEncrypted: factsEncrypted,
      completedAt,
    })
    const totalUnits = admission.compositeAssessment.items.filter((item: any) => item.type !== 'FORM').length + admission.compositeAssessment.formSections.length
    const progress = progressAfterFormSection({
      completedScales: admission.completedItems,
      completedForms: 0,
      totalUnits,
      sectionWasInProgress: true,
    })
    return { replayed: false, sectionAttemptId: currentSection.id, contextSnapshotHash, payloadHash, ...progress }
  }))
  const parent = await measureRequestPhase('final_submit_parent_finalization', async () => {
    const { finalizeCompositeAttemptIfReady } = await import('../composite/composite.service')
    return finalizeCompositeAttemptIfReady(admission.id)
  })
  return { submissionId, sectionId: input.sectionId, ...committed, parent }
}

const withQuestionnaireFormUnitTransaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => (
  prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' })
)

const withCompositeFormUnitTransaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => (
  prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' })
)
