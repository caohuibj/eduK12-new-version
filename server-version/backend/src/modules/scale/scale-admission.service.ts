import {stableStudyAdmissionHash} from '../anonymous-study/admission-principal'
import { assertTrainingChildSelected, loadTrainingChildAdmissionParent, TRAINING_VARIANT_PARENT_MARKER_SELECT } from '../composite/training-variant-child-scope'
import {readTrainingTimingSnapshot,type TrainingTimingSnapshot} from '../assessment-runtime/training-scale-timing'
import { loadStoredVersionedUnitAdmission } from '../assessment-runtime/unit-admission'
import { withSerializableScaleTransaction } from './deployment/transactions'
import { type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertAttemptEpoch, assertFinalOnly, InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { readCompositeAttemptContext, readQuestionnaireAssessmentContext } from '../../services/assessmentContextService'
import { assertTrainingScaleCollectionAllowed } from './scale-collection-guard'
import {
  createFrozenUnitAdmission,
  frozenAdmissionPersistence,
  type FrozenUnitAdmissionV1,
} from '../assessment-runtime/admission-snapshot'
import {
  createFrozenUnitAdmissionV2,
  versionedFrozenAdmissionPersistence,
  type FrozenUnitAdmissionV2,
  type VersionedFrozenUnitAdmission,
} from '../assessment-runtime/admission-snapshot-v2'
import {
  assertAdmissionParentBinding as assertSharedAdmissionParentBinding,
  persistVersionedAdmissionOnce,
  readStoredVersionedUnitAdmission,
} from '../assessment-runtime/unit-admission'
import { loadFrozenActiveSlot, questionnaireScaleSlotKey, compositeItemSlotKey, type FrozenActiveSlotV1 } from '../assessment-runtime/slot-set'
import { decryptFrozenScaleRuntimeSnapshot, loadFrozenScaleRuntimeSnapshot, FrozenRuntimeStorageUnavailableError, type VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { canonicalHash } from '../assessment-runtime/canonical'
import { ageMonthsAt, assessmentContextKeys, type AssessmentContextValues } from '../assessment-context/context'
import { resolveScaleStartDeployment } from './deployment/service'
import type { ScaleDeploymentModeV1 } from './policy/deployment'
import { evaluateInstrumentEligibility, SCALE_ELIGIBILITY_EVALUATOR_VERSION } from './policy/eligibility'
import type { FrozenEligibilityDecisionV1, ScalePolicyRespondentType } from './policy/types'

const COMPILED_RUNTIME_HASH = /^[0-9a-f]{64}$/
type Db = PrismaClient | Prisma.TransactionClient

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
  answers: true,
  // Completed FINAL replays project the original persisted report from this row.
  result: true,
  progress: true,
  completedAt: true,
  totalTime: true,
  questionnaireAssessmentId: true,
  compositeAttemptId: true,
  compositeItemId: true,
  compositeAttempt: { select: TRAINING_VARIANT_PARENT_MARKER_SELECT },
  scaleId: true,
  subjectUserId: true,
  respondentUserId: true,
  respondentType: true,
  scale: {
    select: {
      id: true,
      code: true,
      name: true,
      instrumentVersion: true,
      instrumentClass: true,
      status: true,
    },
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
  answers: unknown
  questionnaireAssessmentId: string | null
  compositeAttemptId: string | null
  compositeItemId: string | null
  compositeAttempt?: any
  scaleId: string
  subjectUserId: string | null
  respondentUserId: string | null
  respondentType: string | null
  scale: {
    id: string
    code: string
    name: string
    instrumentVersion: string
    instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
    status: string
  }
}

// Composite parent rows are loaded once (load-once admission) and shared by
// the ensure* and activate* steps so a delivery never re-reads the same
// composite attempt row. The unified attempt-state reader holds an already
// loaded superset row and passes it in to skip the redundant read.
export type CompositeScaleAdmissionParent = {
  trainingTimingSnapshot?: unknown
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

const readRequiredScaleSlot = async (input: {
  encrypted: string | null
  storedHash: string | null
  attemptEpoch: number
  slotKey: string
  scale: ScaleAdmissionChildRow['scale']
}, db?: Db): Promise<FrozenActiveSlotV1> => {
  let slot: FrozenActiveSlotV1
  try {
    slot = await loadFrozenActiveSlot({
      encrypted: input.encrypted,
      storedHash: input.storedHash,
      attemptEpoch: input.attemptEpoch,
      slotKey: input.slotKey,
    }, db)
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

/** Legacy helper retained for V1/custom starts and old tests. */
export const standaloneAdmissionPersistence = (input: {
  attemptEpoch: number
  userId: string | null
  scale: NonNullable<FrozenUnitAdmissionV1['scale']>
}) => frozenAdmissionPersistence(createStandaloneScaleAdmission(input))

const readRuntime = (encrypted: string | null): VersionedFrozenScaleRuntimeSnapshot => {
  if (!encrypted) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时不可用，请重启测评', 409)
  try {
    return decryptFrozenScaleRuntimeSnapshot(encrypted)
  } catch (error) {
    throw new InstrumentFinalSubmitError(
      'DEFINITION_MISMATCH',
      error instanceof Error ? error.message : '量表冻结运行时无法读取，请重启测评',
      409,
    )
  }
}

// The authoritative child row is owned by this operation. A weak row-keyed
// memo shares its verified immutable runtime with admission and scoring without
// retaining participant rows or caching authorization across requests. Changing
// the ciphertext invalidates the memo; transaction rereads use distinct rows.
const runtimeByChild = new WeakMap<object, {
  encrypted: string | null
  runtime: VersionedFrozenScaleRuntimeSnapshot
}>()

export const readScaleAdmissionRuntime = (
  row: Pick<ScaleAdmissionChildRow, 'runtimeSnapshotEncrypted'>,
): VersionedFrozenScaleRuntimeSnapshot => {
  const cached = runtimeByChild.get(row)
  if (cached && cached.encrypted === row.runtimeSnapshotEncrypted) return cached.runtime
  const runtime = readRuntime(row.runtimeSnapshotEncrypted)
  runtimeByChild.set(row, { encrypted: row.runtimeSnapshotEncrypted, runtime })
  return runtime
}

// Request-local row memo includes no shared authorization decision. Failed
// lookups are retryable; a changed ciphertext never reuses an earlier result.
const pendingRuntimeByChild = new WeakMap<object, { encrypted: string; promise: Promise<VersionedFrozenScaleRuntimeSnapshot> }>()
export const loadScaleAdmissionRuntime = async (
  row: Pick<ScaleAdmissionChildRow, 'runtimeSnapshotEncrypted'>,
  db?: import('../assessment-runtime/shared-scale-runtime').SharedScaleArtifactDb,
): Promise<VersionedFrozenScaleRuntimeSnapshot> => {
  const encrypted = row.runtimeSnapshotEncrypted
  if (!encrypted) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时不可用，请联系管理员恢复', 409)
  const known = runtimeByChild.get(row)
  if (known?.encrypted === encrypted) return known.runtime
  const pending = pendingRuntimeByChild.get(row)
  if (pending?.encrypted === encrypted) return pending.promise
  const promise = (async () => {
    try {
      const runtime = await loadFrozenScaleRuntimeSnapshot(encrypted, db)
      if (row.runtimeSnapshotEncrypted === encrypted) runtimeByChild.set(row, { encrypted, runtime })
      return runtime
    } catch (error) {
      if (error instanceof FrozenRuntimeStorageUnavailableError) throw error
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH',
        error instanceof Error ? error.message : '量表冻结运行时无法读取，请联系管理员恢复', 409)
    } finally {
      if (pendingRuntimeByChild.get(row)?.encrypted === encrypted) pendingRuntimeByChild.delete(row)
    }
  })()
  pendingRuntimeByChild.set(row, { encrypted, promise }); return promise
}

const availableContextKeys = (values: AssessmentContextValues | null) => (
  values
    ? assessmentContextKeys.filter((key) => values[key] !== undefined)
    : []
)

export const resolveScalePolicyRespondentType = (input: {
  respondentType?: string | null
  subjectUserId?: string | null
  respondentUserId?: string | null
}): ScalePolicyRespondentType | 'UNKNOWN' => {
  const normalized = input.respondentType?.toUpperCase()
  if (normalized === 'PARENT' || normalized === 'TEACHER' || normalized === 'OBSERVER' || normalized === 'CLINICIAN' || normalized === 'SELF') {
    return normalized
  }
  const subject = input.subjectUserId ?? null
  const respondent = input.respondentUserId ?? null
  if ((subject === null && respondent === null) || (subject !== null && subject === respondent)) return 'SELF'
  // A relational binding with an unclassified or asymmetric respondent must
  // never be widened into SELF. Eligibility treats UNKNOWN as indeterminate.
  return 'UNKNOWN'
}

const policyRequiresContext = (runtime: Extract<VersionedFrozenScaleRuntimeSnapshot, { schemaVersion: 2 }>): boolean => {
  const applicability = runtime.compiledPolicy.applicability
  return Boolean(
    applicability.requiredContextKeys.length > 0
    || applicability.subject?.ageMonths
    || (applicability.subject?.grades && applicability.subject.grades.length > 0),
  )
}

const assertReady = <T extends VersionedFrozenUnitAdmission>(snapshot: T): T => {
  if (snapshot.governance.status !== 'READY') {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      snapshot.governance.holdReason ?? '当前量表不满足准入条件',
      409,
    )
  }
  return snapshot
}

export const createScaleAdmissionForRuntime = async (input: {
  db: Db
  attemptEpoch: number
  scale: ScaleAdmissionChildRow['scale']
  principal: FrozenUnitAdmissionV1['principal']
  parent: FrozenUnitAdmissionV1['parent']
  runtime: VersionedFrozenScaleRuntimeSnapshot
  requestedMode: ScaleDeploymentModeV1
  contextSnapshotHash: string | null
  contextValues: AssessmentContextValues | null
  contextFrozenAt: string | null
  contextSubjectUserId?: string | null
  respondentType?: string | null
  subjectUserId?: string | null
  respondentUserId?: string | null
  trainingTiming?: TrainingTimingSnapshot
  legacyRequiresContext?: boolean
}): Promise<VersionedFrozenUnitAdmission> => {
  if (input.runtime.instrumentKey !== input.scale.code || input.runtime.instrumentVersion !== input.scale.instrumentVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结运行时身份不匹配', 409)
  }

  if (input.runtime.schemaVersion === 1) {
    return createFrozenUnitAdmission({
      attemptEpoch: input.attemptEpoch,
      ...(input.trainingTiming ? {trainingTiming:input.trainingTiming} : {}),
      scale: input.scale,
      principal: input.principal,
      parent: input.parent,
      requiresContext: Boolean(input.legacyRequiresContext),
      contextSnapshotHash: input.contextSnapshotHash,
      contextValues: input.contextValues,
    })
  }

  const deployment = await resolveScaleStartDeployment({
    db: input.db,
    scale: input.scale,
    requestedMode: input.requestedMode,
  })
  if (deployment.kind !== 'MANAGED_V2' || !deployment.allowNewStarts) {
    throw new InstrumentFinalSubmitError(
      'STALE_ATTEMPT',
      `量表当前不可启动：${deployment.reasons.join(',') || 'DEPLOYMENT_DENIED'}`,
      409,
    )
  }
  if (deployment.runtimePolicy.runtimePolicyHash !== input.runtime.runtimePolicyHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结策略与当前部署绑定不匹配', 409)
  }

  const resolvedRespondentType = resolveScalePolicyRespondentType({
    respondentType: input.respondentType,
    subjectUserId: input.subjectUserId,
    respondentUserId: input.respondentUserId,
  })
  const eligibility = evaluateInstrumentEligibility(input.runtime.compiledPolicy.applicability, {
    respondentType: resolvedRespondentType,
    subject: {
      ageMonths: input.contextValues?.birthYearMonth && input.contextFrozenAt
        ? ageMonthsAt(input.contextValues.birthYearMonth, new Date(input.contextFrozenAt)) : undefined,
      gradeLevel: input.contextValues?.gradeLevel,
    },
    assessmentContext: input.requestedMode,
    availableContextKeys: availableContextKeys(input.contextValues),
  })
  if (resolvedRespondentType !== 'SELF' && policyRequiresContext(input.runtime)
    && (!input.subjectUserId || input.contextSubjectUserId !== input.subjectUserId)) {
    eligibility.outcome = 'INDETERMINATE'
    eligibility.reasons.push({ code: 'SUBJECT_CONTEXT_UNBOUND', rule: 'Observer context must bind the frozen subject identity' })
  }
  const evaluatedAt = new Date().toISOString()
  const identityBindingHash = canonicalHash({
    instrumentKey: input.scale.code,
    instrumentVersion: input.scale.instrumentVersion,
    sourceDefinitionHash: input.runtime.sourceDefinitionHash,
    compiledRuntimeHash: input.runtime.compiledRuntime.compiledRuntimeHash,
    runtimePolicyHash: input.runtime.runtimePolicyHash,
    deploymentPolicyHash: deployment.deployment.policyHash,
    attemptEpoch: input.attemptEpoch,
    principal: input.principal,
    parent: input.parent,
    subjectUserId: input.subjectUserId ?? null,
    respondentUserId: input.respondentUserId ?? null,
    respondentType: resolvedRespondentType,
  })
  const frozenEligibility: FrozenEligibilityDecisionV1 = {
    schemaVersion: 1,
    evaluatorVersion: SCALE_ELIGIBILITY_EVALUATOR_VERSION,
    policyVersion: input.runtime.compiledPolicy.applicability.policyVersion,
    policyHash: input.runtime.runtimePolicyHash,
    contextHash: input.contextSnapshotHash,
    identityBindingHash,
    contextFrozenAt: input.contextFrozenAt,
    evaluatedAt,
    outcome: eligibility.outcome,
    reasons: eligibility.reasons,
    factProvenance: {
      subject: input.subjectUserId ? 'FROZEN_SUBJECT_BINDING' : 'SELF_SURFACE_SUBJECT',
      respondent: input.respondentUserId ? 'FROZEN_RESPONDENT_BINDING' : 'SELF_SURFACE_RESPONDENT',
      ...(input.contextValues?.ageMonthsAtFreeze !== undefined
        ? { ageBasis: 'birthYearMonth+context.frozenAt/month-precision' }
        : {}),
    },
  }
  const holdReason = eligibility.outcome === 'ELIGIBLE'
    ? null
    : `ELIGIBILITY_${eligibility.outcome}:${eligibility.reasons.map((reason) => reason.code).join(',')}`

  return createFrozenUnitAdmissionV2({
    attemptEpoch: input.attemptEpoch,
    ...(input.trainingTiming ? {trainingTiming:input.trainingTiming} : {}),
    scale: input.scale,
    principal: input.principal,
    parent: input.parent,
    requiresContext: policyRequiresContext(input.runtime),
    contextSnapshotHash: input.contextSnapshotHash,
    contextValues: input.contextValues,
    governance: {
      status: eligibility.outcome === 'ELIGIBLE' ? 'READY' : 'HOLD',
      holdReason,
    },
    scalePolicy: {
      runtimePolicyHash: input.runtime.runtimePolicyHash,
      eligibility: frozenEligibility,
      deployment: {
        revision: deployment.deployment.revision,
        policyHash: deployment.deployment.policyHash,
        basis: 'DEPLOYMENT_IDENTITY',
        evaluatedAt,
        completionDeadline: new Date(Date.parse(evaluatedAt) + (deployment.deployment.policy.completionWindowMs ?? 7 * 24 * 60 * 60 * 1000)).toISOString(),
      },
    },
  })
}

export const standaloneAdmissionPersistenceForRuntime = async (input: {
  db: Db
  attemptEpoch: number
  userId: string
  scale: ScaleAdmissionChildRow['scale']
  runtime: VersionedFrozenScaleRuntimeSnapshot
  contextSnapshotHash: string | null
  contextValues: AssessmentContextValues | null
  contextFrozenAt: string | null
}) => {
  const snapshot = await createScaleAdmissionForRuntime({
    db: input.db,
    attemptEpoch: input.attemptEpoch,
    scale: input.scale,
    principal: { userId: input.userId, questionnaireSessionId: null, recoveryTokenHash: null },
    parent: null,
    runtime: input.runtime,
    requestedMode: 'STANDALONE',
    contextSnapshotHash: input.contextSnapshotHash,
    contextValues: input.contextValues,
    contextFrozenAt: input.contextFrozenAt,
    respondentType: 'SELF',
    subjectUserId: input.userId,
    respondentUserId: input.userId,
  })
  assertReady(snapshot)
  return versionedFrozenAdmissionPersistence(snapshot)
}

const persistAdmission = async <T extends VersionedFrozenUnitAdmission>(
  db: Db,
  assessmentId: string,
  snapshot: T,
): Promise<T> => (
  persistVersionedAdmissionOnce({
    snapshot, db,
    writeIfEmpty: (persisted) => db.assessment.updateMany({
      where: { id: assessmentId, frozenAdmissionSnapshotHash: null },
      data: persisted,
    }),
    read: () => db.assessment.findUnique({
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
  admission: VersionedFrozenUnitAdmission,
): void => assertSharedAdmissionParentBinding(child, admission)

export const ensureScaleAdmissionAtDelivery = async (
  assessmentId: string,
  parent?: CompositeScaleAdmissionParent,
  child?: ScaleAdmissionChildRow,
): Promise<VersionedFrozenUnitAdmission> => {
  const loaded = child ?? await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
  })
  if (!loaded) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表测评记录不存在', 404)
  if (child && child.id !== assessmentId) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表记录与请求身份不匹配', 409)
  }
  if (parent && loaded.compositeAttemptId !== parent.id) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表上级记录与请求身份不匹配', 409)
  }
  if (loaded.runtimeGeneration !== 'UNIFIED_V1') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '量表运行时版本不匹配，请重启测评', 409)
  }
  return activateScaleAdmission(loaded as ScaleAdmissionChildRow, parent)
}

export const readStoredScaleAdmission = (
  row: Pick<ScaleAdmissionChildRow, 'frozenAdmissionSnapshotEncrypted' | 'frozenAdmissionSnapshotHash'>,
): VersionedFrozenUnitAdmission | null => (
  readStoredVersionedUnitAdmission(row, '量表准入快照无法读取，请重启后重新作答')
)
export const loadStoredScaleAdmission = (row: Pick<ScaleAdmissionChildRow, 'frozenAdmissionSnapshotEncrypted' | 'frozenAdmissionSnapshotHash'>, db?:import('../assessment-runtime/shared-control-records').SharedControlDb): Promise<VersionedFrozenUnitAdmission | null> =>
  loadStoredVersionedUnitAdmission(row, '量表准入快照无法读取，请重启后重新作答',db)


const validateStoredAgainstRuntime = async (
  row: ScaleAdmissionChildRow,
  stored: VersionedFrozenUnitAdmission,
  referenceTimeMs = Date.now(),
  db?: import('../assessment-runtime/shared-scale-runtime').SharedScaleArtifactDb,
): Promise<VersionedFrozenUnitAdmission> => {
  assertAdmissionParentBinding(row, stored)
  if (stored.attemptEpoch !== row.attemptEpoch || stored.scale?.id !== row.scale.id
    || stored.scale?.code !== row.scale.code || stored.scale?.instrumentVersion !== row.scale.instrumentVersion
    || (stored.principal.userId !== null && row.userId !== null && stored.principal.userId !== row.userId)) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结准入身份或轮次不匹配', 409)
  }
  const runtime = (await loadScaleAdmissionRuntime(row, db))
  if (runtime.schemaVersion !== stored.schemaVersion) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表运行时与准入快照版本不匹配', 409)
  }
  if (stored.schemaVersion === 2 && runtime.schemaVersion === 2) {
    if (row.status !== 'COMPLETED' && stored.scalePolicy?.deployment?.completionDeadline
      && referenceTimeMs > Date.parse(stored.scalePolicy.deployment.completionDeadline)) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '本轮测评已超过冻结完成期限，请重新开始', 409)
    }
    const identityBindingHash = canonicalHash({
      instrumentKey: row.scale.code, instrumentVersion: row.scale.instrumentVersion,
      sourceDefinitionHash: runtime.sourceDefinitionHash, compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      runtimePolicyHash: runtime.runtimePolicyHash, deploymentPolicyHash: stored.scalePolicy?.deployment?.policyHash,
      attemptEpoch: row.attemptEpoch, principal: stored.principal, parent: stored.parent,
      subjectUserId: row.subjectUserId ?? null, respondentUserId: row.respondentUserId ?? null,
      respondentType: resolveScalePolicyRespondentType(row),
    })
    if (stored.scalePolicy?.deployment && identityBindingHash !== stored.scalePolicy.eligibility.identityBindingHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结身份绑定不匹配', 409)
    }
    if (stored.scalePolicy?.runtimePolicyHash !== runtime.runtimePolicyHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结策略绑定不匹配', 409)
    }
  }
  return assertReady(stored)
}

const activateUnstoredScaleAdmission = async (
  db: Db,
  row: ScaleAdmissionChildRow,
  runtime: VersionedFrozenScaleRuntimeSnapshot,
  parent?: CompositeScaleAdmissionParent,
): Promise<VersionedFrozenUnitAdmission> => {
  if (row.questionnaireAssessmentId) {
    const loadedParent = await db.questionnaireAssessment.findUnique({
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
            type: true,
            questionnaireScales: { select: { id: true, scaleId: true } },
            formSections: { select: { contextSection: true, items: { select: { contextKey: true } } } },
          },
        },
      },
    })
    if (!loadedParent) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '上级测评记录不存在', 404)
    assertFinalOnly(loadedParent.deliveryMode)
    assertAttemptEpoch(loadedParent.attemptEpoch, row.attemptEpoch)
    const binding = loadedParent.questionnaire.questionnaireScales.find((item) => item.scaleId === row.scale.id)
    if (!binding) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
    const slotKey = questionnaireScaleSlotKey(binding.id)
    const slot = await readRequiredScaleSlot({
      encrypted: loadedParent.frozenActiveSlotSetEncrypted,
      storedHash: loadedParent.frozenActiveSlotSetHash,
      attemptEpoch: row.attemptEpoch,
      slotKey,
      scale: row.scale,
    }, db)
    const compiledRuntimeHash = compiledRuntimeHashFrom(slot, row.compiledRuntimeHash)
    if (compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元运行时哈希不匹配', 409)
    }
    const legacyRequiresContext = hasContextSection(loadedParent.questionnaire.formSections)
    const context = readQuestionnaireAssessmentContext(loadedParent)
    if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
    const requestedMode: ScaleDeploymentModeV1 = loadedParent.questionnaire.type === 'GENERAL'
      ? 'PUBLIC_QUESTIONNAIRE'
      : 'QUESTIONNAIRE'
    const snapshot = await createScaleAdmissionForRuntime({
      db,
      attemptEpoch: row.attemptEpoch,
      scale: row.scale,
      principal: {
        userId: row.userId ?? loadedParent.userId,
        questionnaireSessionId: loadedParent.sessionId,
        recoveryTokenHash: loadedParent.resumeTokenHash,
      },
      parent: {
        kind: 'questionnaire',
        parentId: loadedParent.id,
        slotKey,
        sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
        compiledRuntimeHash,
      },
      runtime,
      requestedMode,
      contextSnapshotHash: loadedParent.contextSnapshotHash,
      contextValues: context.context?.values ?? null,
      contextFrozenAt: context.context?.frozenAt ?? null,
      contextSubjectUserId: context.context?.subjectUserId ?? null,
      respondentType: row.respondentType,
      subjectUserId: row.subjectUserId,
      respondentUserId: row.respondentUserId,
      legacyRequiresContext,
    })
    return assertReady(await persistAdmission(db, row.id, assertReady(snapshot)))
  }

  if (row.compositeAttemptId) {
    const scoped = await assertTrainingChildSelected(row, { parent, db })
    const loaded = await loadTrainingChildAdmissionParent(row.compositeAttemptId, scoped, db)
    assertFinalOnly(loaded.deliveryMode)
    assertAttemptEpoch(loaded.attemptEpoch, row.attemptEpoch)
    if (!row.compositeItemId) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表未绑定到当前测评单元', 409)
    const slotKey = compositeItemSlotKey(row.compositeItemId, 'SCALE')
    const slot = await readRequiredScaleSlot({
      encrypted: loaded.frozenActiveSlotSetEncrypted,
      storedHash: loaded.frozenActiveSlotSetHash,
      attemptEpoch: row.attemptEpoch,
      slotKey,
      scale: row.scale,
    }, db)
    const compiledRuntimeHash = compiledRuntimeHashFrom(slot, row.compiledRuntimeHash)
    if (compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash) {
      throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '量表冻结单元运行时哈希不匹配', 409)
    }
    const legacyRequiresContext = hasContextSection(loaded.compositeAssessment.formSections)
    const context = readCompositeAttemptContext(loaded)
    if (context.decryptError) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '人口学上下文无法读取，请联系管理员', 500)
    const snapshot = await createScaleAdmissionForRuntime({
      db,
      attemptEpoch: row.attemptEpoch,
      scale: row.scale,
      principal: {
        userId: row.userId ?? loaded.userId,
        questionnaireSessionId: null,
        recoveryTokenHash: await stableStudyAdmissionHash(db,loaded.id,loaded.recoveryTokenHash,row.userId ?? loaded.userId),
      },
      parent: {
        kind: 'composite',
        parentId: loaded.id,
        slotKey,
        sourceDefinitionHash: slot.sourceDefinitionIdentity.hash,
        compiledRuntimeHash,
      },
      runtime,
      requestedMode: 'COMPOSITE',
      ...(loaded.trainingTimingSnapshot ? {trainingTiming:readTrainingTimingSnapshot(loaded.trainingTimingSnapshot)!} : {}),
      contextSnapshotHash: loaded.contextSnapshotHash,
      contextValues: context.context?.values ?? null,
      contextFrozenAt: context.context?.frozenAt ?? null,
      contextSubjectUserId: context.context?.subjectUserId ?? null,
      respondentType: row.respondentType,
      subjectUserId: row.subjectUserId,
      respondentUserId: row.respondentUserId,
      legacyRequiresContext,
    })
    return assertReady(await persistAdmission(db, row.id, assertReady(snapshot)))
  }

  const snapshot = await createScaleAdmissionForRuntime({
    db,
    attemptEpoch: row.attemptEpoch,
    scale: row.scale,
    principal: { userId: row.userId, questionnaireSessionId: null, recoveryTokenHash: null },
    parent: null,
    runtime,
    requestedMode: 'STANDALONE',
    contextSnapshotHash: null,
    contextValues: null,
    contextFrozenAt: null,
    respondentType: 'SELF',
    subjectUserId: row.userId,
    respondentUserId: row.userId,
    legacyRequiresContext: false,
  })
  return assertReady(await persistAdmission(db, row.id, assertReady(snapshot)))
}

export const activateScaleAdmission = async (
  row: ScaleAdmissionChildRow,
  parent?: CompositeScaleAdmissionParent,
  referenceTimeMs = Date.now(),
): Promise<VersionedFrozenUnitAdmission> => {
  parent = await assertTrainingChildSelected(row, { parent }) ?? parent
  const stored = await loadStoredScaleAdmission(row)
  if (stored) return (await validateStoredAgainstRuntime(row, stored, referenceTimeMs))
  assertFinalOnly(row.deliveryMode)
  const runtime = (await loadScaleAdmissionRuntime(row))
  if (runtime.schemaVersion === 1) return prisma.$transaction(async tx=>{
    await assertTrainingScaleCollectionAllowed(tx,[row.scaleId],{compositeAttemptId:row.compositeAttemptId,compositeItemIds:row.compositeItemId?[row.compositeItemId]:[]})
    return activateUnstoredScaleAdmission(tx,row,runtime,parent)
  })

  return withSerializableScaleTransaction(prisma,
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "assessments" WHERE "id" = ${row.id} FOR UPDATE`
      const current = await tx.assessment.findUnique({ where: { id: row.id }, select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
      if (!current || current.attemptEpoch !== row.attemptEpoch) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '测评轮次已改变', 409)
      const winner = await loadStoredScaleAdmission(current,tx)
      if (winner) return (await validateStoredAgainstRuntime(current, winner, referenceTimeMs, tx))
      await assertTrainingScaleCollectionAllowed(tx,[current.scaleId],{compositeAttemptId:current.compositeAttemptId,compositeItemIds:current.compositeItemId?[current.compositeItemId]:[]})
      // Load the parent inside this transaction, never use a pre-transaction context.
      return activateUnstoredScaleAdmission(tx, current, (await loadScaleAdmissionRuntime(current, tx)))
    },
  )
}
