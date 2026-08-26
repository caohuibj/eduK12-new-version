import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import type { CognitiveAnalysisProfile, AnalysisProtocolDefinition } from './cognitive-analysis.types'
import {
  buildFrozenAnalysisProtocolSnapshot,
  readFrozenAnalysisProtocolSnapshot,
  validateFrozenAnalysisProtocolSnapshot,
  type FrozenAnalysisProtocolSnapshot,
  type ProtocolCompositeItem,
} from './protocol-freeze'
import type { ReportPackageDefinition } from './report-package.registry'

export interface FrozenReportPackageSnapshot {
  snapshotVersion: 1 | 2
  packageKey: string
  packageVersion: string
  profile: CognitiveAnalysisProfile
  packageDefinition: ReportPackageDefinition
  analysisProtocolSnapshot: FrozenAnalysisProtocolSnapshot
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

const sameDefinition = (left: ReportPackageDefinition, right: ReportPackageDefinition): boolean =>
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
  return snapshot
}

export const validateFrozenReportPackageSnapshot = (
  snapshot: FrozenReportPackageSnapshot,
  definition: ReportPackageDefinition,
  protocol: AnalysisProtocolDefinition,
  items: ProtocolCompositeItem[],
): void => {
  if (
    snapshot.packageKey !== definition.key
    || snapshot.packageVersion !== definition.version
    || !sameDefinition(snapshot.packageDefinition, definition)
  ) {
    fail('报告包快照与当前包版本不匹配')
  }
  assertPackageProtocol(definition, protocol)
  validateFrozenAnalysisProtocolSnapshot(
    snapshot.analysisProtocolSnapshot,
    protocol.key,
    protocol.version,
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
