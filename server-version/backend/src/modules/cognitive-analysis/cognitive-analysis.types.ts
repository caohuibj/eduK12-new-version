import type { CognitiveProfile } from '../cognitive/cognitive.types'

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

export interface EvidenceItem {
  id: string
  sourceType: 'cognitive_metric' | 'scale_dimension'
  sourceResultId: string
  construct: CognitiveDomainKey
  facet?: string
  metricKey?: string
  value: number | string | null
  unit?: string
  role: EvidenceRole
  interpretation: EvidenceInterpretation
  directionClass: EvidenceDirectionClass
  interpretable: boolean
  qualityFlags: string[]
  provenance: Record<string, string>
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
  type: 'convergence' | 'divergence' | 'single_source' | 'insufficient_quality'
  evidenceRefs: string[]
  summary: string
  caveat?: string
  confidence: 'descriptive' | 'moderate'
}

export interface RecommendationResult {
  ruleId: string
  ruleVersion: string
  audience: 'participant' | 'teacher' | 'researcher'
  priority: 'info' | 'watch' | 'follow_up'
  evidenceRefs: string[]
  text: string
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
  construct: CognitiveDomainKey
  audiences: Array<'participant' | 'teacher' | 'researcher'>
  priority: RecommendationResult['priority']
  text: string
}

