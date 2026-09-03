import { CANONICAL_JSON_SHA256_V1 } from '../assessment-runtime/canonical'

export const ASSESSMENT_BUNDLE_DEFINITION_SCHEMA = 1 as const
export const ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY = 'ASSESSMENT_BUNDLE' as const
export const ASSESSMENT_BUNDLE_SNAPSHOT_VERSION = 3 as const
export const BUNDLE_REPORT_FACTS_SCHEMA_VERSION = 'bundle-report-facts-v1' as const
export const BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION = 1 as const
export const BUNDLE_SNAPSHOT_HASH_SCHEME = CANONICAL_JSON_SHA256_V1

export const BUNDLE_ENGINE_KEYS = [
  'cognitive-domain-v1',
  'scale-evidence-v1',
  'mental-health-rule-v1',
  'integrated-evidence-v1',
] as const

export type BundleEngineKeyV1 = (typeof BUNDLE_ENGINE_KEYS)[number]

export type AssessmentBundleStatusV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED' | 'HOLD'

export type BundleCategoryV1 = 'cognitive' | 'scale_self' | 'observer' | 'integrated'

export type BundleRespondentTypeV1 = 'SELF' | 'PARENT' | 'TEACHER'

export type BundleInitiationModeV1 =
  | 'TEACHER_ASSIGNMENT'
  | 'PARENT_SELF_SERVE'
  | 'ANONYMOUS_SELF'
  | 'STUDENT_COURSE'

export type BundleSlotUnitTypeV1 = 'COGNITIVE' | 'SCALE' | 'FORM'

export type BundleSubjectPopulationV1 = 'youth' | 'adult' | 'unspecified'

export interface BundleEngineRefV1 {
  key: BundleEngineKeyV1
  version: string
}

/**
 * Product orchestration slot. This is not a V3.2 FrozenActiveSlot and must not
 * grow completion state, submit protocol, or child result payloads.
 */
export interface BundleSlotDefinitionV1 {
  slotKey: string
  unitType: BundleSlotUnitTypeV1
  position: number
  required: boolean
  instrumentKey: string
  instrumentVersion: string
  respondentType: BundleRespondentTypeV1
  /** SCALE score keys or COGNITIVE metric keys. FORM omits this. */
  valueSelectors?: string[]
}

export interface BundlePopulationConstraintV1 {
  subjectPopulation: BundleSubjectPopulationV1
  subjectMinAgeYears?: number
  subjectMaxAgeYears?: number
}

export interface BundlePublicationRequirementsV1 {
  scientificGate: boolean
  rightsGate: boolean
  languageGate: boolean
  reportGate: boolean
  safetyGate: boolean
  nonCommercialOnly: boolean
}

export interface BundleRightsRequirementsV1 {
  required: boolean
  instrumentKeys: string[]
}

export interface BundleSafetyCapabilityV1 {
  safetyCapable: boolean
  productionTriggerEnabled: boolean
}

export interface AssessmentBundleDefinitionV1 {
  schemaVersion: typeof ASSESSMENT_BUNDLE_DEFINITION_SCHEMA
  bundleKey: string
  bundleVersion: string
  status: AssessmentBundleStatusV1
  category: BundleCategoryV1
  name: string
  description: string
  respondentTypes: BundleRespondentTypeV1[]
  initiationModes: BundleInitiationModeV1[]
  population: BundlePopulationConstraintV1
  slots: BundleSlotDefinitionV1[]
  engine: BundleEngineRefV1
  contextDefinitionKey: string | null
  contextDefinitionVersion: string | null
  reportDefinitionKey: string
  reportDefinitionVersion: string
  publicationRequirements: BundlePublicationRequirementsV1
  rightsRequirements: BundleRightsRequirementsV1
  safetyCapability: BundleSafetyCapabilityV1
  limitations: string[]
}

export type ConstructKey = string

export type EvidenceRoleV1 = 'PRIMARY' | 'SUPPORTING' | 'CONTEXT' | 'SAFETY'

export type EvidenceQualityStateV1 = 'interpretable' | 'limited' | 'invalid' | 'unavailable'

/**
 * Engine-specific rule layer for mental-health-rule-v1.
 * FACET lives here, not on EvidenceItemV1.role.
 */
export type MentalHealthRuleTierV1 = 'CORE' | 'FACET' | 'CONTEXT' | 'SAFETY'

export interface MentalHealthRuleBindingV1 {
  evidenceKey: string
  tier: MentalHealthRuleTierV1
}

export type EvidenceSourceV1 =
  | {
      kind: 'COGNITIVE_METRIC'
      slotKey: string
      metricKey: string
      sourceResultHash: string
    }
  | {
      kind: 'SCALE_SCORE'
      slotKey: string
      scoreKey: string
      sourceResultHash: string
    }
  | {
      kind: 'CONTEXT_FACT'
      contextKey: string
      contextSnapshotHash: string
    }

export type FactPresenceV1 =
  | { state: 'present'; value: number | string | boolean; unit?: string }
  | { state: 'missing' }
  | { state: 'invalid' }
  | { state: 'not_applicable' }

export interface EvidenceItemV1 {
  evidenceKey: string
  constructKey: ConstructKey
  source: EvidenceSourceV1
  value: FactPresenceV1
  quality: EvidenceQualityStateV1
  criterionBandKey: string | null
  role: EvidenceRoleV1
}

export interface BundleContextFactV1 {
  contextKey: string
  value: FactPresenceV1
}

export interface BundleContextFactsV1 {
  schemaVersion: typeof BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION
  contextDefinitionKey: string
  contextDefinitionVersion: string
  contextDefinitionHash: string
  /** Freeze-time metadata. Not part of contextSnapshotHash. */
  frozenAt: string
  contextSnapshotHash: string
  facts: BundleContextFactV1[]
}

export interface BundleReportFactsV1 {
  schemaVersion: 1
  factsSchemaVersion: typeof BUNDLE_REPORT_FACTS_SCHEMA_VERSION
  identity: {
    bundleKey: string
    bundleVersion: string
    engine: BundleEngineRefV1
    snapshotHash: string
  }
  evidence: EvidenceItemV1[]
  quality: {
    overall: EvidenceQualityStateV1
    notes: string[]
  }
  enginePayload: {
    engineKey: BundleEngineKeyV1
    engineVersion: string
    kind: 'UNAVAILABLE'
    reason: 'not_computed'
  }
  limitations: string[]
  recommendations: string[]
  contextSnapshotHash: string | null
  provenance: {
    compiledBundleRuntimeHash: string
    aggregateInputHash: string | null
    evidenceSourceHashes: string[]
  }
}

export interface BundleRuleSetRefV1 {
  key: string
  version: string
  hash: string
}

export interface FrozenBundleSlotBindingV3 {
  slotKey: string
  unitType: BundleSlotUnitTypeV1
  instrumentKey: string
  instrumentVersion: string
  required: boolean
  respondentType: BundleRespondentTypeV1
  valueSelectors: string[] | null
}

export interface FrozenAssessmentBundleSnapshotV3 {
  snapshotFamily: typeof ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY
  snapshotVersion: typeof ASSESSMENT_BUNDLE_SNAPSHOT_VERSION
  bundleKey: string
  bundleVersion: string
  bundleDefinition: AssessmentBundleDefinitionV1
  bundleDefinitionHash: string
  engine: BundleEngineRefV1
  slotBindings: FrozenBundleSlotBindingV3[]
  contextDefinitionHash: string | null
  rightsSnapshotHash: string | null
  /** Mental-health rule-set freeze ref; null for non-MH engines. */
  ruleSetRef: BundleRuleSetRefV1 | null
  reportDefinitionKey: string
  reportDefinitionVersion: string
  hashScheme: typeof BUNDLE_SNAPSHOT_HASH_SCHEME
  snapshotHash: string
}

export type LegacyUnavailableField = 'unavailable'

export interface LegacyUnavailableFieldsV1 {
  respondent: LegacyUnavailableField
  rights: LegacyUnavailableField
  context: LegacyUnavailableField
  consent: LegacyUnavailableField
  subject: LegacyUnavailableField
}

export type FrozenRuntimeSnapshotFamily =
  | 'ASSESSMENT_BUNDLE'
  | 'LEGACY_REPORT_PACKAGE'
  | 'LEGACY_ANALYSIS_PROTOCOL'
