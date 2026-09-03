import { canonicalHash } from '../assessment-runtime/canonical'
import { bundleContractFail } from './errors'
import {
  bundleContextFactsSchema,
  bundleReportFactsSchema,
  evidenceItemSchema,
  evidenceSourceSchema,
  parseContract,
} from './schema'
import type {
  BundleContextFactV1,
  BundleContextFactsV1,
  BundleReportFactsV1,
  EvidenceItemV1,
  EvidenceSourceV1,
} from './types'
import { BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION } from './types'

export const validateEvidenceSource = (source: EvidenceSourceV1 | unknown): EvidenceSourceV1 => (
  parseContract(evidenceSourceSchema, source, 'EVIDENCE_SOURCE_SHAPE')
)

export const validateEvidenceItem = (item: EvidenceItemV1 | unknown): EvidenceItemV1 => (
  parseContract(evidenceItemSchema, item, 'EVIDENCE_SOURCE_SHAPE')
)

export const deriveEvidenceSourceHashes = (evidence: EvidenceItemV1[]): string[] => {
  const hashes = new Set<string>()
  for (const item of evidence) {
    if (item.source.kind === 'CONTEXT_FACT') continue
    hashes.add(item.source.sourceResultHash)
  }
  return [...hashes].sort()
}

export const hashBundleContextFacts = (
  facts: Omit<BundleContextFactsV1, 'contextSnapshotHash'> & { contextSnapshotHash?: string },
): string => (
  canonicalHash({
    schemaVersion: facts.schemaVersion,
    contextDefinitionKey: facts.contextDefinitionKey,
    contextDefinitionVersion: facts.contextDefinitionVersion,
    contextDefinitionHash: facts.contextDefinitionHash,
    facts: facts.facts,
  })
)

export const validateBundleContextFacts = (facts: BundleContextFactsV1 | unknown): BundleContextFactsV1 => {
  const parsed = parseContract(bundleContextFactsSchema, facts, 'EVIDENCE_SOURCE_SHAPE')
  const keys = new Set<string>()
  for (const fact of parsed.facts) {
    if (keys.has(fact.contextKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `Context fact key 无效或重复: ${fact.contextKey}`)
    }
    keys.add(fact.contextKey)
  }
  const expectedHash = hashBundleContextFacts(parsed)
  if (expectedHash !== parsed.contextSnapshotHash) {
    bundleContractFail('SNAPSHOT_HASH_MISMATCH', 'BundleContextFacts hash 不匹配')
  }
  return parsed
}

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

const assertReportFactsProvenance = (facts: BundleReportFactsV1) => {
  const expectedHashes = deriveEvidenceSourceHashes(facts.evidence)
  if (canonicalHash(facts.provenance.evidenceSourceHashes) !== canonicalHash(expectedHashes)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'evidenceSourceHashes 必须是 Cognitive/Scale sourceResultHash 的 sorted unique exact set')
  }
  const contextHashes = [...new Set(
    facts.evidence
      .filter((item) => item.source.kind === 'CONTEXT_FACT')
      .map((item) => item.source.kind === 'CONTEXT_FACT' ? item.source.contextSnapshotHash : ''),
  )]
  if (contextHashes.length > 1) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'CONTEXT_FACT 不得引用多个 contextSnapshotHash')
  }
  if (contextHashes.length === 1 && facts.contextSnapshotHash !== contextHashes[0]) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'ReportFacts.contextSnapshotHash 必须等于 CONTEXT_FACT 的 contextSnapshotHash')
  }
}

export const validateBundleReportFacts = (facts: BundleReportFactsV1 | unknown): BundleReportFactsV1 => {
  const parsed = parseContract(bundleReportFactsSchema, facts, 'EVIDENCE_SOURCE_SHAPE') as BundleReportFactsV1
  const evidenceKeys = new Set<string>()
  for (const item of parsed.evidence) {
    if (evidenceKeys.has(item.evidenceKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `重复 evidenceKey: ${item.evidenceKey}`)
    }
    evidenceKeys.add(item.evidenceKey)
  }
  if (
    parsed.enginePayload.engineKey !== parsed.identity.engine.key
    || parsed.enginePayload.engineVersion !== parsed.identity.engine.version
  ) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'enginePayload 必须与 identity.engine 一致')
  }
  if (parsed.enginePayload.kind === 'COMPUTED' && !('payload' in parsed.enginePayload)) {
    bundleContractFail('EVIDENCE_SOURCE_SHAPE', 'COMPUTED enginePayload 必须包含 payload')
  }
  assertReportFactsProvenance(parsed)
  return parsed
}

export const buildBundleReportFacts = (
  input: Omit<BundleReportFactsV1, 'provenance'> & {
    provenance: Omit<BundleReportFactsV1['provenance'], 'evidenceSourceHashes'>
  },
): BundleReportFactsV1 => {
  const evidence = input.evidence.map((item) => validateEvidenceItem(item))
  return validateBundleReportFacts({
    ...input,
    evidence,
    provenance: {
      ...input.provenance,
      evidenceSourceHashes: deriveEvidenceSourceHashes(evidence),
    },
  })
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
