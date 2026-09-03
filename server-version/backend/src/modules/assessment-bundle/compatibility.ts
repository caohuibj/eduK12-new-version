import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import type { FrozenAnalysisProtocolSnapshot } from '../cognitive-analysis/protocol-freeze'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import { bundleContractFail } from './errors'
import { parseFrozenAssessmentBundleSnapshot } from './snapshot'
import type {
  FrozenRuntimeSnapshotFamily,
  LegacyUnavailableFieldsV1,
} from './types'
import type { FrozenAssessmentBundleSnapshotV3 } from './types'

const LEGACY_UNAVAILABLE: LegacyUnavailableFieldsV1 = {
  respondent: 'unavailable',
  rights: 'unavailable',
  context: 'unavailable',
  consent: 'unavailable',
  subject: 'unavailable',
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return bundleContractFail('UNSUPPORTED_SNAPSHOT', `${label} 缺失`)
  }
  return value
}

const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  const record = asRecord(value)
  if (!record) return bundleContractFail('UNSUPPORTED_SNAPSHOT', `${label} 必须是对象`)
  return record
}

const requireSnapshotVersion = (value: unknown): 1 | 2 => {
  if (value !== 1 && value !== 2) {
    return bundleContractFail('UNSUPPORTED_SNAPSHOT', `legacy snapshotVersion 无效: ${String(value)}`)
  }
  return value
}

/**
 * Structural family detection on already-decrypted JSON.
 * snapshotVersion 1|2 is not sufficient: protocol snapshots also use 1|2.
 * Family 3 / ASSESSMENT_BUNDLE is exclusive and never falls through.
 */
export const classifyDecryptedRuntimeSnapshot = (value: unknown): FrozenRuntimeSnapshotFamily => {
  const record = asRecord(value)
  if (!record) return bundleContractFail('UNSUPPORTED_SNAPSHOT', '快照明文不是对象')

  if (record.snapshotFamily === 'ASSESSMENT_BUNDLE' || record.snapshotVersion === 3) {
    return 'ASSESSMENT_BUNDLE'
  }

  const hasPackage = typeof record.packageKey === 'string'
    && record.packageDefinition != null
    && record.analysisProtocolSnapshot != null
  const hasProtocol = typeof record.protocolKey === 'string'
    && record.protocolDefinition != null
    && Array.isArray(record.cognitiveMeasurements)

  if (hasPackage) return 'LEGACY_REPORT_PACKAGE'
  if (hasProtocol) return 'LEGACY_ANALYSIS_PROTOCOL'
  return bundleContractFail('UNSUPPORTED_SNAPSHOT', '无法识别快照族')
}

const parseLegacyReportPackage = (record: Record<string, unknown>): Extract<FrozenRuntimeSnapshotRead, { family: 'LEGACY_REPORT_PACKAGE' }> => {
  const snapshotVersion = requireSnapshotVersion(record.snapshotVersion)
  const protocol = requireObject(record.analysisProtocolSnapshot, 'analysisProtocolSnapshot')
  if (typeof protocol.protocolKey !== 'string' || protocol.protocolDefinition == null || !Array.isArray(protocol.cognitiveMeasurements)) {
    return bundleContractFail('UNSUPPORTED_SNAPSHOT', 'legacy report package 内层 protocol 结构无效')
  }
  const snapshot: FrozenReportPackageSnapshot = {
    snapshotVersion,
    packageKey: requireString(record.packageKey, 'packageKey'),
    packageVersion: requireString(record.packageVersion, 'packageVersion'),
    profile: record.profile === 'research' ? 'research' : 'standard',
    packageDefinition: requireObject(record.packageDefinition, 'packageDefinition') as unknown as FrozenReportPackageSnapshot['packageDefinition'],
    analysisProtocolSnapshot: protocol as unknown as FrozenReportPackageSnapshot['analysisProtocolSnapshot'],
  }
  return {
    family: 'LEGACY_REPORT_PACKAGE',
    snapshotVersion: snapshot.snapshotVersion,
    snapshot,
    unavailable: { ...LEGACY_UNAVAILABLE },
  }
}

const parseLegacyAnalysisProtocol = (record: Record<string, unknown>): Extract<FrozenRuntimeSnapshotRead, { family: 'LEGACY_ANALYSIS_PROTOCOL' }> => {
  const snapshotVersion = requireSnapshotVersion(record.snapshotVersion)
  if (snapshotVersion === 2 && !Array.isArray(record.scaleMeasurements)) {
    return bundleContractFail('UNSUPPORTED_SNAPSHOT', 'legacy analysis protocol v2 缺少 scaleMeasurements')
  }
  const snapshot: FrozenAnalysisProtocolSnapshot = {
    snapshotVersion,
    protocolKey: requireString(record.protocolKey, 'protocolKey'),
    protocolVersion: requireString(record.protocolVersion, 'protocolVersion'),
    profile: record.profile === 'research' ? 'research' : 'standard',
    protocolDefinition: requireObject(record.protocolDefinition, 'protocolDefinition') as unknown as FrozenAnalysisProtocolSnapshot['protocolDefinition'],
    cognitiveMeasurements: record.cognitiveMeasurements as FrozenAnalysisProtocolSnapshot['cognitiveMeasurements'],
    ...(snapshotVersion === 2
      ? { scaleMeasurements: record.scaleMeasurements as FrozenAnalysisProtocolSnapshot['scaleMeasurements'] }
      : {}),
  }
  return {
    family: 'LEGACY_ANALYSIS_PROTOCOL',
    snapshotVersion: snapshot.snapshotVersion,
    snapshot,
    unavailable: { ...LEGACY_UNAVAILABLE },
  }
}

export type FrozenRuntimeSnapshotRead =
  | {
      family: 'ASSESSMENT_BUNDLE'
      snapshotVersion: 3
      snapshot: FrozenAssessmentBundleSnapshotV3
    }
  | {
      family: 'LEGACY_REPORT_PACKAGE'
      snapshotVersion: 1 | 2
      snapshot: FrozenReportPackageSnapshot
      unavailable: LegacyUnavailableFieldsV1
    }
  | {
      family: 'LEGACY_ANALYSIS_PROTOCOL'
      snapshotVersion: 1 | 2
      snapshot: FrozenAnalysisProtocolSnapshot
      unavailable: LegacyUnavailableFieldsV1
    }

/**
 * Decrypt once, classify by outer structural keys, then run exactly one parser.
 * A damaged v3 snapshot must not be reinterpreted as a legacy package/protocol.
 */
export const parseFrozenRuntimeSnapshot = (encrypted: string): FrozenRuntimeSnapshotRead => {
  let decrypted: unknown
  try {
    decrypted = decryptCognitivePayload<unknown>(encrypted)
  } catch {
    return bundleContractFail('SNAPSHOT_DECRYPT_FAILED', '快照无法解密')
  }
  const family = classifyDecryptedRuntimeSnapshot(decrypted)
  if (family === 'ASSESSMENT_BUNDLE') {
    return {
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot: parseFrozenAssessmentBundleSnapshot(decrypted),
    }
  }
  const record = asRecord(decrypted)
  if (!record) return bundleContractFail('UNSUPPORTED_SNAPSHOT', '快照明文不是对象')
  if (family === 'LEGACY_REPORT_PACKAGE') return parseLegacyReportPackage(record)
  return parseLegacyAnalysisProtocol(record)
}
