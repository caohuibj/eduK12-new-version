import { prisma } from '../../config/database'
import { assertAttemptEpoch, assertFinalOnly, InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { readCompositeAttemptContext, readQuestionnaireAssessmentContext } from '../../services/assessmentContextService'
import {
  createFrozenUnitAdmission,
  frozenAdmissionPersistence,
  type FrozenUnitAdmissionV1,
} from '../assessment-runtime/admission-snapshot'
import {
  assertAdmissionParentBinding as assertSharedAdmissionParentBinding,
  persistAdmissionOnce,
  readStoredUnitAdmission,
} from '../assessment-runtime/unit-admission'
import { getFrozenActiveSlot, questionnaireScaleSlotKey, compositeItemSlotKey, type FrozenActiveSlotV1 } from '../assessment-runtime/slot-set'

const COMPILED_RUNTIME_HASH = /^[0-9a-f]{64}$/

export const UNIFIED_SCALE_CHILD_ADMISSION_SELECT = {
  id: true,
  userId: true,
  status: true,
  deliveryMode: true,
  runtimeGeneration: true,
  runtimeSnapshotEncrypted: true,
  compiledRuntimeHash: true,
  frozenAdmissionSnapshotEncrypted: true,
  frozenAdmissionSnapshotHash: true,
  attemptEpoch: true,
  startedAt: true,
  submissionId: true,
  submissionPayloadHash: true,
  questionnaireAssessmentId: true,
  compositeAttemptId: true,
  compositeItemId: true,
  scaleId: true,
  scale: {
    select: { id: true, code: true, name: true, instrumentVersion: true },
  },
} as const

export type ScaleAdmissionChildRow = {
  id: string
  userId: string | null
  status: string
  deliveryMode: string
  runtimeGeneration: string | null
  runtimeSnapshotEncrypted: string | null
  compiledRuntimeHash: string | null
  frozenAdmissionSnapshotEncrypted: string | null
  frozenAdmissionSnapshotHash: string | null
  attemptEpoch: number
  startedAt: Date
  submissionId: string | null
  submissionPayloadHash: string | null
  questionnaireAssessmentId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  scaleId: string
  scale: { id: string; code: string; name: string; instrumentVersion: string }
}

// Composite parent rows are loaded once (load-once admission) and shared by
// the ensure* and activate* steps so a delivery never re-reads the same
// composite attempt row. The unified attempt-state reader holds an already
// loaded superset row and passes it in to skip the redundant read.
export type CompositeScaleAdmissionParent = {
  id: string
  userId: string | null
  recoveryTokenHash: string | null
  deliveryMode: string
  attemptEpoch: number
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
  frozenActiveSlotSetEncrypted: string | null
  frozenActiveSlotSetHash: string | null
  compositeAssessment: {
    formSections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>
  }
}

const hasContextSection = (sections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>): boolean => (
  sections.some((section) => Boolean(section.contextSection) || section.items.some((item) => Boolean(item.contextKey)))
)

const compiledRuntimeHashFrom = (slot: FrozenActiveSlotV1, fallback: string | null): string => {
  const hash = typeof slot.sourceBinding.compiledRuntimeHash === 'string'
    ? slot.sourceBinding.compiledRuntimeHash
    : fallback
  if (!hash || !COMPILED_RUNTIME_HASH.test(hash)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元运行时不匹配', 409)
  }
  return hash
}

const readRequiredScaleSlot = (input: {
  encrypted: string | null
  storedHash: string | null
  attemptEpoch: number
  slotKey: string
  scale: ScaleAdmissionChildRow['scale']
}): FrozenActiveSlotV1 => {
  let slot: FrozenActiveSlotV1
  try {
    slot = getFrozenActiveSlot({
      encrypted: input.encrypted,
      storedHash: input.storedHash,
      attemptEpoch: input.attemptEpoch,
      slotKey: input.slotKey,
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
    || slot.sourceDefinitionIdentity.key !== input.scale.code
    || slot.sourceDefinitionIdentity.version !== input.scale.instrumentVersion
  ) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元身份不匹配', 409)
  }
  return slot
}

export const createStandaloneScaleAdmission = (input: {
  attemptEpoch: number
  userId: string | null
  scale: NonNullable<FrozenUnitAdmissionV1['scale']>
}): FrozenUnitAdmissionV1 => createFrozenUnitAdmission({
  attemptEpoch: input.attemptEpoch,
  scale: input.scale,
  principal: { userId: input.userId },
  parent: null,
  requiresContext: false,
})

export const standaloneAdmissionPersistence = (input: {
  attemptEpoch: number
  userId: string | null
  scale: NonNullable<FrozenUnitAdmissionV1['scale']>
}) => frozenAdmissionPersistence(createStandaloneScaleAdmission(input))

const persistAdmission = async (assessmentId: string, snapshot: FrozenUnitAdmissionV1): Promise<FrozenUnitAdmissionV1> => (
  persistAdmissionOnce({
    snapshot,
    writeIfEmpty: (persisted) => prisma.assessment.updateMany({
      where: { id: assessmentId, frozenAdmissionSnapshotHash: null },
      data: persisted,
    }),
    read: () => prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        frozenAdmissionSnapshotEncrypted: true,
        frozenAdmissionSnapshotHash: true,
      },
    }),
    missingMessage: '量表测评记录不存在',
    unreadableMessage: '量表准入快照无法读取，请重启后重新作答',
  })
)

export const assertAdmissionParentBinding = (
  child: Pick<ScaleAdmissionChildRow, 'questionnaireAssessmentId' | 'compositeAttemptId'>,
  admission: FrozenUnitAdmissionV1,
): void => assertSharedAdmissionParentBinding(child, admission)

export const ensureScaleAdmissionAtDelivery = async (
  assessmentId: string,
  parent?: CompositeScaleAdmissionParent,
  child?: ScaleAdmissionChildRow,
): Promise<FrozenUnitAdmissionV1> => {
  // Load-once completion: the unified attempt-state reader already holds the
  // child row (with the full admission select) and passes it in, so a
  // current-unit delivery never re-reads the same scale assessment row.
  const loaded = child ?? await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
  // Identity assertion (Work C): when a caller supplies an already-loaded child
  // or parent, verify the structural relationship that the old DB query used to
  // guarantee implicitly. A mismatched pairing would otherwise persist a frozen
  // admission snapshot under the wrong parent binding.
  if (child && child.id !== assessmentId) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表记录与请求身份不匹配', 409)
  }
  if (parent && loaded.compositeAttemptId !== parent.id) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表上级记录与请求身份不匹配', 409)
  }
  if (loaded.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表运行时版本不匹配，请重启测评', 409)
  }
  return activateScaleAdmission(loaded, parent)
}

export const readStoredScaleAdmission = (
  row: Pick<ScaleAdmissionChildRow, 'frozenAdmissionSnapshotEncrypted' | 'frozenAdmissionSnapshotHash'>,
): FrozenUnitAdmissionV1 | null => (
  readStoredUnitAdmission(row, '量表准入快照无法读取，请重启后重新作答')
)

export const activateScaleAdmission = async (
  row: ScaleAdmissionChildRow,
  parent?: CompositeScaleAdmissionParent,
): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredScaleAdmission(row)
  if (stored) return stored
  assertFinalOnly(row.deliveryMode)

  if (row.questionnaireAssessmentId) {
    const parent = await prisma.questionnaireAssessment.findUnique({
      where: { id: row.questionnaireAssessmentId },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        resumeTokenHash: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        frozenActiveSlotSetEncrypted: true,
        frozenActiveSlotSetHash: true,
        questionnaire: {
          select: {
            questionnaireScales: { select: { id: true, scaleId: true } },
            formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } },
          },
        },
      },
    })
    if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    assertFinalOnly(parent.deliveryMode)
    assertAttemptEpoch(parent.attemptEpoch, row.attemptEpoch)
    const binding = parent.questionnaire.questionnaireScales.find((item) => item.scaleId === row.scale.id)
    if (!binding) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
    const slotKey = questionnaireScaleSlotKey(binding.id)
    const slot = readRequiredScaleSlot({
      encrypted: parent.frozenActiveSlotSetEncrypted,
      storedHash: parent.frozenActiveSlotSetHash,
      attemptEpoch: row.attemptEpoch,
      slotKey,
      scale: row.scale,
    })
    const compiledRuntimeHash = compiledRuntimeHashFrom(slot, row.compiledRuntimeHash)
    const requiresContext = hasContextSection(parent.questionnaire.formSections)
    if (requiresContext && parent.contextSnapshotHash === null) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    const context = readQuestionnaireAssessmentContext(parent)
    if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
    return persistAdmission(row.id, createFrozenUnitAdmission({
      attemptEpoch: row.attemptEpoch,
      scale: row.scale,
      principal: {
        userId: row.userId ?? parent.userId,
        questionnaireSessionId: parent.sessionId,
        recoveryTokenHash: parent.resumeTokenHash,
      },
      parent: {
        kind: 'questionnaire',
        parentId: parent.id,
        slotKey,
        sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
        compiledRuntimeHash,
      },
      requiresContext,
      contextSnapshotHash: parent.contextSnapshotHash,
      contextValues: context.context?.values ?? null,
    }))
  }

  if (row.compositeAttemptId) {
    const loaded = parent ?? await prisma.compositeAssessmentAttempt.findUnique({
      where: { id: row.compositeAttemptId },
      select: {
        id: true,
        userId: true,
        recoveryTokenHash: true,
        deliveryMode: true,
        attemptEpoch: true,
        contextSnapshotEncrypted: true,
        contextSnapshotHash: true,
        frozenActiveSlotSetEncrypted: true,
        frozenActiveSlotSetHash: true,
        compositeAssessment: {
          select: { formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } } },
        },
      },
    })
    if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    assertFinalOnly(loaded.deliveryMode)
    assertAttemptEpoch(loaded.attemptEpoch, row.attemptEpoch)
    if (!row.compositeItemId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
    const slotKey = compositeItemSlotKey(row.compositeItemId, 'SCALE')
    const slot = readRequiredScaleSlot({
      encrypted: loaded.frozenActiveSlotSetEncrypted,
      storedHash: loaded.frozenActiveSlotSetHash,
      attemptEpoch: row.attemptEpoch,
      slotKey,
      scale: row.scale,
    })
    const compiledRuntimeHash = compiledRuntimeHashFrom(slot, row.compiledRuntimeHash)
    const requiresContext = hasContextSection(loaded.compositeAssessment.formSections)
    if (requiresContext && loaded.contextSnapshotHash === null) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    const context = readCompositeAttemptContext(loaded)
    if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
    return persistAdmission(row.id, createFrozenUnitAdmission({
      attemptEpoch: row.attemptEpoch,
      scale: row.scale,
      principal: {
        userId: row.userId ?? loaded.userId,
        recoveryTokenHash: loaded.recoveryTokenHash,
      },
      parent: {
        kind: 'composite',
        parentId: loaded.id,
        slotKey,
        sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
        compiledRuntimeHash,
      },
      requiresContext,
      contextSnapshotHash: loaded.contextSnapshotHash,
      contextValues: context.context?.values ?? null,
    }))
  }

  return persistAdmission(row.id, createStandaloneScaleAdmission({
    attemptEpoch: row.attemptEpoch,
    userId: row.userId,
    scale: row.scale,
  }))
}
