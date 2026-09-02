import { prisma } from '../../config/database'
import { assertAttemptEpoch, assertFinalOnly, InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { readCompositeAttemptContext } from '../../services/assessmentContextService'
import {
  createFrozenUnitAdmission,
  type FrozenUnitAdmissionV1,
} from '../assessment-runtime/admission-snapshot'
import {
  persistAdmissionOnce,
  readStoredUnitAdmission,
} from '../assessment-runtime/unit-admission'
import { compositeItemSlotKey, getFrozenActiveSlot, type FrozenActiveSlotV1 } from '../assessment-runtime/slot-set'
import { readCognitiveSessionConfig } from './session.service'

const COMPILED_RUNTIME_HASH = /^[0-9a-f]{64}$/
const CONFIG_HASH = /^[0-9a-f]{64}$/

export const UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT = {
  id: true,
  userId: true,
  compositeAttemptId: true,
  compositeItemId: true,
  recoveryTokenHash: true,
  testType: true,
  attemptNo: true,
  status: true,
  deliveryMode: true,
  runtimeGeneration: true,
  compiledRuntimeHash: true,
  configVersion: true,
  configSnapshotEncrypted: true,
  engineVersion: true,
  scoringVersion: true,
  randomSeed: true,
  assignmentId: true,
  resultSnapshotEncrypted: true,
  submissionId: true,
  submissionPayloadHash: true,
  frozenAdmissionSnapshotEncrypted: true,
  frozenAdmissionSnapshotHash: true,
} as const

export type CognitiveAdmissionChildRow = {
  id: string
  userId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  recoveryTokenHash: string | null
  testType: string
  attemptNo: number
  status: string
  deliveryMode: string
  runtimeGeneration: string | null
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
  frozenAdmissionSnapshotEncrypted: string | null
  frozenAdmissionSnapshotHash: string | null
}

const hasContextSection = (sections: Array<{ contextSection: boolean; items: Array<{ contextKey: string | null }> }>): boolean => (
  sections.some((section) => Boolean(section.contextSection) || section.items.some((item) => Boolean(item.contextKey)))
)

const compiledRuntimeHashFrom = (slot: FrozenActiveSlotV1, fallback: string | null): string => {
  const hash = typeof slot.sourceBinding.compiledRuntimeHash === 'string'
    ? slot.sourceBinding.compiledRuntimeHash
    : fallback
  if (!hash || !COMPILED_RUNTIME_HASH.test(hash)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知冻结单元运行时不匹配', 409)
  }
  return hash
}

const configHashFrom = (encrypted: string): string => {
  const stored = readCognitiveSessionConfig(encrypted)
  const hash = stored.snapshot?.configHash
  if (!hash || !CONFIG_HASH.test(hash)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知运行时快照不可用，请重启后重新作答', 409)
  }
  return hash
}

const persistAdmission = async (sessionId: string, snapshot: FrozenUnitAdmissionV1): Promise<FrozenUnitAdmissionV1> => (
  persistAdmissionOnce({
    snapshot,
    writeIfEmpty: (persisted) => prisma.cognitiveSession.updateMany({
      where: { id: sessionId, frozenAdmissionSnapshotHash: null },
      data: persisted,
    }),
    read: () => prisma.cognitiveSession.findUnique({
      where: { id: sessionId },
      select: {
        frozenAdmissionSnapshotEncrypted: true,
        frozenAdmissionSnapshotHash: true,
      },
    }),
    missingMessage: '认知测评记录不存在',
    unreadableMessage: '认知准入快照无法读取，请重启后重新作答',
  })
)

export const readStoredCognitiveAdmission = (
  row: Pick<CognitiveAdmissionChildRow, 'frozenAdmissionSnapshotEncrypted' | 'frozenAdmissionSnapshotHash'>,
): FrozenUnitAdmissionV1 | null => (
  readStoredUnitAdmission(row, '认知准入快照无法读取，请重启后重新作答')
)

export const ensureCognitiveAdmissionAtDelivery = async (sessionId: string): Promise<FrozenUnitAdmissionV1> => {
  const child = await prisma.cognitiveSession.findUnique({
    where: { id: sessionId },
    select: UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT,
  })
  if (!child) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知测评记录不存在', 404)
  if (child.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '认知运行时版本不匹配，请重启测评', 409)
  }
  return activateCognitiveAdmission(child)
}

export const activateCognitiveAdmission = async (row: CognitiveAdmissionChildRow): Promise<FrozenUnitAdmissionV1> => {
  const stored = readStoredCognitiveAdmission(row)
  if (stored) return stored
  assertFinalOnly(row.deliveryMode)
  const configHash = configHashFrom(row.configSnapshotEncrypted)
  const cognitive = {
    testType: row.testType,
    engineVersion: row.engineVersion,
    scoringVersion: row.scoringVersion,
    configHash,
  }

  if (row.compositeAttemptId) {
    const parent = await prisma.compositeAssessmentAttempt.findUnique({
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
    if (!parent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    assertFinalOnly(parent.deliveryMode)
    assertAttemptEpoch(parent.attemptEpoch, row.attemptNo)
    if (!row.compositeItemId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知任务未绑定到当前测评单元', 409)
    const slotKey = compositeItemSlotKey(row.compositeItemId, 'COGNITIVE')
    let slot: FrozenActiveSlotV1
    try {
      slot = getFrozenActiveSlot({
        encrypted: parent.frozenActiveSlotSetEncrypted,
        storedHash: parent.frozenActiveSlotSetHash,
        attemptEpoch: row.attemptNo,
        slotKey,
      })
    } catch (error) {
      throw new InstrumentFinalSubmitError(
        'DEFINITION_MISMATCH',
        error instanceof Error ? error.message : '认知冻结单元不可用',
        409,
      )
    }
    if (slot.unitType !== 'COGNITIVE' || !slot.required || slot.sourceDefinitionIdentity.key !== row.testType) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '认知冻结单元身份不匹配', 409)
    }
    const compiledRuntimeHash = compiledRuntimeHashFrom(slot, row.compiledRuntimeHash)
    const requiresContext = hasContextSection(parent.compositeAssessment.formSections)
    if (requiresContext && parent.contextSnapshotHash === null) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '请先完成并提交人口学上下文区段', 409)
    }
    const context = readCompositeAttemptContext(parent)
    if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
    return persistAdmission(row.id, createFrozenUnitAdmission({
      attemptEpoch: row.attemptNo,
      cognitive,
      principal: {
        userId: row.userId ?? parent.userId,
        recoveryTokenHash: parent.recoveryTokenHash,
      },
      parent: {
        kind: 'composite',
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

  return persistAdmission(row.id, createFrozenUnitAdmission({
    attemptEpoch: row.attemptNo,
    cognitive,
    principal: { userId: row.userId, recoveryTokenHash: row.recoveryTokenHash },
    parent: null,
    requiresContext: false,
  }))
}
