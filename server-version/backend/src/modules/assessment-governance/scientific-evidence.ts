import type { AssessmentFamily } from './operational-hold'

/**
 * Lightweight pointers only. Evidence bodies remain in their authoritative
 * source (catalog/reference/research documents); this registry never copies
 * norms, samples, scoring definitions or protected content.
 */
export interface ScientificEvidenceIdentityV1 {
  family: AssessmentFamily
  key: string
  version: string
  /** Optional family-specific scoring identity when version alone is insufficient. */
  scoringVersion?: string
}

export interface ScientificEvidenceRecordV1 extends ScientificEvidenceIdentityV1 {
  researchFoundationRefs: string[]
  provenanceRefs: string[]
  empiricalReferenceRefs: string[]
  researchOutputRefs: string[]
  reviewedAt?: string
}

export const scientificEvidenceIdentityKey = (
  identity: ScientificEvidenceIdentityV1,
): string => [
  identity.family,
  identity.key,
  identity.version,
  identity.scoringVersion ?? '',
].join(':')

/**
 * Explicit code-reviewed evidence pointers. Empty by default. Runtime paths do
 * not read this map; CI/admin qualification adapters may.
 */
export const ASSESSMENT_SCIENTIFIC_EVIDENCE = new Map<string, ScientificEvidenceRecordV1>()

export const getScientificEvidenceRecord = (
  identity: ScientificEvidenceIdentityV1,
): ScientificEvidenceRecordV1 | undefined => ASSESSMENT_SCIENTIFIC_EVIDENCE.get(scientificEvidenceIdentityKey(identity))
