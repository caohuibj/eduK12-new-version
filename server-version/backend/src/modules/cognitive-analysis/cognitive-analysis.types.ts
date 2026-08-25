import type { CognitiveProfile } from '../cognitive/cognitive.types'
import type { FrozenReportSnapshot } from '../cognitive/profile-freeze'

export type CognitiveAnalysisProfile = Exclude<CognitiveProfile, 'experience'>

export type CognitiveDomainKey =
  | 'processing_speed'
  | 'sustained_attention'
  | 'response_inhibition'
  | 'interference_control'
  | 'working_memory'
  | 'cognitive_flexibility'
  | 'episodic_learning_memory'
  | 'fluid_reasoning'
  | 'visuospatial_reasoning'
  | 'planning'

export interface CognitiveDomainDefinition {
  key: CognitiveDomainKey
  label: string
  description: string
  facets: Array<{ key: string; label: string }>
}

export type EvidenceRole = 'primary' | 'supporting'

export interface CognitiveMetricEvidenceMapping {
  testType: string
  engineVersion: string
  scoringVersion: string
  metricDefinitionVersion: string
  metricKey: string
  domain: CognitiveDomainKey
  facet: string
  role: EvidenceRole
}

export type EvidenceInterpretation = 'descriptive' | 'criterion' | 'reference' | 'self_report'
export type EvidenceDirectionClass = 'more_difficulty' | 'more_strength' | 'neutral' | 'unknown'

/** JSON-compatible metric value. Structured metrics are intentionally preserved. */
export type EvidenceValue =
  | null
  | boolean
  | number
  | string
  | EvidenceValue[]
  | { [key: string]: EvidenceValue }

export type CognitiveMetricInterpretation =
  | {
    interpretation: 'descriptive'
    directionClass: 'unknown'
    provenance?: Record<string, string>
  }
  | {
    interpretation: 'criterion' | 'reference'
    directionClass: Exclude<EvidenceDirectionClass, 'unknown'>
    provenance: Record<string, string> & {
      basisId: string
      basisVersion: string
    }
  }

export interface EvidenceItem {
  id: string
  sourceType: 'cognitive_metric' | 'scale_dimension'
  sourceResultId: string
  construct: CognitiveDomainKey
  facet?: string
  metricKey?: string
  value: EvidenceValue
  unit?: string
  role: EvidenceRole
  interpretation: EvidenceInterpretation
  directionClass: EvidenceDirectionClass
  interpretable: boolean
  qualityFlags: string[]
  provenance: Record<string, string>
}

/** Decrypted, immutable single-task result supplied to the package analysis engine. */
export interface FrozenCognitiveModuleResult {
  slotKey: string
  sourceResultId: string
  assignmentId?: string | null
  profile: CognitiveAnalysisProfile
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
  frozenReport: FrozenReportSnapshot
  metricInterpretations?: Record<string, CognitiveMetricInterpretation>
  provenance?: Record<string, string>
}

/**
 * Frozen scored output for a scale slot. Raw answers are deliberately not a
 * member of this contract; the package engine receives only the selected
 * dimension score and immutable mapping metadata.
 */
export interface FrozenScaleModuleResult {
  slotKey: string
  sourceResultId: string
  compositeItemId?: string | null
  scaleId: string
  scaleCode: string
  dimensionCode: string
  scaleDefinitionHash: string
  dimensionScore: number | null
  profile: CognitiveAnalysisProfile
  mappingKey: string
  mappingVersion: string
  respondentType: 'participant_self_report'
  valueSelector: 'dimensionScore'
  qualityFlags: Record<string, unknown>
  provenance?: Record<string, string>
}

export type CognitiveDomainStatus =
  | 'not_measured'
  | 'insufficient_quality'
  | 'descriptive_only'
  | 'interpretable'

export type CognitiveDomainConsistency = 'not_applicable' | 'consistent' | 'mixed' | 'divergent'

export interface CognitiveDomainResult {
  domain: CognitiveDomainKey
  label: string
  status: CognitiveDomainStatus
  evidence: EvidenceItem[]
  consistency: CognitiveDomainConsistency
  summary: string
  strengths: string[]
  watchItems: string[]
  caveats: string[]
}

export interface CrossSourceFinding {
  construct: CognitiveDomainKey
  type: 'paired_description' | 'convergence' | 'divergence' | 'single_source' | 'insufficient_quality'
  evidenceRefs: string[]
  summary: string
  caveat?: string
  confidence: 'descriptive' | 'moderate'
  /** A finding can be retained as an explicit unavailable record when a
   * frozen source cannot be compared. This is intentionally not a diagnosis
   * state and keeps the distinction visible to researcher/admin consumers. */
  availability?: 'available' | 'unavailable'
}

export interface RecommendationResult {
  ruleId: string
  ruleVersion: string
  audience: 'participant' | 'teacher' | 'researcher'
  /** Scope of the rule for researcher-side audit; safe projections omit it. */
  construct?: RecommendationConstruct
  priority: 'info' | 'watch' | 'follow_up'
  evidenceRefs: string[]
  text: string
}

export type RecommendationAudience = RecommendationResult['audience']
export type RecommendationConstruct = CognitiveDomainKey | 'domain' | 'cross_source'

export interface RecommendationRuleContext {
  packageKey: string
  packageVersion: string
  cognitiveDomains: CognitiveDomainResult[]
  crossSourceFindings: CrossSourceFinding[]
  evidence: EvidenceItem[]
}

export const COGNITIVE_ANALYSIS_VERSION = 'cognitive-evidence-domain-v1.0.0'
export const MULTISOURCE_ANALYSIS_VERSION = 'cognitive-evidence-domain-v1.1.0'
export const COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION = 'cognitive-package-analysis-v1'
export const MULTISOURCE_ANALYSIS_REPORT_SCHEMA_VERSION = 'cognitive-package-analysis-v2'

export type CognitivePackageAnalysisVersion =
  | typeof COGNITIVE_ANALYSIS_VERSION
  | typeof MULTISOURCE_ANALYSIS_VERSION

export type CognitivePackageAnalysisReportSchemaVersion =
  | typeof COGNITIVE_ANALYSIS_REPORT_SCHEMA_VERSION
  | typeof MULTISOURCE_ANALYSIS_REPORT_SCHEMA_VERSION

export interface CognitivePackageAnalysisResult {
  packageKey: string
  packageVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  profile: CognitiveAnalysisProfile
  analysisVersion: CognitivePackageAnalysisVersion
  reportSchemaVersion: CognitivePackageAnalysisReportSchemaVersion
  qualitySummary: {
    interpretableModules: number
    excludedModules: string[]
    warnings: string[]
  }
  evidence: EvidenceItem[]
  cognitiveDomains: CognitiveDomainResult[]
  crossSourceFindings: CrossSourceFinding[]
  recommendations: RecommendationResult[]
  limitations: string[]
  provenance: Record<string, string>
}

export interface CompositeReportV2<TModule = unknown> {
  attemptId: string
  assessmentId: string
  name: string
  generatedAt: string
  snapshotId: string
  protocolKey: string
  protocolVersion: string
  analysisVersion: string
  reportSchemaVersion: string
  qualitySummary: {
    interpretableModules: number
    excludedModules: string[]
    warnings: string[]
  }
  modules: TModule[]
  cognitiveDomains: CognitiveDomainResult[]
  crossSourceFindings: CrossSourceFinding[]
  recommendations: RecommendationResult[]
  limitations: string[]
  provenance: Record<string, string>
}

export type AnalysisProtocolStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'

export interface CognitiveProtocolSlotDefinition {
  key: string
  label: string
  position: number
  required: true
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  profileDefinitionVersion: string
  metricDefinitionVersion: string
  qualityDefinitionVersion: string
  reportDefinitionVersion: string
}

export interface ScaleProtocolSlotDefinition {
  key: string
  label: string
  position: number
  required: true
  mappingKey: string
  mappingVersion: string
  expectedScaleCode: string
  expectedDimensionCode: string
  respondentType: 'participant_self_report'
  valueSelector: 'dimensionScore'
}

export interface AnalysisProtocolDefinition {
  key: string
  version: string
  status: AnalysisProtocolStatus
  name: string
  description: string
  recommendedForCreate: boolean
  profiles: CognitiveAnalysisProfile[]
  estimatedMinutes: Record<CognitiveAnalysisProfile, [number, number]>
  cognitiveSlots: CognitiveProtocolSlotDefinition[]
  scaleSlots: ScaleProtocolSlotDefinition[]
  outputDomains: CognitiveDomainKey[]
  domainDefinitionVersion: string
  evidenceMappingVersion: string
  recommendationRuleVersion: string
  disabledReason?: string
}

export interface RecommendationRuleDefinition {
  id: string
  version: string
  construct: RecommendationConstruct
  audiences: RecommendationAudience[]
  priority: RecommendationResult['priority']
  domainMatches?: (domain: CognitiveDomainResult, context: RecommendationRuleContext) => boolean
  matches: (context: RecommendationRuleContext) => boolean
  evidenceRefs: (context: RecommendationRuleContext) => string[]
  textByAudience: Record<RecommendationAudience, (context: RecommendationRuleContext) => string>
}
