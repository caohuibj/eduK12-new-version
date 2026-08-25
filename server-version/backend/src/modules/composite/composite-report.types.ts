import type {
  CognitiveAnalysisProfile,
  CognitiveDomainResult,
  CognitivePackageAnalysisResult,
  EvidenceItem,
  RecommendationResult,
} from '../cognitive-analysis'
import type {
  CompositeAnalysisSnapshotGenerationReason,
  DecryptedCompositeAnalysisSnapshot,
} from './composite-analysis-snapshot.service'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'

export type CompositeReportAudience = 'participant' | 'teacher' | 'researcher'

export interface CompositeSnapshotMetadata {
  id: string
  attemptId: string
  packageKey: string
  packageVersion: string
  profile: CognitiveAnalysisProfile
  analysisDefinitionVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  analysisVersion: string
  reportSchemaVersion: string
  inputFingerprint?: string
  generationReason: CompositeAnalysisSnapshotGenerationReason
  generatedBy?: string | null
  createdAt: string
}

export interface CompositeFacetCoverage {
  facet: string
  evidenceCount: number
  interpretable: boolean
  directionClasses: string[]
}

export interface CompositeParticipantDomain {
  domain: CognitiveDomainResult['domain']
  label: string
  status: CognitiveDomainResult['status']
  consistency: CognitiveDomainResult['consistency']
  summary: string
  caveats: string[]
  facetCoverage: CompositeFacetCoverage[]
}

export interface CompositeTeacherSourceSummary {
  slotKey: string | null
  taskType: string | null
  facet: string | null
  role: EvidenceItem['role']
  interpretable: boolean
  qualityFlags: string[]
  directionClass: EvidenceItem['directionClass']
}

export interface CompositeSafeRecommendation {
  priority: RecommendationResult['priority']
  text: string
}

export interface CompositePackageReportBase {
  audience: CompositeReportAudience
  packageName: string
  packageKey: string
  packageVersion: string
  profile: CognitiveAnalysisProfile
  qualitySummary: CognitivePackageAnalysisResult['qualitySummary']
  cognitiveDomains: CompositeParticipantDomain[] | CognitiveDomainResult[]
  recommendations: CompositeSafeRecommendation[] | RecommendationResult[]
  limitations: string[]
}

export interface CompositeParticipantPackageReport extends CompositePackageReportBase {
  audience: 'participant'
  cognitiveDomains: CompositeParticipantDomain[]
  recommendations: CompositeSafeRecommendation[]
}

export interface CompositeTeacherPackageReport extends CompositePackageReportBase {
  audience: 'teacher'
  snapshotId: string
  snapshotCreatedAt: string
  generationReason: CompositeAnalysisSnapshotGenerationReason
  cognitiveDomains: CompositeParticipantDomain[]
  recommendations: CompositeSafeRecommendation[]
  sourceSummary: CompositeTeacherSourceSummary[]
  qualityFlags: string[]
  observationPrompts: string[]
}

export interface CompositeResearcherPackageReport extends CompositePackageReportBase {
  audience: 'researcher'
  snapshotId: string
  snapshotCreatedAt: string
  generationReason: CompositeAnalysisSnapshotGenerationReason
  analysisDefinitionVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  analysisVersion: string
  reportSchemaVersion: string
  inputFingerprint: string
  cognitiveDomains: CognitiveDomainResult[]
  recommendations: RecommendationResult[]
  evidence: EvidenceItem[]
  crossSourceFindings: CognitivePackageAnalysisResult['crossSourceFindings']
  provenance: Record<string, string>
}

export type CompositePackageReport =
  | CompositeParticipantPackageReport
  | CompositeTeacherPackageReport
  | CompositeResearcherPackageReport

export interface CompositeReportProjectionInput {
  report: Record<string, any>
  packageSnapshot: FrozenReportPackageSnapshot
  snapshot: DecryptedCompositeAnalysisSnapshot
  audience: CompositeReportAudience
}
