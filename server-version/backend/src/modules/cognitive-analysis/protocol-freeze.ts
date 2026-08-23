import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import { hashResolvedConfig, readFrozenReport } from '../cognitive/profile-freeze'
import type {
  AnalysisProtocolDefinition,
  CognitiveAnalysisProfile,
} from './cognitive-analysis.types'

export interface FrozenProtocolSlotMeasurement {
  slotKey: string
  resolvedConfigHash: string
  resolvedReportHash: string
}

export interface FrozenAnalysisProtocolSnapshot {
  snapshotVersion: 1
  protocolKey: string
  protocolVersion: string
  profile: CognitiveAnalysisProfile
  protocolDefinition: AnalysisProtocolDefinition
  cognitiveMeasurements: FrozenProtocolSlotMeasurement[]
}

export interface ProtocolCompositeItem {
  type: string
  position: number
  required: boolean
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
  },
): { profile: CognitiveAnalysisProfile; measurements: FrozenProtocolSlotMeasurement[] } => {
  if (protocol.scaleSlots.length > 0) fail('当前版本尚未实现量表协议槽位')
  if (items.length !== protocol.cognitiveSlots.length) {
    fail(`协议模块数量不匹配：需要 ${protocol.cognitiveSlots.length} 个认知模块`)
  }

  const sortedItems = [...items].sort((a, b) => a.position - b.position)
  const sortedSlots = [...protocol.cognitiveSlots].sort((a, b) => a.position - b.position)
  const expectedBySlot = new Map(
    (expected?.measurements ?? []).map((measurement) => [measurement.slotKey, measurement]),
  )
  if (expected?.measurements && expectedBySlot.size !== sortedSlots.length) {
    fail('协议冻结的任务测量数量不匹配')
  }

  let commonProfile: CognitiveAnalysisProfile | null = expected?.profile ?? null
  const measurements: FrozenProtocolSlotMeasurement[] = []

  for (let index = 0; index < sortedSlots.length; index += 1) {
    const slot = sortedSlots[index]
    const item = sortedItems[index]
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
  return { profile: commonProfile, measurements }
}

export const buildFrozenAnalysisProtocolSnapshot = (
  protocol: AnalysisProtocolDefinition,
  items: ProtocolCompositeItem[],
): FrozenAnalysisProtocolSnapshot => {
  const validated = validateProtocolCompositeItems(protocol, items)
  return {
    snapshotVersion: 1,
    protocolKey: protocol.key,
    protocolVersion: protocol.version,
    profile: validated.profile,
    protocolDefinition: protocol,
    cognitiveMeasurements: validated.measurements,
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
    snapshot?.snapshotVersion !== 1 ||
    !snapshot.protocolKey ||
    !snapshot.protocolVersion ||
    !snapshot.protocolDefinition ||
    !Array.isArray(snapshot.cognitiveMeasurements)
  ) {
    fail('综合分析协议快照格式无效')
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
  })
}
