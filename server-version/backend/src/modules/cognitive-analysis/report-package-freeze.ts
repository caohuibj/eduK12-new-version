import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import type { CognitiveAnalysisProfile, AnalysisProtocolDefinition } from './cognitive-analysis.types'
import type { ScaleProtocolSlotDefinition } from './cognitive-analysis.types'
import {
  buildFrozenAnalysisProtocolSnapshot,
  readFrozenAnalysisProtocolSnapshot,
  validateFrozenAnalysisProtocolSnapshot,
  type FrozenAnalysisProtocolSnapshot,
  type FrozenScaleSlotMeasurement,
  type ProtocolCompositeItem,
} from './protocol-freeze'
import type { ReportPackageDefinition } from './report-package.registry'
import type { MentalHealthBundleDefinition } from '../mental-health-bundle'
import { hashScaleDefinition } from '../scale/scale-definition'
import { scaleDefinitionFromRecord } from '../scale/scale-workflow.service'

export interface FrozenReportPackageSnapshot {
  snapshotVersion: 1 | 2
  packageKey: string
  packageVersion: string
  profile: CognitiveAnalysisProfile
  packageDefinition: ReportPackageDefinition
  analysisProtocolSnapshot: FrozenAnalysisProtocolSnapshot
  analysisEngineKey?: 'cognitive-v1' | 'mental-health-rule-v1'
  bundleDefinitionSnapshot?: MentalHealthBundleDefinition
}

const fail = (message: string): never => {
  throw new Error(message)
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

const sameDefinition = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))

const assertPackageProtocol = (
  definition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
) => {
  if (
    definition.analysisProtocolKey !== protocol.key
    || definition.analysisProtocolVersion !== protocol.version
  ) {
    fail('报告包与内部分析定义版本不匹配')
  }
}

export const buildFrozenReportPackageSnapshot = (
  definition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  items: ProtocolCompositeItem[],
): FrozenReportPackageSnapshot => {
  assertPackageProtocol(definition, protocol)
  const analysisProtocolSnapshot = buildFrozenAnalysisProtocolSnapshot(protocol, items)
  return {
    snapshotVersion: analysisProtocolSnapshot.snapshotVersion,
    packageKey: definition.key,
    packageVersion: definition.version,
    profile: analysisProtocolSnapshot.profile,
    packageDefinition: definition,
    analysisProtocolSnapshot,
    analysisEngineKey: definition.analysisEngineKey ?? 'cognitive-v1',
  }
}

const isMentalHealthPackage = (definition: ReportPackageDefinition): boolean => (
  definition.analysisEngineKey === 'mental-health-rule-v1'
)

const mentalBundleDefinitionFor = (definition: ReportPackageDefinition): MentalHealthBundleDefinition => {
  if (!definition.bundleDefinition || typeof definition.bundleDefinition !== 'object') {
    fail('Mental health 报告包缺少 Bundle definition')
  }
  return definition.bundleDefinition as MentalHealthBundleDefinition
}

const mentalProtocolFor = (
  definition: ReportPackageDefinition,
  bundle: MentalHealthBundleDefinition,
): AnalysisProtocolDefinition => {
  const scaleSlots: ScaleProtocolSlotDefinition[] = bundle.scaleSlots.map((slot) => {
    const first = slot.mappings[0]
    if (!first) fail(`Mental health Bundle slot 缺少首个 mapping：${slot.key}`)
    return {
      key: slot.key,
      label: slot.label,
      position: slot.position,
      required: true,
      mappingKey: first.mappingKey,
      mappingVersion: first.mappingVersion,
      expectedScaleCode: slot.expectedScaleCode,
      expectedDimensionCode: first.scoreKey,
      respondentType: slot.respondentType,
      valueSelector: 'score',
      evidenceMappings: slot.mappings,
      expectedInstrumentVersion: slot.expectedInstrumentVersion,
    }
  })
  return {
    key: definition.analysisProtocolKey,
    version: definition.analysisProtocolVersion,
    status: definition.status,
    name: definition.name,
    description: definition.description,
    recommendedForCreate: false,
    profiles: [...definition.profiles],
    estimatedMinutes: {
      standard: [...definition.estimatedMinutes.standard],
      research: [...definition.estimatedMinutes.research],
    },
    cognitiveSlots: [],
    scaleSlots,
    outputDomains: [],
    domainDefinitionVersion: 'not-applicable',
    evidenceMappingVersion: bundle.evidenceMappingVersion,
    recommendationRuleVersion: bundle.ruleSetVersion,
  }
}

const mentalScaleMeasurementFor = (
  slot: MentalHealthBundleDefinition['scaleSlots'][number],
  item: ProtocolCompositeItem | undefined,
): FrozenScaleSlotMeasurement => {
  const scale = item?.scale
  const scaleId = item?.scaleId
  if (!item || item.type !== 'SCALE' || item.required !== true || !scale || !scaleId) {
    fail(`Bundle 槽位未绑定必需量表：${slot.key}`)
  }
  const resolvedItem = item as ProtocolCompositeItem & { scale: NonNullable<ProtocolCompositeItem['scale']>; scaleId: string }
  const resolvedScale = scale as NonNullable<ProtocolCompositeItem['scale']>
  const instrumentVersion = resolvedScale.instrumentVersion
  if (
    resolvedScale.id && resolvedScale.id !== resolvedItem.scaleId
    || resolvedScale.code !== slot.expectedScaleCode
    || resolvedScale.status !== 'PUBLISHED'
    || !instrumentVersion
  ) {
    fail(`Bundle 槽位量表版本不匹配：${slot.key}`)
  }
  const frozenInstrumentVersion = typeof instrumentVersion === 'string'
    ? instrumentVersion
    : fail(`Bundle 槽位 instrumentVersion 缺失：${slot.key}`)
  if (slot.expectedInstrumentVersion && instrumentVersion !== slot.expectedInstrumentVersion) {
    fail(`Bundle 槽位 instrumentVersion 不匹配：${slot.key}`)
  }
  const definition = scaleDefinitionFromRecord(resolvedScale)
  const scoreKeys = new Set(definition.scoring.scores.map((score) => score.key))
  for (const mapping of slot.mappings) {
    if (!scoreKeys.has(mapping.scoreKey)) fail(`Bundle 槽位 score key 不匹配：${slot.key}/${mapping.scoreKey}`)
  }
  const first = slot.mappings[0]
  if (!first) fail(`Bundle 槽位没有 mapping：${slot.key}`)
  return {
    slotKey: slot.key,
    scaleId: resolvedItem.scaleId,
    scaleCode: slot.expectedScaleCode,
    instrumentVersion: frozenInstrumentVersion,
    scoringVersion: definition.scoring.scoringVersion,
    dimensionCode: first.scoreKey,
    scaleDefinitionHash: hashScaleDefinition(definition),
    mappingKey: first.mappingKey,
    mappingVersion: first.mappingVersion,
    // These legacy fields are retained for the shared snapshot envelope; the
    // mental-health engine reads evidenceMappings as its authoritative list.
    mappingDomain: 'processing_speed',
    mappingFacet: first.facet ?? first.construct,
    mappingRole: 'supporting',
    mappingDirectionClass: first.direction === 'higher_is_better' ? 'more_strength' : 'more_difficulty',
    respondentType: slot.respondentType,
    valueSelector: 'score',
    evidenceMappings: slot.mappings.map((mapping) => ({ ...mapping })),
  }
}

/**
 * Build the generic Bundle package envelope. The synthetic protocol-shaped
 * view exists only to share the existing immutable composite snapshot table;
 * Bundle rules and all multi-score mappings remain authoritative in the
 * Bundle definition snapshot.
 */
export const buildFrozenMentalHealthBundlePackageSnapshot = (
  definition: ReportPackageDefinition,
  items: ProtocolCompositeItem[],
  profile: CognitiveAnalysisProfile = 'standard',
): FrozenReportPackageSnapshot => {
  if (!isMentalHealthPackage(definition)) fail('报告包不是 mental-health-rule-v1')
  const bundle = mentalBundleDefinitionFor(definition)
  if (!definition.profiles.includes(profile)) fail(`Bundle 不允许 Profile：${profile}`)
  const protocolDefinition = mentalProtocolFor(definition, bundle)
  const slots = [...bundle.scaleSlots].sort((left, right) => left.position - right.position)
  if (items.length !== slots.length) fail(`Bundle 模块数量不匹配：需要 ${slots.length} 个模块`)
  const itemsByPosition = new Map(items.map((item) => [item.position, item]))
  const scaleMeasurements = slots.map((slot) => mentalScaleMeasurementFor(slot, itemsByPosition.get(slot.position)))
  const analysisProtocolSnapshot: FrozenAnalysisProtocolSnapshot = {
    snapshotVersion: 2,
    protocolKey: definition.analysisProtocolKey,
    protocolVersion: definition.analysisProtocolVersion,
    profile,
    protocolDefinition,
    cognitiveMeasurements: [],
    scaleMeasurements,
  }
  return {
    snapshotVersion: 2,
    packageKey: definition.key,
    packageVersion: definition.version,
    profile,
    packageDefinition: definition,
    analysisProtocolSnapshot,
    analysisEngineKey: 'mental-health-rule-v1',
    bundleDefinitionSnapshot: JSON.parse(JSON.stringify(bundle)) as MentalHealthBundleDefinition,
  }
}

export const encryptFrozenReportPackageSnapshot = (snapshot: FrozenReportPackageSnapshot): string =>
  encryptCognitivePayload(snapshot)

export const readFrozenReportPackageSnapshot = (encrypted: string): FrozenReportPackageSnapshot => {
  const snapshot = decryptCognitivePayload<FrozenReportPackageSnapshot>(encrypted)
  if (
    (snapshot?.snapshotVersion !== 1 && snapshot?.snapshotVersion !== 2)
    || !snapshot.packageKey
    || !snapshot.packageVersion
    || !snapshot.packageDefinition
    || !snapshot.analysisProtocolSnapshot
  ) {
    fail('报告包快照格式无效')
  }
  const packageEngineKey = snapshot.packageDefinition.analysisEngineKey ?? 'cognitive-v1'
  if (packageEngineKey === 'mental-health-rule-v1') {
    if (snapshot.analysisEngineKey !== 'mental-health-rule-v1' || !snapshot.bundleDefinitionSnapshot) {
      fail('Mental health 报告包快照缺少一致的 Bundle definition')
    }
  } else if (snapshot.analysisEngineKey === 'mental-health-rule-v1') {
    fail('Cognitive 报告包快照不能声明 mental-health engine')
  }
  return snapshot
}

export const validateFrozenReportPackageSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
  definition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition | undefined,
  items: ProtocolCompositeItem[],
): void => {
  if (
    snapshot.packageKey !== definition.key
    || snapshot.packageVersion !== definition.version
    || !sameDefinition(snapshot.packageDefinition, definition)
  ) {
    fail('报告包快照与当前包版本不匹配')
  }
  if (isMentalHealthPackage(definition)) {
    if (
      snapshot.analysisEngineKey !== 'mental-health-rule-v1'
      || !snapshot.bundleDefinitionSnapshot
      || !sameDefinition(snapshot.bundleDefinitionSnapshot, mentalBundleDefinitionFor(definition))
    ) {
      fail('Mental health 报告包 Bundle definition 快照不匹配')
    }
    const rebuilt = buildFrozenMentalHealthBundlePackageSnapshot(definition, items, snapshot.profile)
    if (!sameDefinition(snapshot.analysisProtocolSnapshot, rebuilt.analysisProtocolSnapshot)) {
      fail('Mental health 报告包冻结 Scale slot 不匹配')
    }
    return
  }
  const resolvedProtocol = protocol ?? fail('报告包缺少内部分析协议')
  assertPackageProtocol(definition, resolvedProtocol)
  validateFrozenAnalysisProtocolSnapshot(
    snapshot.analysisProtocolSnapshot,
    resolvedProtocol.key,
    resolvedProtocol.version,
    items,
  )
  if (snapshot.profile !== snapshot.analysisProtocolSnapshot.profile) {
    fail('报告包快照 Profile 不匹配')
  }
}

export const readFrozenAnalysisSnapshotFromPackage = (
  encrypted: string,
): FrozenAnalysisProtocolSnapshot => readFrozenReportPackageSnapshot(encrypted).analysisProtocolSnapshot

export const readLegacyOrPackageSnapshot = (encrypted: string): FrozenAnalysisProtocolSnapshot => {
  try {
    return readFrozenAnalysisSnapshotFromPackage(encrypted)
  } catch {
    return readFrozenAnalysisProtocolSnapshot(encrypted)
  }
}
