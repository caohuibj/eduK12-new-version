import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  readCompositeAttemptContext,
  readQuestionnaireAssessmentContext,
} from '../../services/assessmentContextService'
import {
  InstrumentFinalSubmitError,
} from '../../services/instrumentFinalSubmit'
import { isTransientCompletionDatabaseError, toCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
import {
  measureRequestPhase,
  measureRequestPhaseSync,
  recordRequestPhase,
} from '../../services/runtimeObservability'
import {
  buildQuestionnaireCollectionReportFromUnifiedInput,
  collectionReportForStorage,
} from '../reporting/questionnaire-collection-report'
import { buildPackageCognitiveAnalysis } from '../cognitive-analysis/package-analysis.engine'
import {
  readFrozenReportPackageSnapshot,
  type FrozenReportPackageSnapshot,
} from '../cognitive-analysis/report-package-freeze'
import { hashResolvedConfig, readFrozenReport } from '../cognitive/profile-freeze'
import type {
  FrozenCognitiveModuleResult,
  FrozenScaleModuleResult,
} from '../cognitive-analysis/cognitive-analysis.types'
import {
  decryptUnifiedRuntimePayload,
} from './security'
import {
  parseFormSectionCollectionFacts,
  type FormSectionCollectionFactsV1,
} from './form-facts'
import {
  parseStoredCanonicalUnitResult,
  type AssessmentUnitSnapshotPayloadKind,
} from './persistence'
import {
  decryptFrozenActiveSlotSet,
  formSectionSlotKey,
  type FrozenActiveSlotSetV1,
  type FrozenActiveSlotV1,
} from './slot-set'
import type {
  AggregateInputHashEntry,
  AggregateSnapshotHeader,
} from './unified-aggregate'
import {
  buildAggregateInputHash,
  compileBundleRuntimeFromSnapshot,
  evaluateCompleteness,
  UNIFIED_AGGREGATE_HASH_SCHEME,
} from './unified-aggregate'
import { canonicalHash } from './canonical'
import type { CanonicalUnitResultEnvelopeV1, CanonicalUnitResultCoreV1 } from './unit-result'

const unifiedRuntimeGeneration = 'UNIFIED_V1' as const

const snapshotHeaderSelect = {
  id: true,
  attemptEpoch: true,
  slotKey: true,
  unitType: true,
  terminalState: true,
  payloadKind: true,
  sourceType: true,
  sourceAttemptId: true,
  sourceSubmissionId: true,
  sourceDefinitionHash: true,
  compiledRuntimeHash: true,
} as const

const snapshotPayloadSelect = {
  ...snapshotHeaderSelect,
  canonicalResultEncrypted: true,
  collectionFactsEncrypted: true,
} as const

type AggregateSnapshotRow = AggregateSnapshotHeader & {
  id: string
  canonicalResultEncrypted: string | null
  collectionFactsEncrypted: string | null
}

type CanonicalPayload = {
  header: AggregateSnapshotRow
  envelope?: CanonicalUnitResultEnvelopeV1
  facts?: FormSectionCollectionFactsV1
}

type CompletionResult = {
  status: string
  progress: number
  completedAt: Date | null
  replayed?: boolean
}

class AggregateCasLost extends Error {
  constructor() {
    super('Unified aggregate CAS lost')
    this.name = 'AggregateCasLost'
  }
}

const aggregateInputError = (message: string): InstrumentFinalSubmitError => (
  new InstrumentFinalSubmitError('DEFINITION_MISMATCH', `统一聚合输入无效：${message}`, 409)
)

const aggregateSourceError = (message: string): InstrumentFinalSubmitError => (
  new InstrumentFinalSubmitError('STALE_ATTEMPT', `统一聚合输入无法读取：${message}`, 409)
)

const headerFromRow = (row: any): AggregateSnapshotHeader => ({
  id: row.id,
  slotKey: row.slotKey,
  attemptEpoch: row.attemptEpoch,
  unitType: row.unitType,
  terminalState: row.terminalState,
  payloadKind: row.payloadKind,
  sourceType: row.sourceType,
  sourceAttemptId: row.sourceAttemptId,
  sourceSubmissionId: row.sourceSubmissionId,
  sourceDefinitionHash: row.sourceDefinitionHash,
  compiledRuntimeHash: row.compiledRuntimeHash,
})

const withAggregateDefinitionBoundary = <T>(operation: () => T): T => {
  try {
    return operation()
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    throw aggregateInputError(error instanceof Error ? error.message : '快照结构无法验证')
  }
}

const readFrozenSlotSet = (
  row: {
    runtimeGeneration: string | null
    attemptEpoch: number
    frozenActiveSlotSetEncrypted: string | null
    frozenActiveSlotSetHash: string | null
  },
): FrozenActiveSlotSetV1 => withAggregateDefinitionBoundary(() => {
  if (row.runtimeGeneration !== unifiedRuntimeGeneration) throw new Error('parent runtimeGeneration 不是 UNIFIED_V1')
  if (!row.frozenActiveSlotSetEncrypted || !row.frozenActiveSlotSetHash) {
    throw new Error('parent 缺少 FrozenActiveSlotSet')
  }
  const slots = decryptFrozenActiveSlotSet(row.frozenActiveSlotSetEncrypted)
  if (slots.snapshotHash !== row.frozenActiveSlotSetHash) throw new Error('FrozenActiveSlotSet hash 不匹配')
  if (slots.attemptEpoch !== row.attemptEpoch) throw new Error('FrozenActiveSlotSet epoch 不匹配')
  if (slots.runtimeGeneration !== unifiedRuntimeGeneration) throw new Error('FrozenActiveSlotSet runtimeGeneration 不匹配')
  return slots
})

const readAggregateContext = (
  row: { contextSnapshotEncrypted: string | null; contextSnapshotHash: string | null },
  composite: boolean,
) => {
  const context = composite
    ? readCompositeAttemptContext(row)
    : readQuestionnaireAssessmentContext(row)
  if (context.decryptError) throw aggregateSourceError('上下文快照解密失败')
  if (context.hash !== (row.contextSnapshotHash ?? null)) throw aggregateInputError('上下文快照 hash 不匹配')
  return context
}

const validateSnapshotHeader = (
  row: AggregateSnapshotRow,
  slot: FrozenActiveSlotV1,
  attemptEpoch: number,
) => {
  const binding = slot.sourceBinding as Record<string, unknown>
  const expectedPayloadKind: AssessmentUnitSnapshotPayloadKind = slot.unitType === 'FORM_SECTION'
    ? 'COLLECTION_FACTS'
    : 'UNIT_RESULT'
  if (
    row.slotKey !== slot.slotKey
    || row.attemptEpoch !== attemptEpoch
    || row.unitType !== slot.unitType
    || row.terminalState !== 'COMPLETED'
    || row.payloadKind !== expectedPayloadKind
    || row.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash
  ) {
    throw aggregateInputError(`槽位 ${slot.slotKey} 的快照 header 与冻结槽位不匹配`)
  }
  if (slot.unitType !== 'FORM_SECTION') {
    const expectedCompiledRuntimeHash = binding.compiledRuntimeHash
    if (
      typeof expectedCompiledRuntimeHash !== 'string'
      || row.compiledRuntimeHash !== expectedCompiledRuntimeHash
    ) {
      throw aggregateInputError(`槽位 ${slot.slotKey} 的 compiled runtime hash 不匹配`)
    }
  }
}

const validateCanonicalPayload = (input: {
  row: AggregateSnapshotRow
  slot: FrozenActiveSlotV1
  envelope: CanonicalUnitResultEnvelopeV1
  contextHash: string | null
}) => {
  const { row, slot, envelope, contextHash } = input
  const provenance = envelope.persistenceProvenance
  if (
    provenance.sourceAttemptId !== row.sourceAttemptId
    || (provenance.sourceSubmissionId ?? null) !== (row.sourceSubmissionId ?? null)
    || provenance.sourceType !== row.sourceType
  ) {
    throw aggregateInputError(`槽位 ${slot.slotKey} 的持久化 provenance 不匹配`)
  }
  const core = envelope.core
  if (
    core.unitType !== slot.unitType
    || core.instrumentKey !== slot.sourceDefinitionIdentity.key
    || core.instrumentVersion !== slot.sourceDefinitionIdentity.version
    || core.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash
    || core.sourceDefinitionHash !== row.sourceDefinitionHash
    || core.compiledRuntimeHash !== row.compiledRuntimeHash
    || core.contextHash !== contextHash
    || core.scientificProvenance.instrumentKey !== core.instrumentKey
    || core.scientificProvenance.instrumentVersion !== core.instrumentVersion
  ) {
    throw aggregateInputError(`槽位 ${slot.slotKey} 的 canonical result 身份不匹配`)
  }
  return core
}

const validateCollectionFacts = (input: {
  row: AggregateSnapshotRow
  slot: FrozenActiveSlotV1
  facts: FormSectionCollectionFactsV1
}) => {
  const sectionId = (input.slot.sourceBinding as Record<string, unknown>).sectionId
  if (typeof sectionId !== 'string' || input.facts.sectionKey !== sectionId) {
    throw aggregateInputError(`槽位 ${input.slot.slotKey} 的表单区段身份不匹配`)
  }
  if (input.row.collectionFactsEncrypted === null) throw aggregateInputError(`槽位 ${input.slot.slotKey} 缺少 collection facts`)
}

const loadSnapshotHeaders = async (input: {
  parentId: string
  attemptEpoch: number
  composite: boolean
}): Promise<AggregateSnapshotHeader[]> => {
  const where = input.composite
    ? { compositeAttemptId: input.parentId, attemptEpoch: input.attemptEpoch }
    : { questionnaireAssessmentId: input.parentId, attemptEpoch: input.attemptEpoch }
  const rows = await measureRequestPhase('aggregate.load_ms', () => prisma.assessmentUnitSnapshot.findMany({
    where,
    select: snapshotHeaderSelect,
  }))
  return rows.map(headerFromRow)
}

const loadSnapshotPayloads = async (input: {
  parentId: string
  attemptEpoch: number
  composite: boolean
  ids: string[]
}): Promise<AggregateSnapshotRow[]> => {
  const where = input.composite
    ? { compositeAttemptId: input.parentId, attemptEpoch: input.attemptEpoch, id: { in: input.ids } }
    : { questionnaireAssessmentId: input.parentId, attemptEpoch: input.attemptEpoch, id: { in: input.ids } }
  return measureRequestPhase('aggregate.decrypt_ms', () => prisma.assessmentUnitSnapshot.findMany({
    where,
    select: snapshotPayloadSelect,
  })) as Promise<AggregateSnapshotRow[]>
}

const decryptCompletedPayloads = async (input: {
  parentId: string
  attemptEpoch: number
  composite: boolean
  slots: FrozenActiveSlotV1[]
  headers: AggregateSnapshotHeader[]
  contextHash: string | null
}): Promise<{ payloads: CanonicalPayload[]; entries: AggregateInputHashEntry[] }> => {
  const rows = await loadSnapshotPayloads({
    parentId: input.parentId,
    attemptEpoch: input.attemptEpoch,
    composite: input.composite,
    ids: input.headers.map((header) => header.id as string),
  })
  const rowsBySlot = new Map(rows.map((row) => [row.slotKey, row]))
  const payloads: CanonicalPayload[] = []
  const entries: AggregateInputHashEntry[] = []

  for (const slot of input.slots.filter((candidate) => candidate.required)) {
    const rawHeader = input.headers.find((header) => header.slotKey === slot.slotKey)
    const row = rowsBySlot.get(slot.slotKey)
    if (!rawHeader || !row) throw aggregateSourceError(`槽位 ${slot.slotKey} 的快照在 payload 查询中消失`)
    const header = row
    validateSnapshotHeader(header, slot, input.attemptEpoch)
    if (slot.unitType === 'FORM_SECTION') {
      const facts = withAggregateDefinitionBoundary(() => {
        if (!row.collectionFactsEncrypted) throw new Error('collection facts 加密载荷缺失')
        return parseFormSectionCollectionFacts(decryptUnifiedRuntimePayload<unknown>(row.collectionFactsEncrypted))
      })
      validateCollectionFacts({ row, slot, facts })
      const factsHash = canonicalHash(facts)
      payloads.push({ header, facts })
      entries.push({
        slotKey: slot.slotKey,
        terminalState: row.terminalState,
        payloadKind: row.payloadKind,
        collectionFactsHash: factsHash,
        collectionIdentity: {
          sectionKey: facts.sectionKey,
          itemKeys: facts.items.map((item) => item.key).sort(),
        },
      })
      continue
    }

    const envelope = withAggregateDefinitionBoundary(() => {
      if (!row.canonicalResultEncrypted) throw new Error('canonical result 加密载荷缺失')
      return parseStoredCanonicalUnitResult(row.canonicalResultEncrypted)
    })
    validateCanonicalPayload({ row, slot, envelope, contextHash: input.contextHash })
    payloads.push({ header, envelope })
    entries.push({
      slotKey: slot.slotKey,
      terminalState: row.terminalState,
      payloadKind: row.payloadKind,
      resultHash: envelope.resultHash,
    })
  }
  return { payloads, entries }
}

const qualityFlagsFor = (core: CanonicalUnitResultCoreV1): Record<string, boolean> => ({
  interpretable: core.quality.status === 'interpretable',
  ...Object.fromEntries(core.quality.flags.map((flag) => [flag, true])),
})

const metricsRecordFor = (core: CanonicalUnitResultCoreV1): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const metric of core.metrics) {
    if (Object.prototype.hasOwnProperty.call(result, metric.key)) throw aggregateInputError(`指标 key 重复：${metric.key}`)
    result[metric.key] = metric.value
  }
  return result
}

const staticCompositeItemFor = (items: any[], position: number, type: string) => {
  const item = items.find((candidate) => candidate.position === position && candidate.type === type && candidate.required === true)
  if (!item) throw aggregateInputError(`冻结报告包 position ${position} 未绑定必需 ${type} 模块`)
  return item
}

const frozenCompositeSlotFor = (slots: FrozenActiveSlotV1[], itemId: string, unitType: 'SCALE' | 'COGNITIVE') => {
  const slot = slots.find((candidate) => (
    candidate.unitType === unitType
    && (candidate.sourceBinding as Record<string, unknown>).compositeItemId === itemId
  ))
  if (!slot) throw aggregateInputError(`模块 ${itemId} 未绑定冻结 ${unitType} 槽位`)
  return slot
}

const buildCompositePackageAnalysis = (input: {
  parentId: string
  assessmentId: string
  packageSnapshot: FrozenReportPackageSnapshot
  frozenSlots: FrozenActiveSlotV1[]
  items: any[]
  payloads: CanonicalPayload[]
}) => measureRequestPhaseSync('aggregate.compute_ms', () => {
  const protocol = input.packageSnapshot.analysisProtocolSnapshot.protocolDefinition
  const payloadBySlot = new Map(input.payloads.map((payload) => [payload.header.slotKey, payload]))
  const moduleItems = input.items.filter((item) => (item.type === 'SCALE' || item.type === 'COGNITIVE') && item.required === true)
  if (moduleItems.length !== protocol.cognitiveSlots.length + protocol.scaleSlots.length) {
    throw aggregateInputError('冻结报告包模块数量与综合测评实例不一致')
  }

  const moduleResults: FrozenCognitiveModuleResult[] = protocol.cognitiveSlots.map((protocolSlot: any) => {
    const item = staticCompositeItemFor(moduleItems, protocolSlot.position, 'COGNITIVE')
    const frozenSlot = frozenCompositeSlotFor(input.frozenSlots, item.id, 'COGNITIVE')
    const payload = payloadBySlot.get(frozenSlot.slotKey)
    const assignment = item.cognitiveAssignment
    const config = assignment?.config
    if (!payload?.envelope || !assignment || !config) throw aggregateInputError(`认知槽位 ${protocolSlot.key} 冻结输入缺失`)
    const frozenReport = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
    const measurement = input.packageSnapshot.analysisProtocolSnapshot.cognitiveMeasurements.find((candidate) => candidate.slotKey === protocolSlot.key)
    if (
      !frozenReport
      || !measurement
      || assignment.profile !== input.packageSnapshot.profile
      || config.testType !== protocolSlot.testType
      || config.configVersion !== protocolSlot.configVersion
      || config.engineVersion !== protocolSlot.engineVersion
      || config.scoringVersion !== protocolSlot.scoringVersion
      || assignment.resolvedConfigHash !== measurement.resolvedConfigHash
      || payload.envelope.core.scientificProvenance.resolvedConfigHash !== measurement.resolvedConfigHash
      || hashResolvedConfig(frozenReport) !== measurement.resolvedReportHash
      || payload.envelope.core.instrumentKey !== protocolSlot.testType
      || payload.envelope.core.instrumentVersion !== protocolSlot.engineVersion
      || payload.envelope.core.scorerVersion !== protocolSlot.scoringVersion
    ) {
      throw aggregateInputError(`认知槽位 ${protocolSlot.key} 的版本身份不匹配`)
    }
    return {
      slotKey: protocolSlot.key,
      sourceResultId: payload.envelope.persistenceProvenance.sourceAttemptId,
      assignmentId: assignment.id ?? null,
      profile: input.packageSnapshot.profile,
      testType: config.testType,
      configVersion: config.configVersion,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      metrics: metricsRecordFor(payload.envelope.core),
      qualityState: payload.envelope.core.quality.status,
      qualityFlags: qualityFlagsFor(payload.envelope.core),
      frozenReport,
      provenance: { aggregateSource: 'assessment_unit_snapshot' },
    }
  })

  const scaleResults: FrozenScaleModuleResult[] = protocol.scaleSlots.map((protocolSlot: any) => {
    const item = staticCompositeItemFor(moduleItems, protocolSlot.position, 'SCALE')
    const frozenSlot = frozenCompositeSlotFor(input.frozenSlots, item.id, 'SCALE')
    const payload = payloadBySlot.get(frozenSlot.slotKey)
    const measurement = input.packageSnapshot.analysisProtocolSnapshot.scaleMeasurements?.find((candidate) => candidate.slotKey === protocolSlot.key)
    const scale = item.scale
    if (!payload?.envelope || !measurement || !scale) throw aggregateInputError(`量表槽位 ${protocolSlot.key} 冻结输入缺失`)
    const metric = payload.envelope.core.metrics.find((candidate) => candidate.key === measurement.dimensionCode)
    const dimensionScore = metric?.value === null || metric?.value === undefined
      ? null
      : typeof metric.value === 'number' && Number.isFinite(metric.value) ? metric.value : null
    if (
      payload.envelope.core.instrumentKey !== measurement.scaleCode
      || payload.envelope.core.instrumentVersion !== (measurement.instrumentVersion ?? scale.instrumentVersion)
      || payload.envelope.core.sourceDefinitionHash !== measurement.scaleDefinitionHash
      || scale.id !== measurement.scaleId
      || scale.code !== measurement.scaleCode
    ) {
      throw aggregateInputError(`量表槽位 ${protocolSlot.key} 的版本身份不匹配`)
    }
    return {
      slotKey: protocolSlot.key,
      sourceResultId: payload.envelope.persistenceProvenance.sourceAttemptId,
      compositeItemId: item.id,
      scaleId: measurement.scaleId,
      scaleCode: measurement.scaleCode,
      dimensionCode: measurement.dimensionCode,
      scaleDefinitionHash: measurement.scaleDefinitionHash,
      dimensionScore,
      profile: input.packageSnapshot.profile,
      mappingKey: measurement.mappingKey,
      mappingVersion: measurement.mappingVersion,
      respondentType: measurement.respondentType,
      valueSelector: measurement.valueSelector,
      qualityState: payload.envelope.core.quality.status,
      qualityFlags: qualityFlagsFor(payload.envelope.core),
      provenance: { aggregateSource: 'assessment_unit_snapshot' },
    }
  })

  const analysis = buildPackageCognitiveAnalysis({
    packageSnapshot: input.packageSnapshot,
    moduleResults,
    scaleResults,
    attemptId: input.parentId,
    assessmentId: input.assessmentId,
  })
  return { analysis, moduleResults, scaleResults }
})

const parentGuard = (parent: any) => ({
  id: parent.id,
  status: 'IN_PROGRESS' as const,
  runtimeGeneration: unifiedRuntimeGeneration,
  attemptEpoch: parent.attemptEpoch,
  frozenActiveSlotSetHash: parent.frozenActiveSlotSetHash,
  contextSnapshotHash: parent.contextSnapshotHash,
  ...(parent.compiledBundleRuntimeHash === undefined ? {} : { compiledBundleRuntimeHash: parent.compiledBundleRuntimeHash }),
})

const readCasLoser = async (input: {
  parentId: string
  composite: boolean
  attemptEpoch: number
  aggregateInputHash?: string | null
  compiledBundleRuntimeHash?: string | null
}): Promise<CompletionResult> => {
  recordRequestPhase('aggregate.cas_loser', 0)
  const row: any = input.composite
    ? await prisma.compositeAssessmentAttempt.findUnique({
        where: { id: input.parentId },
        select: { status: true, progress: true, completedAt: true, runtimeGeneration: true, attemptEpoch: true, aggregateInputHash: true, compiledBundleRuntimeHash: true },
      })
    : await prisma.questionnaireAssessment.findUnique({
        where: { id: input.parentId },
        select: { status: true, progress: true, completedAt: true, runtimeGeneration: true, attemptEpoch: true, aggregateInputHash: true },
      })
  const sameIdentity = row
    && row.status === 'COMPLETED'
    && row.runtimeGeneration === unifiedRuntimeGeneration
    && row.attemptEpoch === input.attemptEpoch
    && (input.aggregateInputHash == null || row.aggregateInputHash === input.aggregateInputHash)
    && (input.composite && input.compiledBundleRuntimeHash !== undefined
      ? row.compiledBundleRuntimeHash === (input.compiledBundleRuntimeHash ?? null)
      : true)
  if (!sameIdentity) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '统一聚合状态已变化，请重试', 409)
  return {
    status: row.status,
    progress: 100,
    completedAt: row.completedAt,
    replayed: true,
  }
}

const updateIncompleteComposite = async (parent: any, completeness: ReturnType<typeof evaluateCompleteness>) => {
  const updated = await prisma.compositeAssessmentAttempt.updateMany({
    where: parentGuard(parent),
    data: {
      completedItems: completeness.completedSlotCount,
      progress: completeness.progress,
      lastSavedAt: new Date(),
    },
  })
  if (updated.count === 0) {
    return readCasLoser({
      parentId: parent.id,
      composite: true,
      attemptEpoch: parent.attemptEpoch,
      aggregateInputHash: null,
      compiledBundleRuntimeHash: parent.compiledBundleRuntimeHash,
    })
  }
  return { status: 'IN_PROGRESS', progress: completeness.progress, completedAt: null }
}

const updateIncompleteQuestionnaire = async (
  parent: any,
  completeness: ReturnType<typeof evaluateCompleteness>,
  slots: FrozenActiveSlotV1[],
  headers: AggregateSnapshotHeader[],
) => {
  const completedSlotKeys = new Set(
    headers
      .filter((header) => header.attemptEpoch === parent.attemptEpoch && header.terminalState === 'COMPLETED')
      .map((header) => header.slotKey),
  )
  const completedScales = slots.filter((slot) => (
    slot.unitType === 'SCALE' && slot.required && completedSlotKeys.has(slot.slotKey)
  )).length
  const completedForms = slots.filter((slot) => (
    slot.unitType === 'FORM_SECTION' && slot.required && completedSlotKeys.has(slot.slotKey)
  )).length
  const updated = await prisma.questionnaireAssessment.updateMany({
    where: parentGuard(parent),
    data: {
      completedScales: Math.min(completedScales, completeness.completedSlotCount),
      completedForms,
      progress: completeness.progress,
    },
  })
  if (updated.count === 0) {
    return readCasLoser({
      parentId: parent.id,
      composite: false,
      attemptEpoch: parent.attemptEpoch,
      aggregateInputHash: null,
    })
  }
  return { status: 'IN_PROGRESS', progress: completeness.progress, completedAt: null }
}

const finalizeCompositeUnifiedImpl = async (attemptId: string): Promise<CompletionResult | null> => {
  const parent = await measureRequestPhase('aggregate.load_ms', () => prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      startedAt: true,
      completedAt: true,
      progress: true,
      aggregateInputHash: true,
      compiledBundleRuntimeHash: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      compositeAssessment: {
        select: {
          id: true,
          reportPackageKey: true,
          reportPackageVersion: true,
          reportPackageProfile: true,
          reportPackageSnapshotEncrypted: true,
          items: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              type: true,
              position: true,
              required: true,
              scale: { select: { id: true, code: true, name: true, instrumentVersion: true } },
              cognitiveAssignment: {
                select: {
                  id: true,
                  profile: true,
                  resolvedConfigHash: true,
                  resolvedReportSnapshotEncrypted: true,
                  config: { select: { testType: true, configVersion: true, engineVersion: true, scoringVersion: true } },
                },
              },
            },
          },
          formSections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              contextSection: true,
              items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }], select: { id: true, formType: true, formLabel: true, formPlaceholder: true, formOptions: true, contextKey: true, required: true, position: true, formSectionPosition: true } },
            },
          },
        },
      },
    },
  })) as any
  if (!parent) return null
  if (parent.status !== 'IN_PROGRESS') return { status: parent.status, progress: parent.status === 'COMPLETED' ? 100 : parent.progress, completedAt: parent.completedAt }

  const frozenSlots = readFrozenSlotSet(parent)
  const headers = await loadSnapshotHeaders({ parentId: attemptId, attemptEpoch: parent.attemptEpoch, composite: true })
  const completeness = measureRequestPhaseSync('aggregate.compute_per_parent', () => evaluateCompleteness({ slots: frozenSlots.slots, snapshots: headers, attemptEpoch: parent.attemptEpoch }))
  if (completeness.invalidSlotKeys.length > 0) throw aggregateInputError(`存在非法快照槽位：${completeness.invalidSlotKeys.join(',')}`)
  if (!completeness.ready) return updateIncompleteComposite(parent, completeness)

  const context = readAggregateContext(parent, true)
  const completed = await decryptCompletedPayloads({
    parentId: attemptId,
    attemptEpoch: parent.attemptEpoch,
    composite: true,
    slots: frozenSlots.slots,
    headers,
    contextHash: context.hash,
  })
  const payloadBySlot = new Map(completed.payloads.map((payload) => [payload.header.slotKey, payload]))
  let packageSnapshot: FrozenReportPackageSnapshot | null = null
  const assessment = parent.compositeAssessment
  for (const section of assessment.formSections) {
    const slot = frozenSlots.slots.find((candidate) => candidate.slotKey === formSectionSlotKey(section.id))
    const payload = slot ? payloadBySlot.get(slot.slotKey) : undefined
    if (!slot || !payload?.facts) throw aggregateInputError(`综合测评表单区段 ${section.id} 的 collection facts 缺失`)
    validateCompositeFactsAgainstSection(section, payload.facts)
    const expectedDefinitionHash = canonicalHash(compositeSectionDefinition(section))
    if (slot.sourceDefinitionIdentity.hash !== expectedDefinitionHash) {
      throw aggregateInputError(`综合测评表单区段 ${section.id} 定义 hash 不匹配`)
    }
  }
  const packageFields = [assessment.reportPackageKey, assessment.reportPackageVersion, assessment.reportPackageProfile, assessment.reportPackageSnapshotEncrypted]
  if (packageFields.some((value) => value !== null && value !== undefined) && packageFields.some((value) => value === null || value === undefined)) {
    throw aggregateInputError('报告包冻结信息不完整')
  }
  if (assessment.reportPackageSnapshotEncrypted) {
    packageSnapshot = withAggregateDefinitionBoundary(() => readFrozenReportPackageSnapshot(assessment.reportPackageSnapshotEncrypted))
    if (
      packageSnapshot.packageKey !== assessment.reportPackageKey
      || packageSnapshot.packageVersion !== assessment.reportPackageVersion
      || packageSnapshot.profile !== assessment.reportPackageProfile
    ) throw aggregateInputError('报告包实例与冻结快照不匹配')
  }
  const compiledBundleRuntimeHash = packageSnapshot
    ? compileBundleRuntimeFromSnapshot(packageSnapshot).compiledRuntimeHash
    : null
  if (parent.compiledBundleRuntimeHash !== compiledBundleRuntimeHash) throw aggregateInputError('compiled bundle runtime hash 不匹配')
  const aggregateInputHash = buildAggregateInputHash({
    attemptEpoch: parent.attemptEpoch,
    contextHash: context.hash,
    compiledBundleRuntimeHash,
    entries: completed.entries,
  })
  const packageAnalysis = packageSnapshot
    ? buildCompositePackageAnalysis({
        parentId: attemptId,
        assessmentId: assessment.id,
        packageSnapshot,
        frozenSlots: frozenSlots.slots,
        items: assessment.items,
        payloads: completed.payloads,
      })
    : null
  const payloadEncrypted = packageAnalysis
    ? await measureRequestPhase('aggregate.encrypt_ms', async () => (await import('../cognitive/cognitive.security')).encryptCognitivePayload(packageAnalysis.analysis))
    : null
  return persistCompositeCompletion({
    parent,
    frozenSlots,
    contextHash: context.hash,
    compiledBundleRuntimeHash,
    aggregateInputHash,
    packageAnalysis,
    payloadEncrypted,
  })
}

const persistCompositeCompletion = async (input: {
  parent: any
  frozenSlots: FrozenActiveSlotSetV1
  contextHash: string | null
  compiledBundleRuntimeHash: string | null
  aggregateInputHash: string
  packageAnalysis: { analysis: any } | null
  payloadEncrypted: string | null
}): Promise<CompletionResult> => {
  const completedAt = new Date()
  try {
    return await measureRequestPhase('aggregate.persist_ms', () => prisma.$transaction(async (tx) => {
      if (input.packageAnalysis && input.payloadEncrypted) {
        const analysis = input.packageAnalysis.analysis
        await tx.compositeAnalysisSnapshot.upsert({
          where: {
            attemptId_analysisVersion_inputFingerprint: {
              attemptId: input.parent.id,
              analysisVersion: analysis.analysisVersion,
              inputFingerprint: input.aggregateInputHash,
            },
          },
          create: {
            attemptId: input.parent.id,
            packageKey: analysis.packageKey,
            packageVersion: analysis.packageVersion,
            analysisDefinitionVersion: analysis.analysisProtocolVersion,
            analysisVersion: analysis.analysisVersion,
            reportSchemaVersion: analysis.reportSchemaVersion,
            inputFingerprint: input.aggregateInputHash,
            generationReason: 'COMPLETION',
            generatedBy: null,
            payloadEncrypted: input.payloadEncrypted,
            aggregateInputHash: input.aggregateInputHash,
            hashScheme: UNIFIED_AGGREGATE_HASH_SCHEME,
            compiledBundleRuntimeHash: input.compiledBundleRuntimeHash,
            attemptEpoch: input.parent.attemptEpoch,
            contextHash: input.contextHash,
            runtimeGeneration: unifiedRuntimeGeneration,
          },
          update: {},
        })
      }
      const updated = await tx.compositeAssessmentAttempt.updateMany({
        where: parentGuard(input.parent),
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedItems: input.frozenSlots.slots.filter((slot) => slot.required).length,
          completedAt,
          totalTime: Math.max(0, completedAt.getTime() - new Date(input.parent.startedAt).getTime()),
          lastSavedAt: completedAt,
          aggregateInputHash: input.aggregateInputHash,
        },
      })
      if (updated.count !== 1) throw new AggregateCasLost()
      return { status: 'COMPLETED', progress: 100, completedAt }
    }, { isolationLevel: 'ReadCommitted' }))
  } catch (error) {
    if (error instanceof AggregateCasLost) {
      return readCasLoser({
        parentId: input.parent.id,
        composite: true,
        attemptEpoch: input.parent.attemptEpoch,
        aggregateInputHash: input.aggregateInputHash,
        compiledBundleRuntimeHash: input.compiledBundleRuntimeHash,
      })
    }
    if (isTransientCompletionDatabaseError(error)) throw toCompletionAdmissionBusyError(error, 1)
    throw error
  }
}

const questionnaireSectionDefinition = (section: any) => ({
  id: section.id,
  title: section.title,
  description: section.description ?? null,
  position: section.position,
  contextSection: Boolean(section.contextSection) || section.items.some((item: any) => Boolean(item.contextKey)),
  items: [...section.items]
    .sort((left: any, right: any) => (left.sectionPosition ?? left.position) - (right.sectionPosition ?? right.position))
    .map((item: any) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      placeholder: item.placeholder ?? null,
      required: item.required !== false,
      options: item.options,
      contextKey: item.contextKey ?? null,
      position: item.position,
      sectionPosition: item.sectionPosition ?? null,
    })),
})

const compositeSectionDefinition = (section: any) => ({
  id: section.id,
  title: section.title,
  description: section.description ?? null,
  position: section.position,
  contextSection: Boolean(section.contextSection) || section.items.some((item: any) => Boolean(item.contextKey)),
  items: [...section.items]
    .sort((left: any, right: any) => (left.formSectionPosition ?? left.position) - (right.formSectionPosition ?? right.position))
    .map((item: any) => ({
      id: item.id,
      formType: item.formType,
      formLabel: item.formLabel,
      placeholder: item.formPlaceholder ?? null,
      required: item.required !== false,
      formOptions: item.formOptions,
      contextKey: item.contextKey ?? null,
      position: item.position,
      formSectionPosition: item.formSectionPosition ?? null,
    })),
})

const validateQuestionnaireFactsAgainstSection = (section: any, facts: FormSectionCollectionFactsV1) => {
  const expected = new Map(section.items.map((item: any) => [item.id, item.label]))
  if (facts.items.length !== expected.size) throw aggregateInputError(`表单区段 ${section.id} facts 数量不匹配`)
  for (const fact of facts.items) {
    if (!expected.has(fact.key) || expected.get(fact.key) !== fact.label) {
      throw aggregateInputError(`表单区段 ${section.id} facts identity 不匹配`)
    }
  }
}

const validateCompositeFactsAgainstSection = (section: any, facts: FormSectionCollectionFactsV1) => {
  const expected = new Map(section.items.map((item: any) => [item.id, item.formLabel]))
  if (facts.items.length !== expected.size) throw aggregateInputError(`综合测评表单区段 ${section.id} facts 数量不匹配`)
  for (const fact of facts.items) {
    if (!expected.has(fact.key) || expected.get(fact.key) !== fact.label) {
      throw aggregateInputError(`综合测评表单区段 ${section.id} facts identity 不匹配`)
    }
  }
}

const finalizeQuestionnaireUnifiedImpl = async (assessmentId: string): Promise<CompletionResult | null> => {
  const parent = await measureRequestPhase('aggregate.load_ms', () => prisma.questionnaireAssessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      status: true,
      deliveryMode: true,
      runtimeGeneration: true,
      attemptEpoch: true,
      startedAt: true,
      completedAt: true,
      progress: true,
      aggregateInputHash: true,
      contextSnapshotEncrypted: true,
      contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true,
      frozenActiveSlotSetHash: true,
      questionnaire: {
        select: {
          id: true,
          name: true,
          questionnaireScales: {
            orderBy: { position: 'asc' },
            select: { id: true, scaleId: true, position: true, scale: { select: { id: true, code: true, name: true, instrumentVersion: true } } },
          },
          formSections: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              contextSection: true,
              items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }], select: { id: true, type: true, label: true, placeholder: true, required: true, options: true, contextKey: true, position: true, sectionPosition: true } },
            },
          },
        },
      },
    },
  })) as any
  if (!parent) return null
  if (parent.status !== 'IN_PROGRESS') return { status: parent.status, progress: parent.status === 'COMPLETED' ? 100 : parent.progress, completedAt: parent.completedAt }

  const frozenSlots = readFrozenSlotSet(parent)
  const headers = await loadSnapshotHeaders({ parentId: assessmentId, attemptEpoch: parent.attemptEpoch, composite: false })
  const completeness = measureRequestPhaseSync('aggregate.compute_per_parent', () => evaluateCompleteness({ slots: frozenSlots.slots, snapshots: headers, attemptEpoch: parent.attemptEpoch }))
  if (completeness.invalidSlotKeys.length > 0) throw aggregateInputError(`存在非法快照槽位：${completeness.invalidSlotKeys.join(',')}`)
  if (!completeness.ready) return updateIncompleteQuestionnaire(parent, completeness, frozenSlots.slots, headers)

  const context = readAggregateContext(parent, false)
  const completed = await decryptCompletedPayloads({
    parentId: assessmentId,
    attemptEpoch: parent.attemptEpoch,
    composite: false,
    slots: frozenSlots.slots,
    headers,
    contextHash: context.hash,
  })
  const payloadBySlot = new Map(completed.payloads.map((payload) => [payload.header.slotKey, payload]))
  const scaleInputs = parent.questionnaire.questionnaireScales.map((questionnaireScale: any) => {
    const slot = frozenSlots.slots.find((candidate) => (
      candidate.slotKey === `scale:${questionnaireScale.id}`
      && candidate.unitType === 'SCALE'
    ))
    const payload = slot ? payloadBySlot.get(slot.slotKey) : undefined
    if (!slot || !payload?.envelope) throw aggregateInputError(`问卷量表 ${questionnaireScale.id} 的冻结结果缺失`)
    if (
      payload.envelope.core.instrumentKey !== questionnaireScale.scale.code
      || payload.envelope.core.instrumentVersion !== questionnaireScale.scale.instrumentVersion
    ) throw aggregateInputError(`问卷量表 ${questionnaireScale.id} 的身份不匹配`)
    return {
      itemId: questionnaireScale.id,
      scaleId: questionnaireScale.scaleId,
      scaleCode: questionnaireScale.scale.code,
      scaleName: questionnaireScale.scale.name,
      completedAt: payload.envelope.completedAt,
      totalTime: null,
      core: payload.envelope.core,
    }
  })
  const formInputs = parent.questionnaire.formSections.map((section: any) => {
    const slot = frozenSlots.slots.find((candidate) => candidate.slotKey === formSectionSlotKey(section.id))
    const payload = slot ? payloadBySlot.get(slot.slotKey) : undefined
    if (!slot || !payload?.facts) throw aggregateInputError(`问卷表单区段 ${section.id} 的 collection facts 缺失`)
    validateQuestionnaireFactsAgainstSection(section, payload.facts)
    const expectedDefinitionHash = canonicalHash(questionnaireSectionDefinition(section))
    if (slot.sourceDefinitionIdentity.hash !== expectedDefinitionHash) throw aggregateInputError(`问卷表单区段 ${section.id} 定义 hash 不匹配`)
    return { itemId: section.id, facts: payload.facts }
  })
  const report = measureRequestPhaseSync('aggregate.evidence_ms', () => buildQuestionnaireCollectionReportFromUnifiedInput({
    questionnaireName: parent.questionnaire.name,
    scales: scaleInputs,
    formSections: formInputs,
  }))
  const aggregateReportEncrypted = await measureRequestPhase('aggregate.encrypt_ms', async () => (await import('../../utils/encryption')).encryptField(collectionReportForStorage(report)))
  const aggregateInputHash = buildAggregateInputHash({
    attemptEpoch: parent.attemptEpoch,
    contextHash: context.hash,
    entries: completed.entries,
  })
  return persistQuestionnaireCompletion({
    parent,
    frozenSlots,
    aggregateInputHash,
    aggregateReportEncrypted,
  })
}

const persistQuestionnaireCompletion = async (input: {
  parent: any
  frozenSlots: FrozenActiveSlotSetV1
  aggregateInputHash: string
  aggregateReportEncrypted: string
}): Promise<CompletionResult> => {
  const completedAt = new Date()
  try {
    return await measureRequestPhase('aggregate.persist_ms', () => prisma.$transaction(async (tx) => {
      const completedScales = input.frozenSlots.slots.filter((slot) => slot.required && slot.unitType === 'SCALE').length
      const completedForms = input.frozenSlots.slots.filter((slot) => slot.required && slot.unitType === 'FORM_SECTION').length
      const updated = await tx.questionnaireAssessment.updateMany({
        where: parentGuard(input.parent),
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedScales,
          completedForms,
          completedAt,
          totalTime: Math.max(0, completedAt.getTime() - new Date(input.parent.startedAt).getTime()),
          aggregateReport: Prisma.DbNull,
          aggregateReportEncrypted: input.aggregateReportEncrypted,
          aggregateInputHash: input.aggregateInputHash,
        },
      })
      if (updated.count !== 1) throw new AggregateCasLost()
      return { status: 'COMPLETED', progress: 100, completedAt }
    }, { isolationLevel: 'ReadCommitted' }))
  } catch (error) {
    if (error instanceof AggregateCasLost) {
      return readCasLoser({
        parentId: input.parent.id,
        composite: false,
        attemptEpoch: input.parent.attemptEpoch,
        aggregateInputHash: input.aggregateInputHash,
      })
    }
    if (isTransientCompletionDatabaseError(error)) throw toCompletionAdmissionBusyError(error, 1)
    throw error
  }
}

export const finalizeCompositeAttemptUnifiedIfReady = async (attemptId: string) => {
  try {
    return await finalizeCompositeUnifiedImpl(attemptId)
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    if (isTransientCompletionDatabaseError(error)) throw toCompletionAdmissionBusyError(error, 1)
    throw aggregateInputError(error instanceof Error ? error.message : '综合测评聚合失败')
  }
}

export const finalizeQuestionnaireAttemptUnifiedIfReady = async (assessmentId: string) => {
  try {
    return await finalizeQuestionnaireUnifiedImpl(assessmentId)
  } catch (error) {
    if (error instanceof InstrumentFinalSubmitError) throw error
    if (isTransientCompletionDatabaseError(error)) throw toCompletionAdmissionBusyError(error, 1)
    throw aggregateInputError(error instanceof Error ? error.message : '问卷聚合失败')
  }
}
