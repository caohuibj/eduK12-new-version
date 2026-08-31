import type { CognitiveAnalysisProfile } from '../cognitive-analysis/cognitive-analysis.types'

export const MENTAL_HEALTH_ANALYSIS_ENGINE_KEY = 'mental-health-rule-v1' as const
export const MENTAL_HEALTH_BUNDLE_ANALYSIS_VERSION = 'mental-health-bundle-rule-v1.0.0' as const
export const MENTAL_HEALTH_BUNDLE_REPORT_SCHEMA_VERSION = 'mental-health-bundle-report-v1' as const
export const MENTAL_HEALTH_BUNDLE_FACTS_SCHEMA_VERSION = 'bundle-report-facts-v1' as const
export const MENTAL_HEALTH_BUNDLE_RULESET_VERSION = 'mental-health-bundle-rules-v1.0.0' as const
export const MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION = 'mental-health-bundle-evidence-v1.0.0' as const

export type MentalHealthBundleStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'
export type MentalHealthBundleCategory = 'youth_self' | 'parent_caregiver' | 'teacher' | 'adult_self'
export type BundleEvidenceRole = 'PRIMARY' | 'SUPPORTING' | 'FACET' | 'CONTEXT' | 'SAFETY'
export type BundleQualityState = 'interpretable' | 'limited' | 'invalid'
export type BundleOutcomeCode =
  | 'LOW_CONCERN'
  | 'MIXED_RESULTS'
  | 'CONSISTENT_SIGNAL'
  | 'STRONG_CONVERGENCE'
  | 'CONCERN_WITH_LOW_WELLBEING'
  | 'SAFETY_ESCALATED'
  | 'INSUFFICIENT_QUALITY'
export type BundleActionTier = 'NONE' | 'OBSERVE' | 'DISCUSS' | 'FOLLOW_UP' | 'SAFETY_ESCALATION'
export type BundleEvidenceDirection = 'higher_is_worse' | 'higher_is_better' | 'descriptive' | 'neutral'

/**
 * One semantic output from a ScaleResultV2. Multiple mappings may point to
 * the same Scale slot; a scale is administered once and remains the
 * authoritative owner of all of its scores.
 */
export interface BundleEvidenceMappingDefinition {
  mappingKey: string
  mappingVersion: string
  scaleCode: string
  scoreKey: string
  role: BundleEvidenceRole
  construct: string
  facet?: string
  direction: BundleEvidenceDirection
  classificationCodes?: string[]
  safetyTriggerCodes?: string[]
  feedbackBlockKey?: string
}

export interface MentalHealthBundleScaleSlotDefinition {
  key: string
  label: string
  position: number
  required: true
  expectedScaleCode: string
  expectedInstrumentVersion?: string
  respondentType: string
  mappings: BundleEvidenceMappingDefinition[]
}

export interface BundleCoreRuleDefinition {
  ruleId: string
  ruleVersion: string
  requiredEvidence: Array<{
    mappingKey: string
    classification: string
  }>
  outcomeCode: BundleOutcomeCode
  actionTier: BundleActionTier
  feedbackBlockKey: string
}

export interface BundleFacetRuleDefinition {
  ruleId: string
  ruleVersion: string
  mappingKey: string
  feedbackBlockKey: string
}

export interface BundleContextRuleDefinition {
  ruleId: string
  ruleVersion: string
  mappingKey: string
  feedbackBlockKey: string
}

export interface BundleFeedbackBlock {
  key: string
  text: string
  audience: Array<'participant' | 'teacher' | 'researcher'>
}

export interface MentalHealthBundlePublicationGate {
  exactFormsVerified: boolean
  rightsVerified: boolean
  scoringAndReferenceVerified: boolean
  chineseEvidenceVerified: boolean
  safetyGateRequired: boolean
  safetyGatePassed: boolean
  notes: string[]
}

export interface MentalHealthBundleDefinition {
  key: string
  version: string
  status: MentalHealthBundleStatus
  category: MentalHealthBundleCategory
  name: string
  description: string
  subjectPopulation: 'youth' | 'adult'
  respondentType: string
  construct: string
  purpose: string
  estimatedMinutes: Record<CognitiveAnalysisProfile, [number, number]>
  profiles: CognitiveAnalysisProfile[]
  scaleSlots: MentalHealthBundleScaleSlotDefinition[]
  ruleSetKey: string
  ruleSetVersion: string
  reportDefinitionVersion: string
  evidenceMappingVersion: string
  coreRules: BundleCoreRuleDefinition[]
  facetRules: BundleFacetRuleDefinition[]
  contextRules: BundleContextRuleDefinition[]
  feedbackBlocks: BundleFeedbackBlock[]
  publicationGate: MentalHealthBundlePublicationGate
  limitations: string[]
  disabledReason?: string
}

export interface FrozenBundleScaleEvidence {
  slotKey: string
  sourceResultId: string
  compositeItemId?: string | null
  scaleId: string
  scaleCode: string
  instrumentVersion: string
  scoreKey: string
  value: number | null
  scoreStatus: 'calculated' | 'limited' | 'not_calculable'
  classification: string | null
  profile: CognitiveAnalysisProfile
  mappingKey: string
  mappingVersion: string
  role: BundleEvidenceRole
  construct: string
  facet?: string
  direction: BundleEvidenceDirection
  respondentType: string
  qualityState: BundleQualityState
  qualityFlags: string[]
  provenance: Record<string, string>
}

export interface BundleEvidenceFact extends FrozenBundleScaleEvidence {
  id: string
  interpretable: boolean
}

export interface BundleCoreMatchFact {
  ruleId: string | null
  ruleVersion: string | null
  requiredEvidence: string[]
  matched: boolean
  outcomeCode: BundleOutcomeCode
  actionTier: BundleActionTier
  feedbackBlockKey: string | null
}

export interface BundleFindingFact {
  ruleId: string
  ruleVersion: string
  role: 'FACET' | 'CONTEXT'
  key: string
  evidenceRefs: string[]
  available: boolean
  feedbackBlockKey: string | null
}

export interface BundleSafetySignalFact {
  evidenceRef: string
  mappingKey: string
  active: boolean
  code: string | null
}

/**
 * Structured, immutable facts are the canonical output for future history,
 * cross-informant, and LLM narrative consumers. No renderer may be treated as
 * the source of scoring truth.
 */
export interface BundleReportFacts {
  schemaVersion: typeof MENTAL_HEALTH_BUNDLE_FACTS_SCHEMA_VERSION
  analysisEngineKey: typeof MENTAL_HEALTH_ANALYSIS_ENGINE_KEY
  packageKey: string
  packageVersion: string
  ruleSetKey: string
  ruleSetVersion: string
  reportDefinitionVersion: string
  evidenceMappingVersion: string
  profile: CognitiveAnalysisProfile
  quality: {
    state: BundleQualityState
    primaryAvailable: boolean
    interpretableEvidenceCount: number
    excludedEvidenceRefs: string[]
    warnings: string[]
  }
  core: BundleCoreMatchFact
  outcomeCode: BundleOutcomeCode
  actionTier: BundleActionTier
  evidence: BundleEvidenceFact[]
  facetFindings: BundleFindingFact[]
  contextFindings: BundleFindingFact[]
  safetySignals: BundleSafetySignalFact[]
  feedbackBlockKeys: string[]
  limitations: string[]
  subject: { userId?: string | null; subjectKey?: string | null }
  respondent: { userId?: string | null; respondentKey?: string | null; respondentType: string }
  assessmentEpisodeId?: string | null
  provenance: Record<string, string>
}

export interface MentalHealthBundleReport {
  conclusion: string
  mainConstruct: string
  consistency: string
  facets: Array<{ key: string; available: boolean; feedback: string | null; evidenceRefs: string[] }>
  context: Array<{ key: string; available: boolean; feedback: string | null; evidenceRefs: string[] }>
  nextSteps: string[]
  limitations: string[]
}

export interface MentalHealthBundleAnalysisResult {
  analysisEngineKey: typeof MENTAL_HEALTH_ANALYSIS_ENGINE_KEY
  packageKey: string
  packageVersion: string
  /** Compatibility aliases used by the existing composite snapshot schema. */
  analysisProtocolKey: string
  analysisProtocolVersion: string
  profile: CognitiveAnalysisProfile
  analysisVersion: typeof MENTAL_HEALTH_BUNDLE_ANALYSIS_VERSION
  reportSchemaVersion: typeof MENTAL_HEALTH_BUNDLE_REPORT_SCHEMA_VERSION
  qualitySummary: {
    interpretableModules: number
    excludedModules: string[]
    warnings: string[]
  }
  outcomeCode: BundleOutcomeCode
  actionTier: BundleActionTier
  bundleReportFacts: BundleReportFacts
  report: MentalHealthBundleReport
  /** Evidence is retained under the generic field for snapshot consumers. */
  evidence: BundleEvidenceFact[]
  limitations: string[]
  provenance: Record<string, string>
}

export interface BuildMentalHealthBundleAnalysisInput {
  bundle: MentalHealthBundleDefinition
  packageKey: string
  packageVersion: string
  profile: CognitiveAnalysisProfile
  scaleResults: FrozenBundleScaleEvidence[]
  attemptId?: string
  assessmentId?: string
  subject?: { userId?: string | null; subjectKey?: string | null }
  respondent?: { userId?: string | null; respondentKey?: string | null; respondentType?: string }
  assessmentEpisodeId?: string | null
}
