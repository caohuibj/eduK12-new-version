import {
  hashResolvedConfig,
  type FrozenReportSnapshot,
} from '../cognitive/profile-freeze'
import type {
  AnalysisProtocolDefinition,
  CognitiveDomainConsistency,
  CognitiveDomainKey,
  CognitiveDomainResult,
  CognitiveMetricInterpretation,
  CognitivePackageAnalysisResult,
  CognitiveAnalysisProfile,
  CognitiveProtocolSlotDefinition,
  FrozenScaleModuleResult,
  ScaleProtocolSlotDefinition,
  EvidenceDirectionClass,
  EvidenceInterpretation,
  EvidenceItem,
  EvidenceValue,
  FrozenCognitiveModuleResult,
} from './cognitive-analysis.types'
import {
  COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
  COGNITIVE_ANALYSIS_VERSION,
  MULTISOURCE_ANALYSIS_REPORT_SCHEMA_VERSION,
  MULTISOURCE_ANALYSIS_VERSION,
} from './cognitive-analysis.types'
import {
  buildRecommendations,
  COGNITIVE_RECOMMENDATION_RULE_VERSION,
  LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
} from './recommendation.registry'
import {
  getCognitiveDomainDefinition,
  hasCognitiveDomainDefinitionVersion,
} from './domain.registry'
import {
  hasCognitiveEvidenceMappingVersion,
  listCognitiveEvidenceMappingsForTask,
} from './evidence-mapping.registry'
import type { ReportPackageDefinition } from './report-package.registry'
import type { FrozenReportPackageSnapshot } from './report-package-freeze'
import type { FrozenScaleSlotMeasurement } from './protocol-freeze'

export interface BuildPackageCognitiveAnalysisInput {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults: FrozenCognitiveModuleResult[]
  scaleResults?: FrozenScaleModuleResult[]
  attemptId?: string
  assessmentId?: string
}

export class CognitivePackageAnalysisInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitivePackageAnalysisInputError'
  }
}

const fail = (message: string): never => {
  throw new CognitivePackageAnalysisInputError(message)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const requireNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} 缺失`)
  return value as string
}

const isCognitiveProfile = (value: unknown): value is CognitiveAnalysisProfile =>
  value === 'standard' || value === 'research'

type CognitiveQualityState = NonNullable<FrozenCognitiveModuleResult['qualityState']>

const isCognitiveQualityState = (value: unknown): value is CognitiveQualityState =>
  value === 'interpretable' || value === 'limited' || value === 'invalid'

const COMPATIBILITY_QUALITY_KEYS = new Set(['interpretable', 'legacyUninterpretable'])

const qualityStateFor = (
  result: FrozenCognitiveModuleResult,
  label: string,
): CognitiveQualityState => {
  const qualityState = result.qualityState
  if (qualityState !== undefined && !isCognitiveQualityState(qualityState)) {
    fail(`冻结任务 qualityState 无效：${label}`)
  }
  const interpretable = result.qualityFlags.interpretable
  if (typeof interpretable !== 'boolean') {
    fail(`冻结任务 interpretable quality flag 无效：${label}`)
  }
  if (qualityState !== undefined && interpretable !== (qualityState === 'interpretable')) {
    fail(`冻结任务 qualityState 与 interpretable quality flag 不一致：${label}`)
  }
  return qualityState ?? (interpretable ? 'interpretable' : 'limited')
}

type ScaleQualityState = NonNullable<FrozenScaleModuleResult['qualityState']>

const isScaleQualityState = (value: unknown): value is ScaleQualityState =>
  value === 'interpretable' || value === 'limited' || value === 'invalid'

const scaleQualityStateFor = (
  result: FrozenScaleModuleResult,
  label: string,
): ScaleQualityState => {
  const qualityState = result.qualityState
  if (qualityState !== undefined && !isScaleQualityState(qualityState)) {
    fail(`冻结量表 qualityState 无效：${label}`)
  }
  const interpretable = result.qualityFlags.interpretable
  if (typeof interpretable !== 'boolean') {
    fail(`冻结量表 interpretable quality flag 无效：${label}`)
  }
  if (qualityState !== undefined && interpretable !== (qualityState === 'interpretable')) {
    fail(`冻结量表 qualityState 与 interpretable quality flag 不一致：${label}`)
  }
  const resolved = qualityState ?? (interpretable ? 'interpretable' : 'limited')
  if (resolved === 'interpretable' && result.dimensionScore === null) {
    fail(`冻结量表 interpretable 结果缺少 dimensionScore：${label}`)
  }
  return resolved
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/

const PR7_BUILT_IN_PACKAGE_CONTRACTS = new Map<string, {
  protocolKey: string
  protocolVersion: string
  packageReportDefinitionVersion: string
  domainDefinitionVersion: string
  evidenceMappingVersion: string
  recommendationRuleVersion: string
}>([
  'attention_stability_v1',
  'inhibitory_control_v1',
  'working_memory_v1',
  'executive_control_v1',
  'learning_reasoning_v1',
  'k12_core_profile_v1',
].map((key) => [`${key}@1.0.0`, {
  protocolKey: key,
  protocolVersion: '1.0.0',
  packageReportDefinitionVersion: 'report-package-v1',
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
}]))

const PR10_MULTISOURCE_PACKAGE_KEY = 'inhibitory_control_multisource_v1'
const PR10_MULTISOURCE_PACKAGE_VERSION = '1.0.0'
const PR10_BUILT_IN_PACKAGE_CONTRACT = {
  protocolKey: PR10_MULTISOURCE_PACKAGE_KEY,
  protocolVersion: PR10_MULTISOURCE_PACKAGE_VERSION,
  packageReportDefinitionVersion: 'report-package-v1',
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: COGNITIVE_RECOMMENDATION_RULE_VERSION,
}

const validateCognitiveSlot = (value: unknown, label: string): CognitiveProtocolSlotDefinition => {
  if (!isRecord(value)) fail(`${label} 格式无效`)
  const slot = value as Record<string, unknown>
  const requiredStrings = [
    'key',
    'label',
    'testType',
    'configVersion',
    'engineVersion',
    'scoringVersion',
    'profileDefinitionVersion',
    'metricDefinitionVersion',
    'qualityDefinitionVersion',
    'reportDefinitionVersion',
  ] as const
  for (const field of requiredStrings) requireNonEmptyString(slot[field], `${label} ${field}`)
  if (!Number.isInteger(slot.position) || (slot.position as number) < 0) {
    fail(`${label} position 无效`)
  }
  if (slot.required !== true) fail(`${label} 必须是 required`)
  return value as unknown as CognitiveProtocolSlotDefinition
}

const validateScaleSlot = (value: unknown, label: string): ScaleProtocolSlotDefinition => {
  if (!isRecord(value)) fail(`${label} 格式无效`)
  const slot = value as Record<string, unknown>
  for (const field of [
    'key',
    'label',
    'mappingKey',
    'mappingVersion',
    'expectedScaleCode',
    'expectedDimensionCode',
    'respondentType',
    'valueSelector',
  ]) {
    requireNonEmptyString(slot[field], `${label} ${field}`)
  }
  if (!Number.isInteger(slot.position) || (slot.position as number) < 0) fail(`${label} position 无效`)
  if (slot.required !== true) fail(`${label} 必须是 required`)
  if (slot.respondentType !== 'participant_self_report' || slot.valueSelector !== 'dimensionScore') {
    fail(`${label} respondent/value selector 无效`)
  }
  return value as unknown as ScaleProtocolSlotDefinition
}

const canonicalSlotValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalSlotValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalSlotValue(entry)]),
    )
  }
  return value
}

const sameSlots = (
  left: Array<CognitiveProtocolSlotDefinition | ScaleProtocolSlotDefinition>,
  right: Array<CognitiveProtocolSlotDefinition | ScaleProtocolSlotDefinition>,
): boolean => left.length === right.length && left.every((slot, index) => {
  const candidate = right[index]
  return Boolean(candidate)
    && JSON.stringify(canonicalSlotValue(slot)) === JSON.stringify(canonicalSlotValue(candidate))
})

const sortedByPosition = <T extends { position: number }>(items: T[]): T[] =>
  [...items].sort((left, right) => left.position - right.position)

const validatePackageSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
): {
  packageDefinition: ReportPackageDefinition
  protocol: AnalysisProtocolDefinition
  measurementsBySlot: Map<string, { resolvedConfigHash: string; resolvedReportHash: string }>
  scaleMeasurementsBySlot: Map<string, FrozenScaleSlotMeasurement>
} => {
  if (!isRecord(snapshot) || (snapshot.snapshotVersion !== 1 && snapshot.snapshotVersion !== 2)) {
    fail('冻结报告包快照版本无效')
  }
  const packageKey = requireNonEmptyString(snapshot.packageKey, '冻结报告包 packageKey')
  const packageVersion = requireNonEmptyString(snapshot.packageVersion, '冻结报告包 packageVersion')
  if (!isCognitiveProfile(snapshot.profile)) fail('报告包不允许 experience Profile')
  if (!isRecord(snapshot.packageDefinition) || !Array.isArray(snapshot.packageDefinition.slots)) {
    fail('冻结报告包定义格式无效')
  }
  const packageDefinition = snapshot.packageDefinition as unknown as ReportPackageDefinition
  if (packageDefinition.key !== packageKey || packageDefinition.version !== packageVersion) {
    fail('冻结报告包外层与包定义的 key/version 不匹配')
  }
  const builtInContract = PR7_BUILT_IN_PACKAGE_CONTRACTS.get(`${packageKey}@${packageVersion}`)
    ?? (packageKey === PR10_MULTISOURCE_PACKAGE_KEY && packageVersion === PR10_MULTISOURCE_PACKAGE_VERSION
      ? PR10_BUILT_IN_PACKAGE_CONTRACT
      : fail('报告包不是支持的内置精确版本'))
  const isMultisource = packageKey === PR10_MULTISOURCE_PACKAGE_KEY
  if (isMultisource && snapshot.snapshotVersion !== 2) fail('跨来源报告包必须使用版本 2 快照')
  if (!isMultisource && snapshot.snapshotVersion !== 1) fail('认知-only 报告包必须使用版本 1 快照')
  if (
    packageDefinition.analysisProtocolKey !== builtInContract.protocolKey ||
    packageDefinition.analysisProtocolVersion !== builtInContract.protocolVersion ||
    packageDefinition.reportDefinitionVersion !== builtInContract.packageReportDefinitionVersion
  ) {
    fail('冻结报告包的 protocol/report definition 版本不匹配')
  }
  if (!Array.isArray(packageDefinition.profiles) || !packageDefinition.profiles.includes(snapshot.profile)) {
    fail('冻结报告包不允许该 Profile')
  }
  if (packageDefinition.profiles.some((profile) => !isCognitiveProfile(profile))) {
    fail('冻结报告包包含非法 Profile')
  }
  const packageCognitiveSlots: CognitiveProtocolSlotDefinition[] = []
  const packageScaleSlots: ScaleProtocolSlotDefinition[] = []
  for (const [index, slot] of packageDefinition.slots.entries()) {
    if (!isRecord(slot)) fail(`PR7 不接受含 scale slot 的报告包：slots[${index}]`)
    const rawSlot = slot as unknown as Record<string, unknown>
    if (typeof rawSlot.testType === 'string') {
      packageCognitiveSlots.push(validateCognitiveSlot(rawSlot, `冻结报告包 slots[${index}]`))
    } else if (isMultisource && typeof rawSlot.expectedScaleCode === 'string') {
      packageScaleSlots.push(validateScaleSlot(rawSlot, `冻结报告包 slots[${index}]`))
    } else {
      fail(`PR7 不接受含 scale slot 的报告包：slots[${index}]`)
    }
  }
  const sortedPackageSlots = sortedByPosition([...packageCognitiveSlots, ...packageScaleSlots])

  const protocolSnapshot = snapshot.analysisProtocolSnapshot
  if (!isRecord(protocolSnapshot) || (protocolSnapshot.snapshotVersion !== 1 && protocolSnapshot.snapshotVersion !== 2)) {
    fail('冻结报告包缺少有效的冻结分析协议')
  }
  if (
    protocolSnapshot.protocolKey !== packageDefinition.analysisProtocolKey ||
    protocolSnapshot.protocolVersion !== packageDefinition.analysisProtocolVersion ||
    protocolSnapshot.profile !== snapshot.profile
  ) {
    fail('报告包与冻结分析协议的 key/version/Profile 不匹配')
  }

  if (!isRecord(protocolSnapshot.protocolDefinition)) fail('冻结分析协议定义格式无效')
  const protocol = protocolSnapshot.protocolDefinition as unknown as AnalysisProtocolDefinition
  if (
    protocol.key !== protocolSnapshot.protocolKey ||
    protocol.version !== protocolSnapshot.protocolVersion
  ) {
    fail('冻结分析协议外层与协议定义的 key/version 不匹配')
  }
  if (!Array.isArray(protocol.profiles) || !protocol.profiles.includes(snapshot.profile)) {
    fail('分析协议不允许该 Profile')
  }
  if (protocol.profiles.some((profile) => !isCognitiveProfile(profile))) {
    fail('冻结分析协议包含非法 Profile')
  }
  if (!Array.isArray(protocol.cognitiveSlots)) fail('冻结分析协议 cognitiveSlots 格式无效')
  if (!Array.isArray(protocol.scaleSlots)) fail('冻结分析协议 scaleSlots 格式无效')
  if (isMultisource && protocol.scaleSlots.length === 0) fail('跨来源报告包缺少 scale slot')
  if (!isMultisource && protocol.scaleSlots.length > 0) fail('PR7 不接受含 scale slot 的分析协议')
  const protocolCognitiveSlots = sortedByPosition(
    protocol.cognitiveSlots.map((slot, index) =>
      validateCognitiveSlot(slot, `冻结分析协议 cognitiveSlots[${index}]`)),
  )
  const protocolScaleSlots = sortedByPosition(
    protocol.scaleSlots.map((slot, index) =>
      validateScaleSlot(slot, `冻结分析协议 scaleSlots[${index}]`)),
  )
  const protocolAllSlots = sortedByPosition([...protocolCognitiveSlots, ...protocolScaleSlots])
  if (!sameSlots(sortedPackageSlots, protocolAllSlots)) {
    fail('报告包槽位与内部分析协议槽位不完全一致')
  }
  const slotKeys = new Set<string>()
  const positions = new Set<number>()
  const testTypes = new Set<string>()
  for (const slot of protocolAllSlots) {
    if (slotKeys.has(slot.key)) fail(`冻结分析协议槽位重复：${slot.key}`)
    if (positions.has(slot.position)) fail(`冻结分析协议槽位 position 重复：${slot.position}`)
    if ('testType' in slot && testTypes.has(slot.testType)) fail(`冻结分析协议任务重复：${slot.testType}`)
    slotKeys.add(slot.key)
    positions.add(slot.position)
    if ('testType' in slot) testTypes.add(slot.testType)
  }
  if (protocolAllSlots.some((slot, index) => slot.position !== index)) {
    fail('冻结分析协议槽位 position 必须从 0 连续排列')
  }
  if (
    protocol.domainDefinitionVersion !== builtInContract.domainDefinitionVersion ||
    !hasCognitiveDomainDefinitionVersion(protocol.domainDefinitionVersion)
  ) {
    fail('冻结分析协议引用不支持的 Domain definition 版本')
  }
  if (
    protocol.evidenceMappingVersion !== builtInContract.evidenceMappingVersion ||
    !hasCognitiveEvidenceMappingVersion(protocol.evidenceMappingVersion)
  ) {
    fail('冻结分析协议引用不支持的 Evidence mapping 版本')
  }
  const supportedRecommendationRuleVersions = isMultisource
    ? new Set([
        builtInContract.recommendationRuleVersion,
        COGNITIVE_RECOMMENDATION_RULE_VERSION,
        LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
      ])
    : new Set([LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION])
  if (!supportedRecommendationRuleVersions.has(protocol.recommendationRuleVersion)) {
    fail('冻结分析协议引用不支持的 recommendation rule 版本')
  }
  if (!Array.isArray(protocol.outputDomains) || protocol.outputDomains.length === 0) {
    fail('冻结分析协议 outputDomains 格式无效')
  }
  const outputDomains = new Set<string>()
  for (const domain of protocol.outputDomains) {
    if (typeof domain !== 'string' || outputDomains.has(domain)) {
      fail(`冻结分析协议 outputDomain 无效或重复：${String(domain)}`)
    }
    outputDomains.add(domain)
    if (!getCognitiveDomainDefinition(domain as CognitiveDomainKey, protocol.domainDefinitionVersion)) {
      fail(`冻结分析协议引用未知 Domain：${domain}`)
    }
  }

  const measurements = protocolSnapshot.cognitiveMeasurements
  if (!Array.isArray(measurements) || measurements.length !== protocolCognitiveSlots.length) {
    fail('冻结报告包的任务测量数量不匹配')
  }
  const measurementKeys = new Set<string>()
  const measurementsBySlot = new Map<string, { resolvedConfigHash: string; resolvedReportHash: string }>()
  for (const measurement of measurements) {
    if (!isRecord(measurement)) fail('冻结报告包任务测量格式无效')
    const slotKey = requireNonEmptyString(measurement.slotKey, '冻结任务测量 slotKey')
    if (measurementKeys.has(slotKey)) fail(`冻结任务测量重复：${slotKey}`)
    measurementKeys.add(slotKey)
    if (!SHA256_PATTERN.test(String(measurement.resolvedConfigHash))) {
      fail(`冻结任务测量 config hash 无效：${slotKey}`)
    }
    if (!SHA256_PATTERN.test(String(measurement.resolvedReportHash))) {
      fail(`冻结任务测量 report hash 无效：${slotKey}`)
    }
    measurementsBySlot.set(slotKey, {
      resolvedConfigHash: measurement.resolvedConfigHash as string,
      resolvedReportHash: measurement.resolvedReportHash as string,
    })
  }
  for (const slot of protocolCognitiveSlots) {
    if (!measurementKeys.has(slot.key)) fail(`冻结报告包缺少任务测量：${slot.key}`)
  }

  const scaleMeasurements = protocolSnapshot.scaleMeasurements
  if (isMultisource && (!Array.isArray(scaleMeasurements) || scaleMeasurements.length !== protocolScaleSlots.length)) {
    fail('冻结报告包的量表测量数量不匹配')
  }
  if (!isMultisource && scaleMeasurements !== undefined && scaleMeasurements.length > 0) {
    fail('认知-only 报告包不应包含量表测量')
  }
  const scaleMeasurementsBySlot = new Map<string, FrozenScaleSlotMeasurement>()
  for (const rawMeasurement of scaleMeasurements ?? []) {
    if (!isRecord(rawMeasurement)) fail('冻结报告包量表测量格式无效')
    const slotKey = requireNonEmptyString(rawMeasurement.slotKey, '冻结量表测量 slotKey')
    if (scaleMeasurementsBySlot.has(slotKey)) fail(`冻结量表测量重复：${slotKey}`)
    const scaleId = requireNonEmptyString(rawMeasurement.scaleId, `冻结量表测量 scaleId：${slotKey}`)
    const scaleCode = requireNonEmptyString(rawMeasurement.scaleCode, `冻结量表测量 scaleCode：${slotKey}`)
    const dimensionCode = requireNonEmptyString(rawMeasurement.dimensionCode, `冻结量表测量 dimensionCode：${slotKey}`)
    const scaleDefinitionHash = requireNonEmptyString(rawMeasurement.scaleDefinitionHash, `冻结量表测量 definition hash：${slotKey}`)
    if (!SHA256_PATTERN.test(scaleDefinitionHash)) fail(`冻结量表测量 definition hash 无效：${slotKey}`)
    const instrumentVersion = rawMeasurement.instrumentVersion === undefined
      ? undefined
      : requireNonEmptyString(rawMeasurement.instrumentVersion, `冻结量表测量 instrumentVersion：${slotKey}`)
    const scoringVersion = rawMeasurement.scoringVersion === undefined
      ? undefined
      : requireNonEmptyString(rawMeasurement.scoringVersion, `冻结量表测量 scoringVersion：${slotKey}`)
    const mappingKey = requireNonEmptyString(rawMeasurement.mappingKey, `冻结量表测量 mappingKey：${slotKey}`)
    const mappingVersion = requireNonEmptyString(rawMeasurement.mappingVersion, `冻结量表测量 mappingVersion：${slotKey}`)
    const mappingDomain = requireNonEmptyString(rawMeasurement.mappingDomain, `冻结量表测量 mappingDomain：${slotKey}`)
    const mappingFacet = requireNonEmptyString(rawMeasurement.mappingFacet, `冻结量表测量 mappingFacet：${slotKey}`)
    const mappingDomainDefinition = getCognitiveDomainDefinition(
      mappingDomain as CognitiveDomainKey,
      protocol.domainDefinitionVersion,
    )
    if (
      !mappingDomainDefinition
      || !protocol.outputDomains.includes(mappingDomain as CognitiveDomainKey)
      || !mappingDomainDefinition.facets.some((facet) => facet.key === mappingFacet)
    ) {
      fail(`冻结量表测量 mappingDomain 无效：${slotKey}`)
    }
    if (rawMeasurement.mappingRole !== 'primary' && rawMeasurement.mappingRole !== 'supporting') {
      fail(`冻结量表测量 mappingRole 无效：${slotKey}`)
    }
    if (rawMeasurement.mappingDirectionClass !== 'more_difficulty' && rawMeasurement.mappingDirectionClass !== 'more_strength') {
      fail(`冻结量表测量 mappingDirectionClass 无效：${slotKey}`)
    }
    if (rawMeasurement.respondentType !== 'participant_self_report' || rawMeasurement.valueSelector !== 'dimensionScore') {
      fail(`冻结量表测量 respondent/value selector 无效：${slotKey}`)
    }
    const slot = protocolScaleSlots.find((candidate) => candidate.key === slotKey)
    if (
      !slot
      || slot.expectedScaleCode !== scaleCode
      || slot.expectedDimensionCode !== dimensionCode
      || slot.mappingKey !== mappingKey
      || slot.mappingVersion !== mappingVersion
    ) {
      fail(`冻结量表测量与协议槽位不匹配：${slotKey}`)
    }
    scaleMeasurementsBySlot.set(slotKey, {
      slotKey,
      scaleId,
      scaleCode,
      ...(instrumentVersion !== undefined ? { instrumentVersion } : {}),
      ...(scoringVersion !== undefined ? { scoringVersion } : {}),
      dimensionCode,
      scaleDefinitionHash,
      mappingKey,
      mappingVersion,
      mappingDomain: mappingDomain as CognitiveDomainKey,
      mappingFacet,
      mappingRole: rawMeasurement.mappingRole,
      mappingDirectionClass: rawMeasurement.mappingDirectionClass,
      respondentType: 'participant_self_report',
      valueSelector: 'dimensionScore',
    })
  }
  for (const slot of protocolScaleSlots) {
    if (!scaleMeasurementsBySlot.has(slot.key)) fail(`冻结报告包缺少量表测量：${slot.key}`)
  }

  return { packageDefinition, protocol, measurementsBySlot, scaleMeasurementsBySlot }
}

const validateFrozenReport = (
  report: FrozenReportSnapshot,
  moduleResult: FrozenCognitiveModuleResult,
  slot: {
    profileDefinitionVersion: string
    metricDefinitionVersion: string
    qualityDefinitionVersion: string
    reportDefinitionVersion: string
  },
  expectedReportHash: string,
): void => {
  if (!report || !isRecord(report)) fail(`冻结报告缺失：${moduleResult.slotKey}`)
  if (report.profile !== moduleResult.profile) fail(`任务 Profile 不匹配：${moduleResult.slotKey}`)
  if (
    report.profileDefinitionVersion !== slot.profileDefinitionVersion ||
    report.metricDefinitionVersion !== slot.metricDefinitionVersion ||
    report.qualityDefinitionVersion !== slot.qualityDefinitionVersion ||
    report.reportDefinitionVersion !== slot.reportDefinitionVersion
  ) {
    fail(`任务冻结报告版本不匹配：${moduleResult.slotKey}`)
  }
  if (
    !isRecord(report.metricDefinitions) ||
    !isRecord(report.qualityDefinitions) ||
    !isRecord(report.reportDefinition)
  ) {
    fail(`任务冻结报告定义不完整：${moduleResult.slotKey}`)
  }
  if (
    !Array.isArray(report.reportCaveats) ||
    report.reportCaveats.some((caveat) => typeof caveat !== 'string')
  ) {
    fail(`任务冻结报告 caveat 格式无效：${moduleResult.slotKey}`)
  }
  if (hashResolvedConfig(report) !== expectedReportHash) {
    fail(`任务冻结报告 hash 不匹配：${moduleResult.slotKey}`)
  }
}

const validateModuleResults = (
  results: FrozenCognitiveModuleResult[],
  slots: CognitiveProtocolSlotDefinition[],
  profile: CognitiveAnalysisProfile,
  measurementsBySlot: Map<string, { resolvedConfigHash: string; resolvedReportHash: string }>,
): Map<string, FrozenCognitiveModuleResult> => {
  if (!Array.isArray(results) || results.length !== slots.length) {
    fail(`冻结任务结果数量不匹配：需要 ${slots.length} 个任务结果`)
  }
  const bySlot = new Map<string, FrozenCognitiveModuleResult>()
  for (const result of results) {
    if (!result || !isRecord(result)) fail('冻结任务结果格式无效')
    const slotKey = requireNonEmptyString(result.slotKey, '冻结任务结果 slotKey')
    if (bySlot.has(slotKey)) fail(`冻结任务结果重复：${slotKey}`)
    const slot = slots.find((candidate) => candidate.key === slotKey)
    if (!slot) return fail(`冻结任务结果包含未知槽位：${slotKey}`)
    if (!isCognitiveProfile(result.profile) || result.profile !== profile) {
      fail(`冻结任务结果 Profile 不匹配：${slotKey}`)
    }
    if (result.testType !== slot.testType) fail(`任务 testType 不匹配：${slotKey}`)
    if (
      result.configVersion !== slot.configVersion ||
      result.engineVersion !== slot.engineVersion ||
      result.scoringVersion !== slot.scoringVersion
    ) {
      fail(`任务版本不匹配：${slotKey}`)
    }
    requireNonEmptyString(result.sourceResultId, `冻结任务 sourceResultId：${slotKey}`)
    if (!isRecord(result.metrics) || !isRecord(result.qualityFlags)) {
      fail(`冻结任务 metrics/qualityFlags 格式无效：${slotKey}`)
    }
    qualityStateFor(result, slotKey)
    if (
      result.provenance !== undefined &&
      !isRecord(result.provenance)
    ) {
      fail(`冻结任务 provenance 格式无效：${slotKey}`)
    }
    if (
      result.metricInterpretations !== undefined &&
      !isRecord(result.metricInterpretations)
    ) {
      fail(`冻结任务 metricInterpretations 格式无效：${slotKey}`)
    }
    const measurement = measurementsBySlot.get(slotKey)
      ?? fail(`冻结任务缺少 measurement：${slotKey}`)
    validateFrozenReport(result.frozenReport, result, slot, measurement.resolvedReportHash)
    for (const [qualityKey, value] of Object.entries(result.qualityFlags)) {
      if (typeof value !== 'boolean') fail(`冻结任务 quality flag 不是 boolean：${slotKey}/${qualityKey}`)
      if (
        !COMPATIBILITY_QUALITY_KEYS.has(qualityKey) &&
        !Object.prototype.hasOwnProperty.call(result.frozenReport.qualityDefinitions, qualityKey)
      ) {
        fail(`冻结任务包含未知 quality flag：${slotKey}/${qualityKey}`)
      }
    }
    bySlot.set(slotKey, result)
  }
  for (const slot of slots) {
    if (!bySlot.has(slot.key)) fail(`冻结任务结果缺少槽位：${slot.key}`)
  }
  return bySlot
}

const validateScaleResults = (
  results: FrozenScaleModuleResult[] | undefined,
  slots: ScaleProtocolSlotDefinition[],
  profile: CognitiveAnalysisProfile,
  measurementsBySlot: Map<string, FrozenScaleSlotMeasurement>,
): Map<string, FrozenScaleModuleResult> => {
  const normalizedResults = results ?? []
  if ((slots.length > 0 && !Array.isArray(results)) || normalizedResults.length !== slots.length) {
    fail(`冻结量表结果数量不匹配：需要 ${slots.length} 个量表结果`)
  }
  const bySlot = new Map<string, FrozenScaleModuleResult>()
  for (const result of normalizedResults) {
    if (!result || !isRecord(result)) fail('冻结量表结果格式无效')
    const slotKey = requireNonEmptyString(result.slotKey, '冻结量表结果 slotKey')
    if (bySlot.has(slotKey)) fail(`冻结量表结果重复：${slotKey}`)
    const slot = slots.find((candidate) => candidate.key === slotKey)
      ?? fail(`冻结量表结果包含未知槽位：${slotKey}`)
    if (result.profile !== profile) fail(`冻结量表结果 Profile 不匹配：${slotKey}`)
    requireNonEmptyString(result.sourceResultId, `冻结量表 sourceResultId：${slotKey}`)
    requireNonEmptyString(result.scaleId, `冻结量表 scaleId：${slotKey}`)
    requireNonEmptyString(result.scaleCode, `冻结量表 scaleCode：${slotKey}`)
    requireNonEmptyString(result.dimensionCode, `冻结量表 dimensionCode：${slotKey}`)
    requireNonEmptyString(result.scaleDefinitionHash, `冻结量表 definition hash：${slotKey}`)
    const measurement = measurementsBySlot.get(slotKey)
      ?? fail(`冻结量表缺少 measurement：${slotKey}`)
    if (
      result.scaleId !== measurement.scaleId
      || result.scaleCode !== measurement.scaleCode
      || result.dimensionCode !== measurement.dimensionCode
      || result.scaleDefinitionHash !== measurement.scaleDefinitionHash
    ) {
      fail(`冻结量表结果与 measurement 不匹配：${slotKey}`)
    }
    if (result.mappingKey !== slot.mappingKey || result.mappingVersion !== slot.mappingVersion) {
      fail(`冻结量表 mapping 版本不匹配：${slotKey}`)
    }
    if (result.respondentType !== slot.respondentType || result.valueSelector !== slot.valueSelector) {
      fail(`冻结量表 respondent/value selector 不匹配：${slotKey}`)
    }
    if (result.dimensionScore !== null && (typeof result.dimensionScore !== 'number' || !Number.isFinite(result.dimensionScore))) {
      fail(`冻结量表 dimensionScore 格式无效：${slotKey}`)
    }
    if (!isRecord(result.qualityFlags)) fail(`冻结量表 qualityFlags 格式无效：${slotKey}`)
    for (const [qualityKey, value] of Object.entries(result.qualityFlags)) {
      if (typeof value !== 'boolean') fail(`冻结量表 quality flag 不是 boolean：${slotKey}/${qualityKey}`)
    }
    scaleQualityStateFor(result, slotKey)
    if (result.provenance !== undefined) {
      if (!isRecord(result.provenance)) fail(`冻结量表 provenance 格式无效：${slotKey}`)
      validateProvenance(result.provenance, slotKey, true)
    }
    bySlot.set(slotKey, result)
  }
  for (const slot of slots) {
    if (!bySlot.has(slot.key)) fail(`冻结量表结果缺少槽位：${slot.key}`)
  }
  return bySlot
}

const isEvidenceInterpretation = (value: unknown): value is EvidenceInterpretation =>
  value === 'descriptive' || value === 'criterion' || value === 'reference' || value === 'self_report'

const isEvidenceDirectionClass = (value: unknown): value is EvidenceDirectionClass =>
  value === 'more_difficulty' ||
  value === 'more_strength' ||
  value === 'neutral' ||
  value === 'unknown'

const SYSTEM_PROVENANCE_KEYS = new Set([
  'packageKey',
  'packageVersion',
  'packageSnapshotVersion',
  'packageReportDefinitionVersion',
  'resolvedConfigHash',
  'resolvedReportHash',
  'analysisProtocolKey',
  'analysisProtocolVersion',
  'analysisProtocolSnapshotVersion',
  'domainDefinitionVersion',
  'evidenceMappingVersion',
  'recommendationRuleVersion',
  'analysisVersion',
  'reportSchemaVersion',
  'profile',
  'slotKey',
  'sourceResultId',
  'testType',
  'configVersion',
  'engineVersion',
  'scoringVersion',
  'profileDefinitionVersion',
  'metricDefinitionVersion',
  'qualityDefinitionVersion',
  'reportDefinitionVersion',
  'mappingMetricDefinitionVersion',
  'assignmentId',
  'attemptId',
  'assessmentId',
])

const validateProvenance = (
  provenance: Record<string, unknown>,
  label: string,
  rejectSystemKeys = false,
): void => {
  for (const [key, value] of Object.entries(provenance)) {
    if (typeof value !== 'string' || value.length === 0) {
      fail(`Evidence provenance 无效：${label}/${key}`)
    }
    if (rejectSystemKeys && SYSTEM_PROVENANCE_KEYS.has(key)) {
      fail(`Evidence provenance 不得覆盖系统字段：${label}/${key}`)
    }
  }
}

const readMetricInterpretation = (
  result: FrozenCognitiveModuleResult,
  metricKey: string,
): CognitiveMetricInterpretation => {
  const explicitValue: unknown = result.metricInterpretations?.[metricKey]
  if (explicitValue === undefined) return { interpretation: 'descriptive', directionClass: 'unknown' }
  if (!isRecord(explicitValue)) fail(`Evidence interpretation 格式无效：${result.slotKey}/${metricKey}`)
  const explicit = explicitValue as Record<string, unknown>
  if (!isEvidenceInterpretation(explicit.interpretation)) {
    fail(`Evidence interpretation 无效：${result.slotKey}/${metricKey}`)
  }
  if (!isEvidenceDirectionClass(explicit.directionClass)) {
    fail(`Evidence directionClass 无效：${result.slotKey}/${metricKey}`)
  }
  if (explicit.interpretation === 'self_report') {
    fail(`PR7 不接受 self_report Evidence：${result.slotKey}/${metricKey}`)
  }
  if (explicit.interpretation === 'descriptive' && explicit.directionClass !== 'unknown') {
    fail(`descriptive Evidence 必须使用 unknown directionClass：${result.slotKey}/${metricKey}`)
  }
  const interpretationProvenance = explicit.provenance
  if (interpretationProvenance !== undefined && !isRecord(interpretationProvenance)) {
    fail(`Evidence provenance 格式无效：${result.slotKey}/${metricKey}`)
  }
  if (explicit.interpretation === 'criterion' || explicit.interpretation === 'reference') {
    if (explicit.directionClass === 'unknown') {
      fail(`criterion/reference Evidence 不能使用 unknown directionClass：${result.slotKey}/${metricKey}`)
    }
    const basisProvenance = isRecord(interpretationProvenance)
      ? interpretationProvenance
      : fail(`criterion/reference Evidence 缺少冻结 provenance：${result.slotKey}/${metricKey}`)
    requireNonEmptyString(basisProvenance.basisId, `Evidence basisId：${result.slotKey}/${metricKey}`)
    requireNonEmptyString(basisProvenance.basisVersion, `Evidence basisVersion：${result.slotKey}/${metricKey}`)
  }
  if (isRecord(interpretationProvenance)) {
    validateProvenance(interpretationProvenance, `${result.slotKey}/${metricKey}`, true)
  }
  return {
    interpretation: explicit.interpretation,
    directionClass: explicit.directionClass,
    ...(isRecord(interpretationProvenance)
      ? { provenance: interpretationProvenance as Record<string, string> }
      : {}),
  } as CognitiveMetricInterpretation
}

const normalizeEvidenceValue = (value: unknown, label: string): EvidenceValue => {
  if (value === undefined) {
    fail(`Evidence value 缺失或含 undefined：${label}`)
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`Evidence value 不是有限数字：${label}`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeEvidenceValue(entry, `${label}[${index}]`))
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      fail(`Evidence value 不是 JSON object：${label}`)
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeEvidenceValue(entry, `${label}.${key}`),
      ]),
    )
  }
  return fail(`Evidence value 不是 JSON 值：${label}`)
}

const activeQualityFlags = (qualityFlags: Record<string, unknown>): string[] =>
  Object.entries(qualityFlags)
    .filter(([key, value]) => key !== 'interpretable' && value === true)
    .map(([key]) => key)
    .sort()

const validateMetricValueType = (
  value: EvidenceValue,
  definition: { valueType: unknown },
  label: string,
): void => {
  if (value === null) return
  if (definition.valueType === 'number' && typeof value !== 'number') {
    fail(`Evidence valueType 应为 number：${label}`)
  }
  if (definition.valueType === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
    fail(`Evidence valueType 应为 integer：${label}`)
  }
  if (definition.valueType === 'object' && !isRecord(value)) {
    fail(`Evidence valueType 应为 object：${label}`)
  }
  if (definition.valueType === 'array' && !Array.isArray(value)) {
    fail(`Evidence valueType 应为 array：${label}`)
  }
  if (!['number', 'integer', 'object', 'array'].includes(String(definition.valueType))) {
    fail(`冻结报告指标 valueType 无效：${label}`)
  }
}

const evidenceId = (
  packageDefinition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  result: FrozenCognitiveModuleResult,
  mapping: {
  testType: string
  engineVersion: string
  scoringVersion: string
  metricDefinitionVersion: string
  metricKey: string
  domain: CognitiveDomainKey
  facet: string
    role: 'primary' | 'supporting'
},
  analysisVersion = COGNITIVE_ANALYSIS_VERSION,
): string =>
  [
    packageDefinition.key,
    packageDefinition.version,
    protocol.key,
    protocol.version,
    protocol.evidenceMappingVersion,
    analysisVersion,
    analysisVersion === MULTISOURCE_ANALYSIS_VERSION
      ? MULTISOURCE_ANALYSIS_REPORT_SCHEMA_VERSION
      : COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
    result.profile,
    result.slotKey,
    result.sourceResultId,
    mapping.testType,
    mapping.engineVersion,
    mapping.scoringVersion,
    mapping.metricDefinitionVersion,
    mapping.domain,
    mapping.facet,
    mapping.metricKey,
    mapping.role,
  ]
    .map((part) => encodeURIComponent(part))
    .join(':')

const buildEvidence = (
  packageDefinition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  slots: CognitiveProtocolSlotDefinition[],
  modulesBySlot: Map<string, FrozenCognitiveModuleResult>,
  measurementsBySlot: Map<string, { resolvedConfigHash: string; resolvedReportHash: string }>,
  options: {
    analysisVersion?: CognitivePackageAnalysisResult['analysisVersion']
    reportSchemaVersion?: CognitivePackageAnalysisResult['reportSchemaVersion']
    packageSnapshotVersion?: string
    analysisProtocolSnapshotVersion?: string
  } = {},
): EvidenceItem[] => {
  const analysisVersion = options.analysisVersion ?? COGNITIVE_ANALYSIS_VERSION
  const reportSchemaVersion = options.reportSchemaVersion ?? COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION
  const packageSnapshotVersion = options.packageSnapshotVersion ?? '1'
  const analysisProtocolSnapshotVersion = options.analysisProtocolSnapshotVersion ?? '1'
  const outputDomains = new Set(protocol.outputDomains)
  const evidence: EvidenceItem[] = []
  for (const slot of slots) {
    const result = modulesBySlot.get(slot.key)
    if (!result) return fail(`内部错误：找不到冻结任务结果 ${slot.key}`)
    const mappings = listCognitiveEvidenceMappingsForTask(
      slot.testType,
      slot.engineVersion,
      slot.scoringVersion,
      protocol.evidenceMappingVersion,
    ).filter(
      (mapping) =>
        mapping.metricDefinitionVersion === slot.metricDefinitionVersion &&
        outputDomains.has(mapping.domain),
    )
    if (mappings.length === 0) {
      fail(`冻结任务没有匹配的 Evidence mapping：${slot.key}`)
    }
    const qualityInterpretable = qualityStateFor(result, slot.key) === 'interpretable'
    const qualityFlags = activeQualityFlags(result.qualityFlags)
    const measurement = measurementsBySlot.get(slot.key)
    if (!measurement) return fail(`内部错误：找不到冻结任务测量 ${slot.key}`)
    if (result.provenance) {
      validateProvenance(result.provenance, slot.key, true)
    }
    for (const mapping of mappings) {
      const metricDefinition = result.frozenReport.metricDefinitions[mapping.metricKey]
      if (
        !metricDefinition ||
        !isRecord(metricDefinition) ||
        metricDefinition.key !== mapping.metricKey ||
        typeof metricDefinition.unit !== 'string' ||
        !Array.isArray(metricDefinition.availableProfiles) ||
        metricDefinition.availableProfiles.some((profile) =>
          profile !== 'experience' && profile !== 'standard' && profile !== 'research')
      ) {
        if (!metricDefinition) fail(`冻结报告缺少映射指标：${slot.key}/${mapping.metricKey}`)
        fail(`冻结报告指标 Profile 定义无效：${slot.key}/${mapping.metricKey}`)
      }
      if (!metricDefinition.availableProfiles.includes(result.profile)) continue

      if (!Object.prototype.hasOwnProperty.call(result.metrics, mapping.metricKey)) {
        fail(`冻结任务缺少映射指标：${slot.key}/${mapping.metricKey}`)
      }
      const value = normalizeEvidenceValue(result.metrics[mapping.metricKey], `${slot.key}/${mapping.metricKey}`)
      validateMetricValueType(value, metricDefinition, `${slot.key}/${mapping.metricKey}`)
      const interpretation = readMetricInterpretation(result, mapping.metricKey)
      const provenance: Record<string, string> = {
        ...(result.provenance ?? {}),
        ...(interpretation.provenance ?? {}),
        packageKey: packageDefinition.key,
        packageVersion: packageDefinition.version,
        packageSnapshotVersion,
        packageReportDefinitionVersion: packageDefinition.reportDefinitionVersion,
        resolvedConfigHash: measurement.resolvedConfigHash,
        resolvedReportHash: measurement.resolvedReportHash,
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotVersion,
        domainDefinitionVersion: protocol.domainDefinitionVersion,
        evidenceMappingVersion: protocol.evidenceMappingVersion,
        recommendationRuleVersion: protocol.recommendationRuleVersion,
        analysisVersion,
        reportSchemaVersion,
        profile: result.profile,
        slotKey: slot.key,
        sourceResultId: result.sourceResultId,
        testType: result.testType,
        configVersion: result.configVersion,
        engineVersion: result.engineVersion,
        scoringVersion: result.scoringVersion,
        profileDefinitionVersion: result.frozenReport.profileDefinitionVersion,
        metricDefinitionVersion: result.frozenReport.metricDefinitionVersion,
        qualityDefinitionVersion: result.frozenReport.qualityDefinitionVersion,
        reportDefinitionVersion: result.frozenReport.reportDefinitionVersion,
        mappingMetricDefinitionVersion: mapping.metricDefinitionVersion,
      }
      if (result.assignmentId !== undefined && result.assignmentId !== null) {
        requireNonEmptyString(result.assignmentId, `冻结任务 assignmentId：${slot.key}`)
        provenance.assignmentId = result.assignmentId
      }
      validateProvenance(provenance, `${slot.key}/${mapping.metricKey}`)

      evidence.push({
        id: evidenceId(packageDefinition, protocol, result, mapping, analysisVersion),
        sourceType: 'cognitive_metric',
        sourceResultId: result.sourceResultId,
        construct: mapping.domain,
        facet: mapping.facet,
        metricKey: mapping.metricKey,
        value,
        unit: metricDefinition.unit,
        role: mapping.role,
        interpretation: interpretation.interpretation,
        directionClass: interpretation.directionClass,
        interpretable: qualityInterpretable && value !== null,
        qualityFlags,
        provenance,
      })
    }
  }
  return evidence
}

const scaleEvidenceId = (
  packageDefinition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  result: FrozenScaleModuleResult,
  analysisVersion: string,
): string => [
  packageDefinition.key,
  packageDefinition.version,
  protocol.key,
  protocol.version,
  analysisVersion,
  result.profile,
  result.slotKey,
  result.sourceResultId,
  result.scaleCode,
  result.dimensionCode,
  result.mappingKey,
  result.mappingVersion,
].map((part) => encodeURIComponent(part)).join(':')

const buildScaleEvidence = (
  packageDefinition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  slots: ScaleProtocolSlotDefinition[],
  resultsBySlot: Map<string, FrozenScaleModuleResult>,
  measurementsBySlot: Map<string, FrozenScaleSlotMeasurement>,
  options: {
    analysisVersion: CognitivePackageAnalysisResult['analysisVersion']
    reportSchemaVersion: CognitivePackageAnalysisResult['reportSchemaVersion']
    packageSnapshotVersion: string
    analysisProtocolSnapshotVersion: string
  },
): EvidenceItem[] => {
  const evidence: EvidenceItem[] = []
  for (const slot of slots) {
    const result = resultsBySlot.get(slot.key)
    if (!result) return fail(`内部错误：找不到冻结量表结果 ${slot.key}`)
    const measurement = measurementsBySlot.get(slot.key)
    if (!measurement) return fail(`内部错误：找不到冻结量表测量 ${slot.key}`)
    const scaleMatches = result.scaleCode === measurement.scaleCode
      && result.dimensionCode === measurement.dimensionCode
      && result.scaleId === measurement.scaleId
      && result.scaleDefinitionHash === measurement.scaleDefinitionHash
      && result.mappingKey === measurement.mappingKey
      && result.mappingVersion === measurement.mappingVersion
      && result.respondentType === slot.respondentType
      && result.valueSelector === slot.valueSelector
    const qualityState = scaleQualityStateFor(result, slot.key)
    const qualityFlags = [
      ...activeQualityFlags(result.qualityFlags),
      ...(scaleMatches ? [] : ['frozenMappingMismatch']),
    ].sort()
    const interpretable = scaleMatches
      && qualityState === 'interpretable'
      && result.dimensionScore !== null
    const provenance: Record<string, string> = {
      ...(result.provenance ?? {}),
      packageKey: packageDefinition.key,
      packageVersion: packageDefinition.version,
      packageSnapshotVersion: options.packageSnapshotVersion,
      packageReportDefinitionVersion: packageDefinition.reportDefinitionVersion,
      analysisProtocolKey: protocol.key,
      analysisProtocolVersion: protocol.version,
      analysisProtocolSnapshotVersion: options.analysisProtocolSnapshotVersion,
      domainDefinitionVersion: protocol.domainDefinitionVersion,
      evidenceMappingVersion: protocol.evidenceMappingVersion,
      recommendationRuleVersion: protocol.recommendationRuleVersion,
      analysisVersion: options.analysisVersion,
      reportSchemaVersion: options.reportSchemaVersion,
      profile: result.profile,
      slotKey: slot.key,
      sourceResultId: result.sourceResultId,
      sourceType: 'scale_assessment',
      scaleId: result.scaleId,
      scaleCode: result.scaleCode,
      dimensionCode: result.dimensionCode,
      mappingKey: result.mappingKey,
      mappingVersion: result.mappingVersion,
      mappingDomain: measurement.mappingDomain,
      mappingFacet: measurement.mappingFacet,
      mappingRole: measurement.mappingRole,
      mappingDirectionClass: measurement.mappingDirectionClass,
      respondentType: result.respondentType,
      valueSelector: result.valueSelector,
      scaleDefinitionHash: result.scaleDefinitionHash,
    }
    if (result.compositeItemId) provenance.compositeItemId = result.compositeItemId
    validateProvenance(provenance, `${slot.key}/${slot.expectedDimensionCode}`)
    evidence.push({
      id: scaleEvidenceId(packageDefinition, protocol, result, options.analysisVersion),
      sourceType: 'scale_dimension',
      sourceResultId: result.sourceResultId,
      construct: measurement.mappingDomain,
      facet: measurement.mappingFacet,
      metricKey: result.dimensionCode,
      value: interpretable ? normalizeEvidenceValue(result.dimensionScore, `${slot.key}/${result.dimensionCode}`) : null,
      unit: 'raw_dimension_score',
      role: measurement.mappingRole,
      interpretation: 'self_report',
      // The frozen mapping records scale orientation, but without a frozen
      // threshold/reference the observed raw sum has no participant direction.
      directionClass: 'unknown',
      interpretable,
      qualityFlags,
      provenance,
    })
  }
  return evidence
}

const unique = (values: string[]): string[] => [...new Set(values)]

const calculateConsistency = (primaryEvidence: EvidenceItem[]): CognitiveDomainConsistency => {
  const usable = primaryEvidence.filter((item) => item.interpretable && item.value !== null)
  const sources = new Map<string, Set<EvidenceDirectionClass>>()
  for (const item of usable) {
    const directions = sources.get(item.sourceResultId) ?? new Set<EvidenceDirectionClass>()
    directions.add(item.directionClass)
    sources.set(item.sourceResultId, directions)
  }
  if (sources.size < 2) return 'not_applicable'

  const sourceDirections = [...sources.values()]
  // unknown/neutral do not provide a comparable direction. They must not be
  // promoted to mixed merely because another independent task is directional.
  if (sourceDirections.some((directions) => directions.has('unknown') || directions.has('neutral'))) {
    return 'not_applicable'
  }

  // A single source containing both known directions is a within-task
  // conflict. Preserve the useful mixed label, but do not treat it as a
  // cross-task divergence.
  const hasConflictingSource = sourceDirections.some((directions) => directions.size !== 1)
  const knownDirections = new Set<EvidenceDirectionClass>()
  for (const directions of sourceDirections) {
    for (const direction of directions) {
      if (direction === 'more_strength' || direction === 'more_difficulty') {
        knownDirections.add(direction)
      }
    }
  }
  if (knownDirections.size === 0) return 'not_applicable'
  if (hasConflictingSource) return 'mixed'
  return knownDirections.size === 1 ? 'consistent' : 'divergent'
}

const domainSummary = (
  status: CognitiveDomainResult['status'],
  consistency: CognitiveDomainConsistency,
): string => {
  if (status === 'not_measured') return '本报告包未测量该领域。'
  if (status === 'insufficient_quality') return '当前可用数据不足，暂不进行该领域综合解释。'
  if (status === 'descriptive_only') return '当前证据仅支持对本次任务表现作描述，不能进行方向性比较。'
  if (consistency === 'consistent') return '在多个任务中观察到方向一致的表现模式。'
  if (consistency === 'divergent') return '不同独立任务显示相反方向的可比较表现，需结合具体任务要求解读。'
  if (consistency === 'mixed') return '不同任务反映的表现并不完全一致，这可能与任务所要求的具体认知过程不同。'
  return '当前该领域有可解释的方向性证据，但不足以进行跨任务一致性判断。'
}

const buildDomainResults = (
  protocol: AnalysisProtocolDefinition,
  evidence: EvidenceItem[],
  modulesBySlot: Map<string, FrozenCognitiveModuleResult>,
  slots: CognitiveProtocolSlotDefinition[],
): CognitiveDomainResult[] => {
  const excludedSlots = new Set(
    slots
      .filter((slot) => {
        const result = modulesBySlot.get(slot.key)
        return result ? qualityStateFor(result, slot.key) !== 'interpretable' : true
      })
      .map((slot) => slot.key),
  )
  return protocol.outputDomains.map((domain) => {
    const definition = getCognitiveDomainDefinition(domain, protocol.domainDefinitionVersion)
    if (!definition) return fail(`分析协议引用未知 Domain：${domain}`)
    const domainEvidence = evidence.filter((item) => item.construct === domain)
    const primaryEvidence = domainEvidence.filter((item) => item.role === 'primary')
    const usablePrimary = primaryEvidence.filter((item) => item.interpretable && item.value !== null)
    const directionalPrimary = usablePrimary.filter(
      (item) => item.directionClass === 'more_strength' || item.directionClass === 'more_difficulty',
    )
    let status: CognitiveDomainResult['status']
    if (domainEvidence.length === 0) status = 'not_measured'
    else if (usablePrimary.length === 0) status = 'insufficient_quality'
    else if (directionalPrimary.length === 0) status = 'descriptive_only'
    else status = 'interpretable'

    const consistency = status === 'interpretable'
      ? calculateConsistency(primaryEvidence)
      : 'not_applicable'
    const strengths = unique(
      directionalPrimary
        .filter((item) => item.directionClass === 'more_strength')
        .map((item) => {
          const facet = definition.facets.find((candidate) => candidate.key === item.facet)
          return `${facet?.label ?? item.facet ?? item.metricKey ?? '该指标'}显示明确的优势方向证据。`
        }),
    )
    const watchItems = unique(
      directionalPrimary
        .filter((item) => item.directionClass === 'more_difficulty')
        .map((item) => {
          const facet = definition.facets.find((candidate) => candidate.key === item.facet)
          return `${facet?.label ?? item.facet ?? item.metricKey ?? '该指标'}显示明确的困难方向证据。`
        }),
    )

    const caveats = unique([
      ...domainEvidence
        .map((item) => modulesBySlot.get(item.provenance.slotKey)?.frozenReport.reportCaveats ?? [])
        .reduce((all, current) => [...all, ...current], [] as string[]),
      ...[...excludedSlots]
        .filter((slotKey) => slots.find((slot) => slot.key === slotKey &&
          domainEvidence.some((item) => item.provenance.slotKey === slotKey)) !== undefined)
        .map((slotKey) => `${slotKey} 因数据质量不足未进入综合解释。`),
      ...(domainEvidence.some(
        (item) => item.directionClass === 'unknown' || item.directionClass === 'neutral',
      )
        ? ['存在 unknown/neutral 方向的指标，仅作描述，不用于跨任务方向性判断。']
        : []),
      ...(consistency === 'not_applicable' && status === 'interpretable'
        ? ['当前可比较的独立任务证据不足，未计算跨任务一致性。']
        : []),
    ])

    return {
      domain,
      label: definition.label,
      status,
      evidence: domainEvidence,
      consistency,
      summary: domainSummary(status, consistency),
      strengths,
      watchItems,
      caveats,
    }
  })
}

const buildCrossSourceFindings = (
  packageKey: string,
  evidence: EvidenceItem[],
): CognitivePackageAnalysisResult['crossSourceFindings'] => {
  if (packageKey !== PR10_MULTISOURCE_PACKAGE_KEY) return []
  const behavioral = evidence.find((item) =>
    item.sourceType === 'cognitive_metric'
    && item.construct === 'response_inhibition'
    && item.metricKey === 'commissionRate')
  const selfReport = evidence.find((item) =>
    item.sourceType === 'scale_dimension'
    && item.construct === 'response_inhibition'
    && item.metricKey === 'inhibition')
  const refs = [behavioral?.id, selfReport?.id].filter((value): value is string => Boolean(value))
  const behavioralAvailable = behavioral?.interpretable === true
  const selfReportAvailable = selfReport?.interpretable === true

  if (behavioralAvailable && selfReportAvailable) {
    return [{
      construct: 'response_inhibition',
      type: 'paired_description',
      evidenceRefs: refs,
      summary: '本次报告同时保留了 Go/No-Go 行为任务结果与 ADEXI 参与者自评结果，供分来源并列阅读。',
      caveat: '当前没有冻结阈值或参照用于判断两类来源的一致、分歧或高低；该 finding 不代表诊断、因果或稳定特质。',
      confidence: 'descriptive',
      availability: 'available',
    }]
  }

  if (behavioralAvailable || selfReportAvailable) {
    return [{
      construct: 'response_inhibition',
      type: 'single_source',
      evidenceRefs: refs,
      summary: behavioralAvailable
        ? '当前仅保留了可解释的行为任务描述结果。'
        : '当前仅保留了可解释的参与者自评描述结果。',
      caveat: '另一来源质量不足或冻结输入不可用，未进行跨来源比较。',
      confidence: 'descriptive',
      availability: 'available',
    }]
  }

  return [{
    construct: 'response_inhibition',
    type: 'insufficient_quality',
    evidenceRefs: refs,
    summary: '当前两类来源均不足以进行跨来源比较。',
    caveat: '请检查完成状态和数据质量；未生成诊断或因果结论。',
    confidence: 'descriptive',
    availability: 'unavailable',
  }]
}

const buildResult = (input: BuildPackageCognitiveAnalysisInput): CognitivePackageAnalysisResult => {
  if (!isRecord(input)) fail('PR7 引擎输入格式无效')
  const {
    packageDefinition,
    protocol,
    measurementsBySlot,
    scaleMeasurementsBySlot,
  } = validatePackageSnapshot(input.packageSnapshot)
  const isMultisource = packageDefinition.key === PR10_MULTISOURCE_PACKAGE_KEY
  const analysisVersion = isMultisource ? MULTISOURCE_ANALYSIS_VERSION : COGNITIVE_ANALYSIS_VERSION
  const reportSchemaVersion = isMultisource
    ? MULTISOURCE_ANALYSIS_REPORT_SCHEMA_VERSION
    : COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION
  const slots = sortedByPosition<CognitiveProtocolSlotDefinition>(protocol.cognitiveSlots)
  const scaleSlots = sortedByPosition<ScaleProtocolSlotDefinition>(protocol.scaleSlots)
  const modulesBySlot = validateModuleResults(
    input.moduleResults,
    slots,
    input.packageSnapshot.profile,
    measurementsBySlot,
  )
  const scaleResultsBySlot = validateScaleResults(
    input.scaleResults ?? [],
    scaleSlots,
    input.packageSnapshot.profile,
    scaleMeasurementsBySlot,
  )
  const evidence = [
    ...buildEvidence(packageDefinition, protocol, slots, modulesBySlot, measurementsBySlot, {
      analysisVersion,
      reportSchemaVersion,
      packageSnapshotVersion: String(input.packageSnapshot.snapshotVersion),
      analysisProtocolSnapshotVersion: String(input.packageSnapshot.analysisProtocolSnapshot.snapshotVersion),
    }),
    ...(isMultisource
      ? buildScaleEvidence(
        packageDefinition,
        protocol,
        scaleSlots,
        scaleResultsBySlot,
        scaleMeasurementsBySlot,
        {
          analysisVersion,
          reportSchemaVersion,
          packageSnapshotVersion: String(input.packageSnapshot.snapshotVersion),
          analysisProtocolSnapshotVersion: String(input.packageSnapshot.analysisProtocolSnapshot.snapshotVersion),
        },
      )
      : []),
  ]
  const cognitiveDomains = buildDomainResults(protocol, evidence, modulesBySlot, slots)
  const excludedModules = [
    ...slots
    .filter((slot) => {
      const result = modulesBySlot.get(slot.key)
      return result ? qualityStateFor(result, slot.key) !== 'interpretable' : true
    })
    .map((slot) => slot.key),
    ...scaleSlots
      .filter((slot) => {
        const result = scaleResultsBySlot.get(slot.key)
        return result ? scaleQualityStateFor(result, slot.key) !== 'interpretable' : true
      })
      .map((slot) => slot.key),
  ]
  const hasUndirectedEvidence = evidence.some(
    (item) => item.directionClass === 'unknown' || item.directionClass === 'neutral',
  )
  const warnings = [
    ...(excludedModules.length > 0 ? ['质量不足的任务仍保留 Evidence，但未进入 Domain 方向性结论。'] : []),
    ...(hasUndirectedEvidence ? ['存在 unknown/neutral 方向的 Evidence，该部分不参与可比较的方向性结论。'] : []),
  ]
  const provenance: Record<string, string> = {
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    packageSnapshotVersion: String(input.packageSnapshot.snapshotVersion),
    analysisProtocolKey: protocol.key,
    analysisProtocolVersion: protocol.version,
    analysisProtocolSnapshotVersion: String(input.packageSnapshot.analysisProtocolSnapshot.snapshotVersion),
    profile: input.packageSnapshot.profile,
    analysisVersion,
    reportSchemaVersion,
    packageReportDefinitionVersion: packageDefinition.reportDefinitionVersion,
    domainDefinitionVersion: protocol.domainDefinitionVersion,
    evidenceMappingVersion: protocol.evidenceMappingVersion,
    recommendationRuleVersion: protocol.recommendationRuleVersion,
  }
  if (input.attemptId !== undefined) {
    provenance.attemptId = requireNonEmptyString(input.attemptId, 'attemptId')
  }
  if (input.assessmentId !== undefined) {
    provenance.assessmentId = requireNonEmptyString(input.assessmentId, 'assessmentId')
  }

  const crossSourceFindings = buildCrossSourceFindings(packageDefinition.key, evidence)
  // PR7 cognitive-only packages keep their historical no-recommendation
  // behavior. PR11 rules are enabled only by the versioned multisource
  // protocol; a frozen 1.0.0 multisource protocol remains stable as well.
  const recommendations = isMultisource && protocol.recommendationRuleVersion === COGNITIVE_RECOMMENDATION_RULE_VERSION
    ? buildRecommendations({
      packageKey: packageDefinition.key,
      packageVersion: packageDefinition.version,
      cognitiveDomains,
      crossSourceFindings,
      evidence,
    }, protocol.recommendationRuleVersion)
    : []

  return {
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    analysisProtocolKey: protocol.key,
    analysisProtocolVersion: protocol.version,
    profile: input.packageSnapshot.profile,
    analysisVersion,
    reportSchemaVersion,
    qualitySummary: {
      interpretableModules: slots.length + scaleSlots.length - excludedModules.length,
      excludedModules,
      warnings,
    },
    evidence,
    cognitiveDomains,
    crossSourceFindings,
    recommendations,
    limitations: isMultisource
      ? [
        '本报告包不计算跨任务平均、Domain score、overall score、percentile 或 IQ。',
        'ADEXI 是参与者自评来源；跨来源 finding 仅描述本次行为任务与自评的方向关系，不代表诊断、因果或稳定特质。',
        '学员可以是青少年或成人；本包不按年龄或教师/学员身份限制作答，具体适用性仍需结合项目审核。',
        ...(protocol.recommendationRuleVersion === LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION
          ? ['该历史分析规则版本不补生成 PR11 建议，既有冻结报告保持稳定。']
          : ['建议仅基于冻结 Domain/finding 证据生成，面向描述性观察，不产生诊断、因果或处分类结论。']),
      ]
      : [
        'PR7 不计算跨任务平均、Domain score、overall score、percentile 或 IQ。',
        'PR7 不生成跨来源 findings 或 recommendations。',
        '没有可比较的 criterion/reference 方向的 Evidence 仅作 descriptive 处理。',
      ],
    provenance,
  }
}

export function buildPackageCognitiveAnalysis(
  input: BuildPackageCognitiveAnalysisInput,
): CognitivePackageAnalysisResult
export function buildPackageCognitiveAnalysis(
  packageSnapshot: FrozenReportPackageSnapshot,
  moduleResults: FrozenCognitiveModuleResult[],
  context?: Pick<BuildPackageCognitiveAnalysisInput, 'attemptId' | 'assessmentId'>,
): CognitivePackageAnalysisResult
export function buildPackageCognitiveAnalysis(
  inputOrSnapshot: BuildPackageCognitiveAnalysisInput | FrozenReportPackageSnapshot,
  moduleResults?: FrozenCognitiveModuleResult[],
  context?: Pick<BuildPackageCognitiveAnalysisInput, 'attemptId' | 'assessmentId'>,
): CognitivePackageAnalysisResult {
  try {
    if (Array.isArray(moduleResults)) {
      return buildResult({
        packageSnapshot: inputOrSnapshot as FrozenReportPackageSnapshot,
        moduleResults,
        ...context,
      })
    }
    if (!isRecord(inputOrSnapshot) || !('packageSnapshot' in inputOrSnapshot)) {
      fail('PR7 引擎只接受冻结报告包快照和冻结任务结果')
    }
    return buildResult(inputOrSnapshot as BuildPackageCognitiveAnalysisInput)
  } catch (error) {
    if (error instanceof CognitivePackageAnalysisInputError) throw error
    throw new CognitivePackageAnalysisInputError('PR7 冻结输入格式无效')
  }
}
