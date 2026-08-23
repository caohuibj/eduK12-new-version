import type { CognitiveProfile } from './cognitive.types'

export interface ProtocolConstraint {
  testType: string
  scoringVersions?: string[]
  engineVersions?: string[]
  profiles?: CognitiveProfile[]
  minTotalTrials?: number
  totalTrials?: number
  startLength?: number
  minMaxLength?: number
  congruentRatio?: number
  foreperiodMinMs?: number
  foreperiodMaxMs?: number
  timeoutMs?: number
  validRtFloorMs?: number
}

export interface ObservedProtocol {
  testType: string
  scoringVersion?: string
  engineVersion?: string
  profile?: string | null
  config?: Record<string, unknown>
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** 文献/模拟参考只在 protocol 字段足够匹配时启用，禁止换算。 */
export const matchProtocol = (constraint: ProtocolConstraint, observed: ObservedProtocol): boolean => {
  if (constraint.testType !== observed.testType) return false
  if (constraint.scoringVersions && (!observed.scoringVersion || !constraint.scoringVersions.includes(observed.scoringVersion))) {
    return false
  }
  if (constraint.engineVersions && (!observed.engineVersion || !constraint.engineVersions.includes(observed.engineVersion))) {
    return false
  }
  if (constraint.profiles) {
    const profile = observed.profile
    if (profile !== 'experience' && profile !== 'standard' && profile !== 'research') return false
    if (!constraint.profiles.includes(profile)) return false
  }
  const config = observed.config ?? {}
  const totalTrials = asNumber(config.totalTrials)
  if (constraint.totalTrials != null && totalTrials !== constraint.totalTrials) return false
  if (constraint.minTotalTrials != null && (totalTrials == null || totalTrials < constraint.minTotalTrials)) return false
  if (constraint.startLength != null && asNumber(config.startLength) !== constraint.startLength) return false
  if (constraint.minMaxLength != null) {
    const maxLength = asNumber(config.maxLength)
    if (maxLength == null || maxLength < constraint.minMaxLength) return false
  }
  if (constraint.congruentRatio != null && asNumber(config.congruentRatio) !== constraint.congruentRatio) return false
  if (constraint.foreperiodMinMs != null && asNumber(config.foreperiodMinMs) !== constraint.foreperiodMinMs) return false
  if (constraint.foreperiodMaxMs != null && asNumber(config.foreperiodMaxMs) !== constraint.foreperiodMaxMs) return false
  if (constraint.timeoutMs != null && asNumber(config.timeoutMs) !== constraint.timeoutMs) return false
  if (constraint.validRtFloorMs != null && asNumber(config.validRtFloorMs) !== constraint.validRtFloorMs) return false
  return true
}
