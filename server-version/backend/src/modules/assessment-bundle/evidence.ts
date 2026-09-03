import { bundleContractFail } from './errors'
import type {
  BundleContextFactV1,
  BundleContextFactsV1,
  BundleReportFactsV1,
  ConstructKey,
  EvidenceItemV1,
  EvidenceSourceV1,
  FactPresenceV1,
} from './types'
import {
  BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION,
  BUNDLE_REPORT_FACTS_SCHEMA_VERSION,
} from './types'
import { canonicalHash } from '../assessment-runtime/canonical'
import { isBundleEngineKey } from './definition'

const HASH_PATTERN = /^[0-9a-f]{64}$/
const KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const EVIDENCE_ROLES = ['PRIMARY', 'SUPPORTING', 'CONTEXT', 'SAFETY'] as const
const QUALITY_STATES = ['interpretable', 'limited', 'invalid', 'unavailable'] as const

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const assertHash = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `${label} 必须是 64 位 hex hash`)
  }
}

function assertConstructKey(value: unknown): asserts value is ConstructKey {
  if (!isNonEmptyString(value) || !KEY_PATTERN.test(value)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `非法 ConstructKey: ${String(value)}`)
  }
}

const assertPresence = (value: FactPresenceV1, label: string) => {
  if (value.state === 'present') {
    const allowed = typeof value.value === 'number' || typeof value.value === 'string' || typeof value.value === 'boolean'
    if (!allowed) bundleContractFail('EVIDENCE_SOURCE_SHAPE', `${label} present 值类型无效`)
    if (typeof value.value === 'number' && !Number.isFinite(value.value)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `${label} present 数值必须有限`)
    }
    return
  }
  if (value.state !== 'missing' && value.state !== 'invalid' && value.state !== 'not_applicable') {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `${label} 未知 presence state`)
  }
}

const sourceKeys = (source: EvidenceSourceV1): string[] => Object.keys(source).sort()

export const validateEvidenceSource = (source: EvidenceSourceV1): EvidenceSourceV1 => {
  if (!source || typeof source !== 'object') {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'Evidence source 缺失')
  }
  if (source.kind === 'COGNITIVE_METRIC') {
    if (sourceKeys(source).join(',') !== 'kind,metricKey,slotKey,sourceResultHash') {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'COGNITIVE_METRIC 不得混用 scoreKey/contextKey')
    }
    if (!isNonEmptyString(source.slotKey) || !isNonEmptyString(source.metricKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'COGNITIVE_METRIC 需要 slotKey 与 metricKey')
    }
    assertHash(source.sourceResultHash, 'COGNITIVE_METRIC.sourceResultHash')
    return source
  }
  if (source.kind === 'SCALE_SCORE') {
    if (sourceKeys(source).join(',') !== 'kind,scoreKey,slotKey,sourceResultHash') {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'SCALE_SCORE 不得混用 metricKey/contextKey')
    }
    if (!isNonEmptyString(source.slotKey) || !isNonEmptyString(source.scoreKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'SCALE_SCORE 需要 slotKey 与 scoreKey')
    }
    assertHash(source.sourceResultHash, 'SCALE_SCORE.sourceResultHash')
    return source
  }
  if (source.kind === 'CONTEXT_FACT') {
    if (sourceKeys(source).join(',') !== 'contextKey,contextSnapshotHash,kind') {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'CONTEXT_FACT 不得混用 metricKey/scoreKey')
    }
    if (!isNonEmptyString(source.contextKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'CONTEXT_FACT 需要 contextKey')
    }
    assertHash(source.contextSnapshotHash, 'CONTEXT_FACT.contextSnapshotHash')
    return source
  }
  return bundleContractFail('EVIDENCE_SOURCE_SHAPE', `未知 Evidence source kind: ${String((source as { kind?: unknown }).kind)}`)
}

export const validateEvidenceItem = (item: EvidenceItemV1): EvidenceItemV1 => {
  if (!isNonEmptyString(item.evidenceKey) || !KEY_PATTERN.test(item.evidenceKey)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `非法 evidenceKey: ${String(item.evidenceKey)}`)
  }
  assertConstructKey(item.constructKey)
  validateEvidenceSource(item.source)
  assertPresence(item.value, item.evidenceKey)
  if (!QUALITY_STATES.includes(item.quality)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `未知 evidence quality: ${String(item.quality)}`)
  }
  if (!EVIDENCE_ROLES.includes(item.role)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', `未知 evidence role: ${String(item.role)}`)
  }
  if (item.criterionBandKey !== null && !isNonEmptyString(item.criterionBandKey)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'criterionBandKey 必须是冻结 band key 或 null')
  }
  return item
}

export const validateBundleContextFacts = (facts: BundleContextFactsV1): BundleContextFactsV1 => {
  if (facts.schemaVersion !== BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', '不支持的 BundleContextFacts schemaVersion')
  }
  if (!isNonEmptyString(facts.contextDefinitionKey) || !isNonEmptyString(facts.contextDefinitionVersion)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'Context facts 缺少 definition identity')
  }
  assertHash(facts.contextDefinitionHash, 'contextDefinitionHash')
  assertHash(facts.contextSnapshotHash, 'contextSnapshotHash')
  const keys = new Set<string>()
  for (const fact of facts.facts) {
    if (!isNonEmptyString(fact.contextKey) || keys.has(fact.contextKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `Context fact key 无效或重复: ${String(fact.contextKey)}`)
    }
    keys.add(fact.contextKey)
    assertPresence(fact.value, fact.contextKey)
  }
  const expectedHash = hashBundleContextFacts(facts)
  if (expectedHash !== facts.contextSnapshotHash) {
    bundleContractFail('SNAPSHOT_HASH_MISMATCH', 'BundleContextFacts hash 不匹配')
  }
  return facts
}

export const hashBundleContextFacts = (facts: Omit<BundleContextFactsV1, 'contextSnapshotHash'> & { contextSnapshotHash?: string }): string => (
  canonicalHash({
    schemaVersion: facts.schemaVersion,
    contextDefinitionKey: facts.contextDefinitionKey,
    contextDefinitionVersion: facts.contextDefinitionVersion,
    contextDefinitionHash: facts.contextDefinitionHash,
    facts: facts.facts,
  })
)

export const buildBundleContextFacts = (
  input: Omit<BundleContextFactsV1, 'schemaVersion' | 'contextSnapshotHash'>,
): BundleContextFactsV1 => {
  const withoutHash = {
    schemaVersion: BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION,
    ...input,
  }
  return validateBundleContextFacts({
    ...withoutHash,
    contextSnapshotHash: hashBundleContextFacts(withoutHash),
  })
}

export const validateBundleReportFacts = (facts: BundleReportFactsV1): BundleReportFactsV1 => {
  if (facts.schemaVersion !== 1 || facts.factsSchemaVersion !== BUNDLE_REPORT_FACTS_SCHEMA_VERSION) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', '不支持的 BundleReportFacts schema')
  }
  if (!isNonEmptyString(facts.identity.bundleKey) || !isNonEmptyString(facts.identity.bundleVersion)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'Report facts 缺少 Bundle identity')
  }
  if (!isBundleEngineKey(facts.identity.engine.key) || !isNonEmptyString(facts.identity.engine.version)) {
    bundleContractFail('ENGINE_REQUIRED', 'Report facts engine 必须是精确 key/version')
  }
  assertHash(facts.identity.snapshotHash, 'identity.snapshotHash')
  const evidenceKeys = new Set<string>()
  for (const item of facts.evidence) {
    validateEvidenceItem(item)
    if (evidenceKeys.has(item.evidenceKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `重复 evidenceKey: ${item.evidenceKey}`)
    }
    evidenceKeys.add(item.evidenceKey)
  }
  if (!QUALITY_STATES.includes(facts.quality.overall)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'Report facts overall quality 无效')
  }
  if (
    facts.enginePayload.kind !== 'UNAVAILABLE'
    || facts.enginePayload.reason !== 'not_computed'
    || facts.enginePayload.engineKey !== facts.identity.engine.key
    || facts.enginePayload.engineVersion !== facts.identity.engine.version
  ) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'Commit 2 的 enginePayload 只能是 UNAVAILABLE/not_computed')
  }
  if (facts.contextSnapshotHash !== null) assertHash(facts.contextSnapshotHash, 'report contextSnapshotHash')
  assertHash(facts.provenance.compiledBundleRuntimeHash, 'compiledBundleRuntimeHash')
  if (facts.provenance.aggregateInputHash !== null) {
    assertHash(facts.provenance.aggregateInputHash, 'aggregateInputHash')
  }
  for (const hash of facts.provenance.evidenceSourceHashes) assertHash(hash, 'evidenceSourceHashes')
  return facts
}

export const hashBundleReportFacts = (facts: BundleReportFactsV1): string => (
  canonicalHash(validateBundleReportFacts(facts))
)

export const contextFactToEvidenceSource = (fact: BundleContextFactV1, contextSnapshotHash: string): EvidenceSourceV1 => (
  validateEvidenceSource({
    kind: 'CONTEXT_FACT',
    contextKey: fact.contextKey,
    contextSnapshotHash,
  })
)
