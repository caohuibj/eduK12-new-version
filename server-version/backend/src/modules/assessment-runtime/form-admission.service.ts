import { prisma } from '../../config/database'
import { assertAttemptEpoch, assertFinalOnly, InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { readCompositeAttemptContext, readQuestionnaireAssessmentContext } from '../../services/assessmentContextService'
import {
  mapCompositeSection,
  mapQuestionnaireSection,
  type CompositeSection,
  type SectionRow,
} from './form-section-definition'
import {
  createFrozenUnitAdmission,
  type FrozenFormAdmissionIdentityV1,
  type FrozenUnitAdmissionV1,
} from './admission-snapshot'
import {
  persistAdmissionOnce,
  readStoredUnitAdmission,
} from './unit-admission'
import { formSectionIdentityHash } from './attempt-runtime'
import { formSectionSlotKey, getFrozenActiveSlot, type FrozenActiveSlotV1 } from './slot-set'

const hasContextSection = (sections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>): boolean => (
  sections.some((section) => Boolean(section.contextSection) || section.items.some((item) => Boolean(item.contextKey)))
)

// Parent rows are loaded once (load-once admission) and shared by the
// ensure* and activate* steps so a delivery never re-reads the same parent.
export type QuestionnaireFormAdmissionParent = {
  id: string
  userId: string | null
  sessionId: string | null
  resumeTokenHash: string | null
  deliveryMode: string
  runtimeGeneration: string | null
  attemptEpoch: number
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
  frozenActiveSlotSetEncrypted: string | null
  frozenActiveSlotSetHash: string | null
  questionnaire: {
    formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
  }
}

export type CompositeFormAdmissionParent = {
  id: string
  userId: string | null
  recoveryTokenHash: string | null
  deliveryMode: string
  runtimeGeneration: string | null
  attemptEpoch: number
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
  frozenActiveSlotSetEncrypted: string | null
  frozenActiveSlotSetHash: string | null
  compositeAssessment: {
    formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
  }
}

const QUESTIONNAIRE_FORM_ADMISSION_PARENT_SELECT = {
  id: true,
  userId: true,
  sessionId: true,
  resumeTokenHash: true,
  deliveryMode: true,
  runtimeGeneration: true,
  attemptEpoch: true,
  contextSnapshotEncrypted: true,
  contextSnapshotHash: true,
  frozenActiveSlotSetEncrypted: true,
  frozenActiveSlotSetHash: true,
  questionnaire: {
    select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
  },
} as const

const COMPOSITE_FORM_ADMISSION_PARENT_SELECT = {
  id: true,
  userId: true,
  recoveryTokenHash: true,
  deliveryMode: true,
  runtimeGeneration: true,
  attemptEpoch: true,
  contextSnapshotEncrypted: true,
  contextSnapshotHash: true,
  frozenActiveSlotSetEncrypted: true,
  frozenActiveSlotSetHash: true,
  compositeAssessment: {
    select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
  },
} as const

const asDefinition = (definition: SectionRow | CompositeSection): Record<string, unknown> => (
  JSON.parse(JSON.stringify(definition)) as Record<string, unknown>
)

const readRequiredFormSlot = (input: {
  encrypted: string | null
  storedHash: string | null
  attemptEpoch: number
  sectionId: string
  identityHash: string
}): FrozenActiveSlotV1 => {
  let slot: FrozenActiveSlotV1
  try {
    slot = getFrozenActiveSlot({
      encrypted: input.encrypted,
      storedHash: input.storedHash,
      attemptEpoch: input.attemptEpoch,
      slotKey: formSectionSlotKey(input.sectionId),
    })
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'DEFINITION_MISMATCH',
      error instanceof Error ? error.message : '表单区段冻结单元不可用',
      409,
    )
  }
  if (
    slot.unitType !== 'FORM_SECTION'
    || !slot.required
    || slot.sourceDefinitionIdentity.key !== input.sectionId
    || slot.sourceDefinitionIdentity.version !== 'FORM_SECTION_V1'
    || slot.sourceDefinitionIdentity.hash !== input.identityHash
  ) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '表单区段冻结单元身份不匹配', 409)
  }
  return slot
}

const formIdentity = (input: {
  sectionId: string
  kind: FrozenFormAdmissionIdentityV1['kind']
  definition: SectionRow | CompositeSection
}): FrozenFormAdmissionIdentityV1 => {
  const definition = asDefinition(input.definition)
  return {
    id: input.sectionId,
    identityHash: formSectionIdentityHash(input.definition),
    kind: input.kind,
    definition,
  }
}

export const readStoredFormAdmission = (row: {
  frozenAdmissionSnapshotEncrypted: string | null
  frozenAdmissionSnapshotHash: string | null
}): FrozenUnitAdmissionV1 | null => (
  readStoredUnitAdmission(row, '表单区段准入快照无法读取，请重启后重新作答')
)

const persistQuestionnaireFormAdmission = (
  attemptId: string,
  snapshot: FrozenUnitAdmissionV1,
): Promise<FrozenUnitAdmissionV1> => persistAdmissionOnce({
  snapshot,
  writeIfEmpty: (persisted) => prisma.questionnaireFormSectionAttempt.updateMany({
    where: { id: attemptId, frozenAdmissionSnapshotHash: null },
    data: persisted,
  }),
  read: () => prisma.questionnaireFormSectionAttempt.findUnique({
    where: { id: attemptId },
    select: { frozenAdmissionSnapshotEncrypted: true, frozenAdmissionSnapshotHash: true },
  }),
  missingMessage: '表单区段记录不存在',
  unreadableMessage: '表单区段准入快照无法读取，请重启后重新作答',
})

const persistCompositeFormAdmission = (
  attemptId: string,
  snapshot: FrozenUnitAdmissionV1,
): Promise<FrozenUnitAdmissionV1> => persistAdmissionOnce({
  snapshot,
  writeIfEmpty: (persisted) => prisma.compositeFormSectionAttempt.updateMany({
    where: { id: attemptId, frozenAdmissionSnapshotHash: null },
    data: persisted,
  }),
  read: () => prisma.compositeFormSectionAttempt.findUnique({
    where: { id: attemptId },
    select: { frozenAdmissionSnapshotEncrypted: true, frozenAdmissionSnapshotHash: true },
  }),
  missingMessage: '表单区段记录不存在',
  unreadableMessage: '表单区段准入快照无法读取，请重启后重新作答',
})

export const ensureQuestionnaireSectionAttempt = async (
  assessmentId: string,
  sectionId: string,
  attemptEpoch: number,
) => {
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

export const ensureCompositeSectionAttempt = async (
  attemptId: string,
  sectionId: string,
  attemptEpoch: number,
) => {
  let attempt = await prisma.compositeFormSectionAttempt.findUnique({
    where: { attemptId_sectionId: { attemptId, sectionId } },
  })
  if (!attempt) {
    try {
      attempt = await prisma.compositeFormSectionAttempt.create({
        data: { attemptId, sectionId, attemptEpoch },
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      attempt = await prisma.compositeFormSectionAttempt.findUnique({
        where: { attemptId_sectionId: { attemptId, sectionId } },
      })
    }
  }
  if (!attempt) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段记录不存在', 404)
  return attempt
}

export const activateQuestionnaireFormAdmission = async (input: {
  parent: QuestionnaireFormAdmissionParent
  sectionId: string
  definition: SectionRow
  child: {
    id: string
    attemptEpoch: number
    frozenAdmissionSnapshotEncrypted: string | null
    frozenAdmissionSnapshotHash: string | null
  }
}): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredFormAdmission(input.child)
  if (stored) return stored
  const parent = input.parent
  if (parent.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷运行时版本不匹配，请重启测评', 409)
  }
  assertFinalOnly(parent.deliveryMode)
  assertAttemptEpoch(parent.attemptEpoch, input.child.attemptEpoch)
  const identity = formIdentity({
    sectionId: input.sectionId,
    kind: 'questionnaire',
    definition: input.definition,
  })
  const slot = readRequiredFormSlot({
    encrypted: parent.frozenActiveSlotSetEncrypted,
    storedHash: parent.frozenActiveSlotSetHash,
    attemptEpoch: parent.attemptEpoch,
    sectionId: input.sectionId,
    identityHash: identity.identityHash,
  })
  const requiresContext = hasContextSection(parent.questionnaire.formSections) && !input.definition.contextSection
  if (requiresContext && parent.contextSnapshotHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  const context = readQuestionnaireAssessmentContext(parent)
  if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
  return persistQuestionnaireFormAdmission(input.child.id, createFrozenUnitAdmission({
    attemptEpoch: parent.attemptEpoch,
    formSection: identity,
    principal: {
      userId: parent.userId,
      questionnaireSessionId: parent.sessionId,
      recoveryTokenHash: parent.resumeTokenHash,
    },
    parent: {
      kind: 'questionnaire',
      parentId: parent.id,
      slotKey: formSectionSlotKey(input.sectionId),
      sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
      compiledRuntimeHash: identity.identityHash,
    },
    requiresContext,
    contextSnapshotHash: parent.contextSnapshotHash,
    contextValues: context.context?.values ?? null,
  }))
}

export const activateCompositeFormAdmission = async (input: {
  parent: CompositeFormAdmissionParent
  sectionId: string
  definition: CompositeSection
  child: {
    id: string
    attemptEpoch: number
    frozenAdmissionSnapshotEncrypted: string | null
    frozenAdmissionSnapshotHash: string | null
  }
}): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredFormAdmission(input.child)
  if (stored) return stored
  const parent = input.parent
  if (parent.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评运行时版本不匹配，请重启测评', 409)
  }
  assertFinalOnly(parent.deliveryMode)
  assertAttemptEpoch(parent.attemptEpoch, input.child.attemptEpoch)
  const identity = formIdentity({
    sectionId: input.sectionId,
    kind: 'composite',
    definition: input.definition,
  })
  const slot = readRequiredFormSlot({
    encrypted: parent.frozenActiveSlotSetEncrypted,
    storedHash: parent.frozenActiveSlotSetHash,
    attemptEpoch: parent.attemptEpoch,
    sectionId: input.sectionId,
    identityHash: identity.identityHash,
  })
  const requiresContext = hasContextSection(parent.compositeAssessment.formSections) && !input.definition.contextSection
  if (requiresContext && parent.contextSnapshotHash === null) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
  }
  const context = readCompositeAttemptContext(parent)
  if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
  return persistCompositeFormAdmission(input.child.id, createFrozenUnitAdmission({
    attemptEpoch: parent.attemptEpoch,
    formSection: identity,
    principal: {
      userId: parent.userId,
      recoveryTokenHash: parent.recoveryTokenHash,
    },
    parent: {
      kind: 'composite',
      parentId: parent.id,
      slotKey: formSectionSlotKey(input.sectionId),
      sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
      compiledRuntimeHash: identity.identityHash,
    },
    requiresContext,
    contextSnapshotHash: parent.contextSnapshotHash,
    contextValues: context.context?.values ?? null,
  }))
}

export const ensureQuestionnaireFormAdmissionAtDelivery = async (
  assessmentId: string,
  section: SectionRow,
): Promise<FrozenUnitAdmissionV1> => {
  // Load-once admission: the parent is read exactly once with the full
  // admission select and shared by the ensure and activate steps, so a
  // delivery never re-reads the same questionnaire assessment row.
  const parent: QuestionnaireFormAdmissionParent | null = await prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: QUESTIONNAIRE_FORM_ADMISSION_PARENT_SELECT,
  })
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  if (parent.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷运行时版本不匹配，请重启测评', 409)
  }
  const child = await ensureQuestionnaireSectionAttempt(assessmentId, section.id, parent.attemptEpoch)
  return activateQuestionnaireFormAdmission({
    parent,
    sectionId: section.id,
    definition: section,
    child,
  })
}

export const ensureCompositeFormAdmissionAtDelivery = async (
  attemptId: string,
  section: CompositeSection,
): Promise<FrozenUnitAdmissionV1> => {
  // Load-once admission: the parent is read exactly once with the full
  // admission select and shared by the ensure and activate steps, so a
  // delivery never re-reads the same composite attempt row.
  const parent: CompositeFormAdmissionParent | null = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: COMPOSITE_FORM_ADMISSION_PARENT_SELECT,
  })
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  if (parent.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评运行时版本不匹配，请重启测评', 409)
  }
  const child = await ensureCompositeSectionAttempt(attemptId, section.id, parent.attemptEpoch)
  return activateCompositeFormAdmission({
    parent,
    sectionId: section.id,
    definition: section,
    child,
  })
}

export const loadQuestionnaireFormDefinition = (admission: FrozenUnitAdmissionV1): SectionRow => {
  if (!admission.formSection || admission.formSection.kind !== 'questionnaire') {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '表单区段准入快照身份不匹配', 409)
  }
  return mapQuestionnaireSection(admission.formSection.definition)
}

export const loadCompositeFormDefinition = (admission: FrozenUnitAdmissionV1): CompositeSection => {
  if (!admission.formSection || admission.formSection.kind !== 'composite') {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '表单区段准入快照身份不匹配', 409)
  }
  return mapCompositeSection(admission.formSection.definition)
}

export const activateStoredOrCatalogQuestionnaireFormAdmission = async (input: {
  parentId: string
  sectionId: string
  child: {
    id: string
    attemptEpoch: number
    frozenAdmissionSnapshotEncrypted: string | null
    frozenAdmissionSnapshotHash: string | null
  }
}): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredFormAdmission(input.child)
  if (stored) return stored
  const parent: QuestionnaireFormAdmissionParent | null = await prisma.questionnaireAssessment.findUnique({
    where: { id: input.parentId },
    select: QUESTIONNAIRE_FORM_ADMISSION_PARENT_SELECT,
  })
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷测评记录不存在', 404)
  const section = await prisma.questionnaireFormSection.findUnique({
    where: { id: input.sectionId },
    include: { items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  return activateQuestionnaireFormAdmission({
    parent,
    sectionId: input.sectionId,
    definition: mapQuestionnaireSection(section),
    child: input.child,
  })
}

export const activateStoredOrCatalogCompositeFormAdmission = async (input: {
  parentId: string
  sectionId: string
  child: {
    id: string
    attemptEpoch: number
    frozenAdmissionSnapshotEncrypted: string | null
    frozenAdmissionSnapshotHash: string | null
  }
}): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredFormAdmission(input.child)
  if (stored) return stored
  const parent: CompositeFormAdmissionParent | null = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: input.parentId },
    select: COMPOSITE_FORM_ADMISSION_PARENT_SELECT,
  })
  if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '综合测评记录不存在', 404)
  const section = await prisma.compositeFormSection.findUnique({
    where: { id: input.sectionId },
    include: { items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }] } },
  })
  if (!section) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '表单区段不存在', 404)
  return activateCompositeFormAdmission({
    parent,
    sectionId: input.sectionId,
    definition: mapCompositeSection(section),
    child: input.child,
  })
}
