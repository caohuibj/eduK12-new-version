export type ReportingSpecStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED' | 'RETIRED'
export type ReportingAggregation = 'MEAN' | 'MEDIAN' | 'SD_POPULATION' | 'SD_SAMPLE' | 'MIN_MAX' | 'QUARTILES' | 'DISTRIBUTION'
export type ReportingMaturity = 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
export type ReportingProvenanceState = 'FROZEN' | 'LEGACY_UNFROZEN'
export type ReportingResultQuality = 'interpretable' | 'limited' | 'invalid'
export type ReportingResourceFamily = 'BUNDLE' | 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'

export interface ReportingMetricRuleV1 {
  metricId: string
  sourceMetricKey: string
  acceptedResultQuality: ReportingResultQuality[]
  acceptedMetricQuality: string[] | 'IGNORE_METRIC_QUALITY'
  aggregations: ReportingAggregation[]
  missingnessRule: 'EXCLUDE'
  minimumMetricN: number
  observationUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
}

export interface ReportingAnalysisSpecDefinitionV1 {
  schemaVersion: 1
  analysisKind: 'GROUP'
  engineKey: 'ORG_GROUP_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumCohortN: number
  minimumContributorN: number
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingMetricRuleV1[]
}

export interface ReportingAnalysisSpecRecord {
  id: string
  specKey: string
  version: number
  status: ReportingSpecStatus
  definition: ReportingAnalysisSpecDefinitionV1
  specHash: string
  createdByUserId: string
  createdAt: Date
  reviewedAt: Date | null
  publishedAt: Date | null
}

export interface ReportingCohortMemberV1 {
  userId: string
  membershipId: string
  actorSnapshotId: string
  executionId: string
}

export interface ReportingCohortSnapshotPayloadV1 {
  schemaVersion: 1
  organizationId: string
  source: { kind: 'RUN_TRACK'; runId: string; trackId: string }
  selector: { kind: 'RUN_TRACK_SUBJECTS'; runId: string; trackId: string }
  members: ReportingCohortMemberV1[]
  eligibleN: number
  generatedByUserId: string
  generatedAt: string
}

export interface ReportingCohortSnapshotRecord {
  id: string
  organizationId: string
  sourceRunId: string
  sourceTrackId: string
  selector: ReportingCohortSnapshotPayloadV1['selector']
  members: ReportingCohortMemberV1[]
  eligibleN: number
  cohortIdentityHash: string
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}

export interface ReportingSeriesScopeV1 {
  schemaVersion: 1
  resourceFamily: ReportingResourceFamily
  /** Stable resource identity across versions; comparability governs cross-version deltas. */
  resourceKey: string
}

export interface ReportingSeriesRecordV1 {
  id: string
  organizationId: string
  seriesKey: string
  scope: ReportingSeriesScopeV1
  seriesIdentityHash: string
  snapshotHash: string
  createdByUserId: string
  createdAt: Date
}

export interface ReportingWaveResolvedInputV1 {
  executionId: string
  subjectUserId: string
  membershipId: string
  canonicalResultHash: string
  scientificMaturity: ReportingMaturity | null
  provenanceState: ReportingProvenanceState
  scientificProvenanceHash: string | null
}

export interface ReportingWaveUnresolvedInputV1 {
  executionId: string
  subjectUserId: string
  membershipId: string
  reason: 'NOT_COMPLETED'
}

export interface ReportingWaveInputManifestV1 {
  schemaVersion: 1
  resource: {
    family: ReportingResourceFamily
    key: string
    version: string
    minimumN: number | null
  }
  resolved: ReportingWaveResolvedInputV1[]
  unresolved: ReportingWaveUnresolvedInputV1[]
}

export interface ReportingSeriesWaveRecordV1 {
  id: string
  organizationId: string
  seriesId: string
  waveKey: string
  ordinal: number
  cohortSnapshotId: string
  sourceRunId: string
  sourceTrackId: string
  inputManifest: ReportingWaveInputManifestV1
  inputIdentityHash: string
  snapshotHash: string
  createdByUserId: string
  createdAt: Date
}

export interface ReportingResolvedMetricV1 {
  key: string
  value: unknown
  resultQuality: ReportingResultQuality
  metricQuality: string | null
}

export interface ReportingResolvedExecutionV1 {
  executionId: string
  subjectUserId: string
  membershipId: string
  trackId: string
  canonicalResultHash: string
  metrics: ReportingResolvedMetricV1[]
  scientificMaturity: ReportingMaturity | null
  provenanceState: ReportingProvenanceState
  scientificProvenanceHash: string | null
}

export interface ReportingUnresolvedExecutionV1 {
  executionId: string
  subjectUserId: string
  membershipId: string
  reason: 'NOT_COMPLETED'
}

export interface ReportingResultBatchV1 {
  resourceFamily: ReportingResourceFamily
  resourceKey: string
  resourceVersion: string
  resourceMinimumN: number | null
  resolved: ReportingResolvedExecutionV1[]
  unresolved: ReportingUnresolvedExecutionV1[]
}

export interface ReportingEvidenceProjectionV1 {
  level: ReportingMaturity
  limitations: string[]
}

export interface ReportingMetricProjectionV1 {
  state: 'present' | 'suppressed'
  validN?: number
  missingN?: number
  aggregations?: Record<string, unknown>
}

export interface ReportingSafeProjectionV1 {
  schemaVersion: 1
  kind: 'GROUP'
  state: 'present' | 'suppressed'
  eligibleN?: number
  resultContributorN?: number
  metrics?: Record<string, ReportingMetricProjectionV1>
  evidence?: ReportingEvidenceProjectionV1
}

export interface ReportingArtifactPayloadV1 {
  schemaVersion: 1
  artifactId: string
  organizationId: string
  source: { runId: string; trackId: string }
  cohortSnapshotId: string
  cohortIdentityHash: string
  specId: string
  specHash: string
  analysisIdentityHash: string
  generatedByUserId: string
  generatedAt: string
  inputManifest: Array<{
    executionId: string
    subjectUserId: string
    membershipId: string
    canonicalResultHash: string
    scientificMaturity: ReportingMaturity | null
    provenanceState: ReportingProvenanceState
    scientificProvenanceHash: string | null
  }>
  maturityProfile: Record<string, number>
  projection: ReportingSafeProjectionV1
}

export interface ReportingArtifactRecord {
  id: string
  organizationId: string
  cohortSnapshotId: string
  specId: string
  analysisIdentityHash: string
  artifactPayload: ReportingArtifactPayloadV1
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}

export class ReportingError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'ReportingError'
  }
}

export const reportingFail = (code: string, message: string, statusCode = 409): never => {
  throw new ReportingError(code, message, statusCode)
}
