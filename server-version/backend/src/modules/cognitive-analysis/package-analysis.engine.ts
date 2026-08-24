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
  EvidenceDirectionClass,
  EvidenceInterpretation,
  EvidenceItem,
  EvidenceValue,
  FrozenCognitiveModuleResult,
} from './cognitive-analysis.types'
import {
  COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
  COGNITIVE_ANALYSIS_VERSION,
} from './cognitive-analysis.types'
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

export interface BuildPackageCognitiveAnalysisInput {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults: FrozenCognitiveModuleResult[]
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
  recommendationRuleVersion: '1.0.0',
}]))

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

const sameSlots = (
  left: CognitiveProtocolSlotDefinition[],
  right: CognitiveProtocolSlotDefinition[],
): boolean => left.length === right.length && left.every((slot, index) => {
  const candidate = right[index]
  return Boolean(candidate) && Object.keys(slot).every(
    (key) => slot[key as keyof CognitiveProtocolSlotDefinition] === candidate[key as keyof CognitiveProtocolSlotDefinition],
  ) && Object.keys(candidate).length === Object.keys(slot).length
})

const sortedByPosition = <T extends { position: number }>(items: T[]): T[] =>
  [...items].sort((left, right) => left.position - right.position)

const validatePackageSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
): {
  packageDefinition: ReportPackageDefinition
  protocol: AnalysisProtocolDefinition
  measurementsBySlot: Map<string, { resolvedConfigHash: string; resolvedReportHash: string }>
} => {
  if (!isRecord(snapshot) || snapshot.snapshotVersion !== 1) {
    fail('PR7 只接受版本为 1 的冻结报告包快照')
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
    ?? fail('报告包不是 PR7 允许的六个内置精确版本')
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
  const packageCognitiveSlots = sortedByPosition(
    packageDefinition.slots.map((slot, index) => {
      if (!isRecord(slot) || typeof slot.testType !== 'string') {
        fail(`PR7 不接受含 scale slot 的报告包：slots[${index}]`)
      }
      return validateCognitiveSlot(slot, `冻结报告包 slots[${index}]`)
    }),
  )

  const protocolSnapshot = snapshot.analysisProtocolSnapshot
  if (!isRecord(protocolSnapshot) || protocolSnapshot.snapshotVersion !== 1) {
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
  if (!Array.isArray(protocol.scaleSlots) || protocol.scaleSlots.length > 0) {
    fail('PR7 不接受含 scale slot 的分析协议')
  }
  if (!Array.isArray(protocol.cognitiveSlots)) fail('冻结分析协议 cognitiveSlots 格式无效')
  const protocolCognitiveSlots = sortedByPosition(
    protocol.cognitiveSlots.map((slot, index) =>
      validateCognitiveSlot(slot, `冻结分析协议 cognitiveSlots[${index}]`)),
  )
  if (!sameSlots(packageCognitiveSlots, protocolCognitiveSlots)) {
    fail('报告包槽位与内部分析协议槽位不完全一致')
  }
  const slotKeys = new Set<string>()
  const positions = new Set<number>()
  const testTypes = new Set<string>()
  for (const slot of protocolCognitiveSlots) {
    if (slotKeys.has(slot.key)) fail(`冻结分析协议槽位重复：${slot.key}`)
    if (positions.has(slot.position)) fail(`冻结分析协议槽位 position 重复：${slot.position}`)
    if (testTypes.has(slot.testType)) fail(`冻结分析协议任务重复：${slot.testType}`)
    slotKeys.add(slot.key)
    positions.add(slot.position)
    testTypes.add(slot.testType)
  }
  if (protocolCognitiveSlots.some((slot, index) => slot.position !== index)) {
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
  if (protocol.recommendationRuleVersion !== builtInContract.recommendationRuleVersion) {
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

  return { packageDefinition, protocol, measurementsBySlot }
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
    if (typeof result.qualityFlags.interpretable !== 'boolean') {
      fail(`冻结任务 interpretable quality flag 无效：${slotKey}`)
    }
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
        qualityKey !== 'interpretable' &&
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
): string =>
  [
    packageDefinition.key,
    packageDefinition.version,
    protocol.key,
    protocol.version,
    protocol.evidenceMappingVersion,
    COGNITIVE_ANALYSIS_VERSION,
    COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
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
): EvidenceItem[] => {
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
    const qualityInterpretable = result.qualityFlags.interpretable === true
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
        packageSnapshotVersion: '1',
        packageReportDefinitionVersion: packageDefinition.reportDefinitionVersion,
        resolvedConfigHash: measurement.resolvedConfigHash,
        resolvedReportHash: measurement.resolvedReportHash,
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotVersion: '1',
        domainDefinitionVersion: protocol.domainDefinitionVersion,
        evidenceMappingVersion: protocol.evidenceMappingVersion,
        recommendationRuleVersion: protocol.recommendationRuleVersion,
        analysisVersion: COGNITIVE_ANALYSIS_VERSION,
        reportSchemaVersion: COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
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
        id: evidenceId(packageDefinition, protocol, result, mapping),
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
  const hasAmbiguousSource = sourceDirections.some(
    (directions) =>
      directions.has('unknown') ||
      directions.has('neutral') ||
      directions.has('more_strength') && directions.has('more_difficulty') ||
      directions.size !== 1,
  )
  const knownDirections = new Set<EvidenceDirectionClass>()
  for (const directions of sourceDirections) {
    for (const direction of directions) {
      if (direction === 'more_strength' || direction === 'more_difficulty') {
        knownDirections.add(direction)
      }
    }
  }
  if (knownDirections.size === 0) return 'not_applicable'
  if (hasAmbiguousSource) return 'mixed'
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
      .filter((slot) => modulesBySlot.get(slot.key)?.qualityFlags.interpretable !== true)
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

const buildResult = (input: BuildPackageCognitiveAnalysisInput): CognitivePackageAnalysisResult => {
  if (!isRecord(input)) fail('PR7 引擎输入格式无效')
  const { packageDefinition, protocol, measurementsBySlot } = validatePackageSnapshot(input.packageSnapshot)
  const slots = sortedByPosition<CognitiveProtocolSlotDefinition>(protocol.cognitiveSlots)
  const modulesBySlot = validateModuleResults(
    input.moduleResults,
    slots,
    input.packageSnapshot.profile,
    measurementsBySlot,
  )
  const evidence = buildEvidence(packageDefinition, protocol, slots, modulesBySlot, measurementsBySlot)
  const cognitiveDomains = buildDomainResults(protocol, evidence, modulesBySlot, slots)
  const excludedModules = slots
    .filter((slot) => modulesBySlot.get(slot.key)?.qualityFlags.interpretable !== true)
    .map((slot) => slot.key)
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
    packageSnapshotVersion: '1',
    analysisProtocolKey: protocol.key,
    analysisProtocolVersion: protocol.version,
    analysisProtocolSnapshotVersion: '1',
    profile: input.packageSnapshot.profile,
    analysisVersion: COGNITIVE_ANALYSIS_VERSION,
    reportSchemaVersion: COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
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

  return {
    packageKey: packageDefinition.key,
    packageVersion: packageDefinition.version,
    analysisProtocolKey: protocol.key,
    analysisProtocolVersion: protocol.version,
    profile: input.packageSnapshot.profile,
    analysisVersion: COGNITIVE_ANALYSIS_VERSION,
    reportSchemaVersion: COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION,
    qualitySummary: {
      interpretableModules: slots.length - excludedModules.length,
      excludedModules,
      warnings,
    },
    evidence,
    cognitiveDomains,
    crossSourceFindings: [],
    recommendations: [],
    limitations: [
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
