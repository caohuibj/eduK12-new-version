import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import { hashResolvedConfig, readFrozenReport } from '../cognitive/profile-freeze'
import type {
  AnalysisProtocolDefinition,
  CognitiveAnalysisProfile,
  CognitiveDomainKey,
  EvidenceRole,
} from './cognitive-analysis.types'
import { getScaleDimensionEvidenceMapping } from './scale-evidence-mapping.registry'
import { hashScaleDefinition, validateScaleDefinition, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { scaleDefinitionFromRecord } from '../scale/scale-workflow.service'

export interface FrozenProtocolSlotMeasurement {
  slotKey: string
  resolvedConfigHash: string
  resolvedReportHash: string
}

export interface FrozenScaleSlotMeasurement {
  slotKey: string
  scaleId: string
  scaleCode: string
  /** Added by PR23; omitted only by pre-PR23 historical snapshots. */
  instrumentVersion?: string
  scoringVersion?: string
  dimensionCode: string
  scaleDefinitionHash: string
  mappingKey: string
  mappingVersion: string
  mappingDomain: CognitiveDomainKey
  mappingFacet: string
  mappingRole: EvidenceRole
  mappingDirectionClass: 'more_difficulty' | 'more_strength'
  respondentType: 'participant_self_report'
  valueSelector: 'dimensionScore'
}

export interface FrozenAnalysisProtocolSnapshot {
  snapshotVersion: 1 | 2
  protocolKey: string
  protocolVersion: string
  profile: CognitiveAnalysisProfile
  protocolDefinition: AnalysisProtocolDefinition
  cognitiveMeasurements: FrozenProtocolSlotMeasurement[]
  scaleMeasurements?: FrozenScaleSlotMeasurement[]
}

export interface ProtocolCompositeItem {
  type: string
  position: number
  required: boolean
  scaleId?: string | null
  scale?: {
    id?: string | null
    code?: string | null
    name?: string | null
    description?: string | null
    status?: string | null
    visibility?: string | null
    instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE' | null
    instrumentVersion?: string | null
    definitionHash?: string | null
    definition?: unknown
    estimatedTime?: number | null
    instruction?: string | null
    tags?: string[]
  } | null
  cognitiveAssignment?: {
    profile?: string | null
    profileDefinitionVersion?: string | null
    resolvedConfigSnapshotEncrypted?: string | null
    resolvedConfigHash?: string | null
    resolvedReportSnapshotEncrypted?: string | null
    config?: {
      testType: string
      configVersion: string
      engineVersion: string
      scoringVersion: string
      status?: string
    } | null
  } | null
}

function fail(message: string): never {
  throw new Error(message)
}

const scaleDefinitionFor = (
  scale: NonNullable<ProtocolCompositeItem['scale']>,
  slotKey: string,
): ScaleDefinitionV2 => {
  if (scale.definition === undefined || scale.definition === null) {
    fail(`协议量表缺少 ScaleDefinitionV2：${slotKey}`)
  }
  const authoritativeDefinition = scaleDefinitionFromRecord(scale)
  const validation = validateScaleDefinition(scale.definition, {
    instrumentClass: scale.instrumentClass ?? undefined,
  })
  if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
    fail(`协议量表 v2 definition 不完整：${slotKey}`)
  }
  if (
    scale.instrumentClass === 'STANDARD'
    && hashScaleDefinition(validation.definition) !== hashScaleDefinition(authoritativeDefinition)
  ) {
    fail(`协议量表冻结内容不匹配：${slotKey}`)
  }
  return validation.definition
}

const readProfile = (value: string | null | undefined): CognitiveAnalysisProfile => {
  if (value !== 'standard' && value !== 'research') {
    fail('综合分析协议只接受 standard 或 research Profile')
  }
  return value as CognitiveAnalysisProfile
}

export const validateProtocolCompositeItems = (
  protocol: AnalysisProtocolDefinition,
  items: ProtocolCompositeItem[],
  expected?: {
    profile?: CognitiveAnalysisProfile
    measurements?: FrozenProtocolSlotMeasurement[]
    scaleMeasurements?: FrozenScaleSlotMeasurement[]
  },
): {
  profile: CognitiveAnalysisProfile
  measurements: FrozenProtocolSlotMeasurement[]
  scaleMeasurements: FrozenScaleSlotMeasurement[]
} => {
  const allSlots = [
    ...protocol.cognitiveSlots.map((slot) => ({ kind: 'COGNITIVE' as const, slot })),
    ...protocol.scaleSlots.map((slot) => ({ kind: 'SCALE' as const, slot })),
  ].sort((left, right) => left.slot.position - right.slot.position)
  if (items.length !== allSlots.length) {
    fail(`协议模块数量不匹配：需要 ${allSlots.length} 个协议模块`)
  }

  const sortedItems = [...items].sort((a, b) => a.position - b.position)
  const sortedSlots = allSlots
  const expectedBySlot = new Map(
    (expected?.measurements ?? []).map((measurement) => [measurement.slotKey, measurement]),
  )
  const expectedScaleBySlot = new Map(
    (expected?.scaleMeasurements ?? []).map((measurement) => [measurement.slotKey, measurement]),
  )
  if (expected?.measurements && expectedBySlot.size !== protocol.cognitiveSlots.length) {
    fail('协议冻结的任务测量数量不匹配')
  }
  if (expected?.scaleMeasurements && expectedScaleBySlot.size !== protocol.scaleSlots.length) {
    fail('协议冻结的量表测量数量不匹配')
  }

  let commonProfile: CognitiveAnalysisProfile | null = expected?.profile ?? null
  const measurements: FrozenProtocolSlotMeasurement[] = []
  const scaleMeasurements: FrozenScaleSlotMeasurement[] = []

  for (let index = 0; index < sortedSlots.length; index += 1) {
    const { kind, slot } = sortedSlots[index]
    const item = sortedItems[index]
    if (kind === 'SCALE') {
      if (!item || item.type !== 'SCALE' || item.required !== true || item.position !== slot.position) {
        fail(`协议槽位不匹配：${slot.key}`)
      }
      const scaleSlot = slot
      const scale = item.scale
      const scaleId = item.scaleId ?? scale?.id
      const instrumentVersion = scale?.instrumentVersion
      if (
        !scale
        || !scaleId
        || !instrumentVersion
        || scale.id !== undefined && scale.id !== null && scale.id !== scaleId
        || scale.status !== undefined && scale.status !== null && scale.status !== 'PUBLISHED'
        || scale.code !== scaleSlot.expectedScaleCode
      ) {
        fail(`协议量表版本不匹配：${scaleSlot.key}`)
      }
      const scaleDefinition = scaleDefinitionFor(scale, scaleSlot.key)
      const dimension = scaleDefinition.scoring.scores.find((candidate) => candidate.key === scaleSlot.expectedDimensionCode)
      if (!dimension) fail(`协议量表 score key 不匹配：${scaleSlot.key}`)
      const expectedMeasurement = expectedScaleBySlot.get(scaleSlot.key)
      const mapping = expectedMeasurement
        ? {
            mappingKey: expectedMeasurement.mappingKey,
            mappingVersion: expectedMeasurement.mappingVersion,
            scaleCode: expectedMeasurement.scaleCode,
            dimensionCode: expectedMeasurement.dimensionCode,
            domain: expectedMeasurement.mappingDomain,
            facet: expectedMeasurement.mappingFacet,
            role: expectedMeasurement.mappingRole,
            directionClass: expectedMeasurement.mappingDirectionClass,
            respondentType: expectedMeasurement.respondentType,
            valueSelector: expectedMeasurement.valueSelector,
          }
        : getScaleDimensionEvidenceMapping(scaleSlot.mappingKey, scaleSlot.mappingVersion)
      if (
        !mapping
        || mapping.mappingKey !== scaleSlot.mappingKey
        || mapping.mappingVersion !== scaleSlot.mappingVersion
        || mapping.scaleCode !== scaleSlot.expectedScaleCode
        || mapping.dimensionCode !== scaleSlot.expectedDimensionCode
        || !mapping.domain
        || !mapping.facet
        || (mapping.role !== 'primary' && mapping.role !== 'supporting')
        || (mapping.directionClass !== 'more_difficulty' && mapping.directionClass !== 'more_strength')
        || mapping.respondentType !== scaleSlot.respondentType
        || mapping.valueSelector !== scaleSlot.valueSelector
      ) {
        fail(`协议量表 Evidence mapping 不匹配：${scaleSlot.key}`)
      }
      const scaleDefinitionHash = hashScaleDefinition(scaleDefinition)
      const measurement: FrozenScaleSlotMeasurement = {
        slotKey: scaleSlot.key,
        scaleId,
        scaleCode: scaleSlot.expectedScaleCode,
        instrumentVersion,
        scoringVersion: scaleDefinition.scoring.scoringVersion,
        dimensionCode: scaleSlot.expectedDimensionCode,
        scaleDefinitionHash,
        mappingKey: scaleSlot.mappingKey,
        mappingVersion: scaleSlot.mappingVersion,
        mappingDomain: mapping.domain,
        mappingFacet: mapping.facet,
        mappingRole: mapping.role,
        mappingDirectionClass: mapping.directionClass,
        respondentType: scaleSlot.respondentType,
        valueSelector: scaleSlot.valueSelector,
      }
      if (
        expectedMeasurement &&
        (expectedMeasurement.scaleId !== measurement.scaleId
          || expectedMeasurement.scaleCode !== measurement.scaleCode
          || expectedMeasurement.instrumentVersion !== undefined
            && expectedMeasurement.instrumentVersion !== measurement.instrumentVersion
          || expectedMeasurement.scoringVersion !== undefined
            && expectedMeasurement.scoringVersion !== measurement.scoringVersion
          || expectedMeasurement.dimensionCode !== measurement.dimensionCode
          || expectedMeasurement.scaleDefinitionHash !== measurement.scaleDefinitionHash
          || expectedMeasurement.mappingKey !== measurement.mappingKey
          || expectedMeasurement.mappingVersion !== measurement.mappingVersion
          || expectedMeasurement.mappingDomain !== measurement.mappingDomain
          || expectedMeasurement.mappingFacet !== measurement.mappingFacet
          || expectedMeasurement.mappingRole !== measurement.mappingRole
          || expectedMeasurement.mappingDirectionClass !== measurement.mappingDirectionClass
          || expectedMeasurement.respondentType !== measurement.respondentType
          || expectedMeasurement.valueSelector !== measurement.valueSelector)
      ) {
        fail(`协议量表冻结内容不匹配：${scaleSlot.key}`)
      }
      scaleMeasurements.push(measurement)
      continue
    }

    const assignment = item.cognitiveAssignment
    const taskConfig = assignment?.config
    if (
      !item ||
      item.type !== 'COGNITIVE' ||
      item.required !== true ||
      item.position !== slot.position
    ) {
      fail(`协议槽位不匹配：${slot.key}`)
    }
    if (!assignment || !taskConfig) fail(`协议槽位不匹配：${slot.key}`)
    if (
      taskConfig.status !== 'PUBLISHED' ||
      taskConfig.testType !== slot.testType ||
      taskConfig.configVersion !== slot.configVersion ||
      taskConfig.engineVersion !== slot.engineVersion ||
      taskConfig.scoringVersion !== slot.scoringVersion
    ) {
      fail(`协议任务版本不匹配：${slot.key}`)
    }

    const profile = readProfile(assignment.profile)
    if (!protocol.profiles.includes(profile)) fail(`协议不允许 Profile：${profile}`)
    if (commonProfile && commonProfile !== profile) fail('同一分析协议不能混用 Profile')
    commonProfile = profile

    if (
      assignment.profileDefinitionVersion !== slot.profileDefinitionVersion ||
      !assignment.resolvedConfigSnapshotEncrypted ||
      !assignment.resolvedConfigHash ||
      !assignment.resolvedReportSnapshotEncrypted
    ) {
      fail(`协议任务冻结信息不完整：${slot.key}`)
    }

    const resolvedConfig = decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted)
    if (hashResolvedConfig(resolvedConfig) !== assignment.resolvedConfigHash) {
      fail(`协议任务配置 hash 不匹配：${slot.key}`)
    }
    const report = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
    if (
      !report ||
      report.profile !== profile ||
      report.profileDefinitionVersion !== slot.profileDefinitionVersion ||
      report.metricDefinitionVersion !== slot.metricDefinitionVersion ||
      report.qualityDefinitionVersion !== slot.qualityDefinitionVersion ||
      report.reportDefinitionVersion !== slot.reportDefinitionVersion
    ) {
      fail(`协议任务报告冻结版本不匹配：${slot.key}`)
    }

    const measurement: FrozenProtocolSlotMeasurement = {
      slotKey: slot.key,
      resolvedConfigHash: assignment.resolvedConfigHash,
      resolvedReportHash: hashResolvedConfig(report),
    }
    const expectedMeasurement = expectedBySlot.get(slot.key)
    if (
      expectedMeasurement &&
      (expectedMeasurement.resolvedConfigHash !== measurement.resolvedConfigHash ||
        expectedMeasurement.resolvedReportHash !== measurement.resolvedReportHash)
    ) {
      fail(`协议任务冻结内容不匹配：${slot.key}`)
    }
    measurements.push(measurement)
  }

  if (!commonProfile) fail('协议缺少 Profile')
  return { profile: commonProfile, measurements, scaleMeasurements }
}

export const buildFrozenAnalysisProtocolSnapshot = (
  protocol: AnalysisProtocolDefinition,
  items: ProtocolCompositeItem[],
): FrozenAnalysisProtocolSnapshot => {
  const validated = validateProtocolCompositeItems(protocol, items)
  return {
    snapshotVersion: protocol.scaleSlots.length > 0 ? 2 : 1,
    protocolKey: protocol.key,
    protocolVersion: protocol.version,
    profile: validated.profile,
    protocolDefinition: protocol,
    cognitiveMeasurements: validated.measurements,
    ...(protocol.scaleSlots.length > 0 ? { scaleMeasurements: validated.scaleMeasurements } : {}),
  }
}

export const encryptFrozenAnalysisProtocolSnapshot = (
  snapshot: FrozenAnalysisProtocolSnapshot,
): string => encryptCognitivePayload(snapshot)

export const readFrozenAnalysisProtocolSnapshot = (
  encrypted: string,
): FrozenAnalysisProtocolSnapshot => {
  const snapshot = decryptCognitivePayload<FrozenAnalysisProtocolSnapshot>(encrypted)
  if (
    (snapshot?.snapshotVersion !== 1 && snapshot?.snapshotVersion !== 2) ||
    !snapshot.protocolKey ||
    !snapshot.protocolVersion ||
    !snapshot.protocolDefinition ||
    !Array.isArray(snapshot.cognitiveMeasurements)
  ) {
    fail('综合分析协议快照格式无效')
  }
  if (snapshot.snapshotVersion === 2 && !Array.isArray(snapshot.scaleMeasurements)) {
    fail('综合分析协议快照缺少量表测量')
  }
  return snapshot
}

export const validateFrozenAnalysisProtocolSnapshot = (
  snapshot: FrozenAnalysisProtocolSnapshot,
  key: string,
  version: string,
  items: ProtocolCompositeItem[],
): void => {
  if (
    snapshot.protocolKey !== key ||
    snapshot.protocolVersion !== version ||
    snapshot.protocolDefinition.key !== key ||
    snapshot.protocolDefinition.version !== version
  ) {
    fail('综合分析协议快照与模板版本不匹配')
  }
  validateProtocolCompositeItems(snapshot.protocolDefinition, items, {
    profile: snapshot.profile,
    measurements: snapshot.cognitiveMeasurements,
    scaleMeasurements: snapshot.scaleMeasurements,
  })
}
