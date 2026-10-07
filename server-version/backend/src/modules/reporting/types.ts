import type { ScaleReferenceIdentityV1, LongitudinalReferenceSnapshotV1 } from '../assessment-reference/longitudinal'
export type ReportingSpecStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED' | 'RETIRED'
export type ReportingAggregation = 'MEAN' | 'MEDIAN' | 'SD_POPULATION' | 'SD_SAMPLE' | 'MIN_MAX' | 'QUARTILES' | 'DISTRIBUTION'
export type ReportingMaturity = 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
export type ReportingProvenanceState = 'FROZEN' | 'LEGACY_UNFROZEN'
export type ReportingResultQuality = 'interpretable' | 'limited' | 'invalid'
export type ReportingResourceFamily = 'BUNDLE' | 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'
export type ReportingComparabilityLevel = 'EXACT' | 'COMPATIBLE' | 'LINKED' | 'LIMITED' | 'NOT_COMPARABLE'
export type ReportingComparabilityOperation = 'SIDE_BY_SIDE' | 'DESCRIPTIVE_TREND' | 'NUMERIC_DELTA'
export type ReportingAnalysisKindV1 = 'GROUP' | 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL' | 'PROTECTED_FEEDBACK' | 'INDIVIDUAL_LONGITUDINAL'
export type ReportingArtifactPolicyDomainV1 = 'ORG_GROUP_REPORT_V1' | 'ORG_PROTECTED_FEEDBACK_V1' | 'ORG_INDIVIDUAL_REPORT_V1'

export interface ReportingComparabilityRuleV1 {
  schemaVersion: 1
  metricId: string
  resourceFamily: ReportingResourceFamily
  resourceKey: string
  fromVersion: string
  toVersion: string
  level: Exclude<ReportingComparabilityLevel, 'NOT_COMPARABLE'>
  evidenceRef: string
  evidenceHash: string
}

export interface ReportingComparabilityDecisionV1 {
  schemaVersion: 1
  metricId: string
  level: ReportingComparabilityLevel
  allowedOperations: ReportingComparabilityOperation[]
  evidenceRef: string | null
  evidenceHash: string | null
  limitations: string[]
}

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

export interface ReportingPr4MetricIdentityV1 {
  sourceFamily: ReportingResourceFamily
  sourceResourceKey: string
  valueType: 'NUMBER'
  longitudinalMetricKey: string
}

export type ReportingLongitudinalMetricRuleV1 = ReportingMetricRuleV1 & ReportingPr4MetricIdentityV1
export type ReportingProtectedMetricRuleV1 = Omit<ReportingMetricRuleV1, 'observationUnit'>
  & ReportingPr4MetricIdentityV1
  & { observationUnit: 'RESPONDENT' }

export interface ReportingGroupSpecV1 {
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

export interface ReportingRepeatedCohortSpecV1 {
  schemaVersion: 1
  analysisKind: 'REPEATED_COHORT'
  engineKey: 'ORG_REPEATED_COHORT_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumCohortN: number
  minimumContributorN: number
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingLongitudinalMetricRuleV1[]
  comparabilityRules: ReportingComparabilityRuleV1[]
}

export interface ReportingMatchedLongitudinalSpecV1 {
  schemaVersion: 1
  analysisKind: 'MATCHED_LONGITUDINAL'
  engineKey: 'ORG_MATCHED_LONGITUDINAL_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumCohortN: number
  minimumContributorN: number
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingLongitudinalMetricRuleV1[]
  comparabilityRules: ReportingComparabilityRuleV1[]
}

export interface ReportingProtectedFeedbackSpecV1 {
  schemaVersion: 1
  analysisKind: 'PROTECTED_FEEDBACK'
  engineKey: 'ORG_PROTECTED_FEEDBACK_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'RESPONDENT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  minimumRespondentN: number
  minimumContributorN: number
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingProtectedMetricRuleV1[]
}

export type ReportingAnalysisSpecDefinitionV1 =
  | ReportingGroupSpecV1
  | ReportingRepeatedCohortSpecV1
  | ReportingMatchedLongitudinalSpecV1
  | ReportingProtectedFeedbackSpecV1
  | ReportingIndividualLongitudinalSpecV1

export interface ReportingAnalysisSpecRecord<TDefinition extends ReportingAnalysisSpecDefinitionV1 = ReportingAnalysisSpecDefinitionV1> {
  id: string
  specKey: string
  version: number
  status: ReportingSpecStatus
  definition: TDefinition
  specHash: string
  createdByUserId: string
  createdAt: Date
  reviewedByUserId?: string | null
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

export type ReportingCohortClauseV2 =
  | { kind: 'CLASS_UNITS'; classUnitIds: string[] }
  | { kind: 'LABELS'; labelIds: string[]; match: 'ANY' | 'ALL' }
  | { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] }

export interface ReportingCohortSelectorInputV2 {
  schemaVersion: 2
  clauses: ReportingCohortClauseV2[]
  combine: 'ALL'
}
export interface ReportingCohortSelectorV2 extends ReportingCohortSelectorInputV2 {
  kind: 'FILTERED_RUN_TRACK_SUBJECTS'
  anchor: { kind: 'RUN_PUBLISHED_AT'; at: string }
  baseline?: { cohortSnapshotId: string; cohortIdentityHash: string }
}
export interface ReportingCohortSnapshotPayloadV2 extends Omit<ReportingCohortSnapshotPayloadV1, 'schemaVersion' | 'selector'> {
  schemaVersion: 2
  selector: ReportingCohortSelectorV2
}

export interface ReportingCohortSnapshotRecord {
  id: string
  organizationId: string
  sourceRunId: string
  sourceTrackId: string
  selector: ReportingCohortSnapshotPayloadV1['selector'] | ReportingCohortSelectorV2
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

export interface ReportingResolvedMetricV1 {
  scaleReference?: ScaleReferenceIdentityV1
  key: string
  value: unknown
  resultQuality: ReportingResultQuality
  metricQuality: string | null
}

export interface ReportingWaveResolvedInputV1 {
  executionId: string
  subjectUserId: string
  membershipId: string
  canonicalResultHash: string
  metrics: ReportingResolvedMetricV1[]
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

export interface ReportingRepeatedWaveProjectionV1 {
  waveId: string
  waveKey: string
  ordinal: number
  state: 'present' | 'suppressed'
  eligibleN?: number
  resultContributorN?: number
  metrics?: Record<string, ReportingMetricProjectionV1>
  evidence: ReportingEvidenceProjectionV1
}

export interface ReportingWavePairComparabilityV1 {
  fromWaveId: string
  toWaveId: string
  metrics: Record<string, ReportingComparabilityDecisionV1>
}

export interface ReportingRepeatedCohortProjectionV1 {
  schemaVersion: 1
  kind: 'REPEATED_COHORT'
  state: 'present' | 'suppressed'
  waves: ReportingRepeatedWaveProjectionV1[]
  comparisons: ReportingWavePairComparabilityV1[]
  limitations: ['INDEPENDENT_WAVE_POPULATIONS', 'NOT_INDIVIDUAL_CHANGE']
}

export type ReportingMatchedModeV1 = 'PAIRWISE' | 'FULL_CASE'
export interface ReportingMatchedArtifactMetricProjectionV1 {
  state: 'present' | 'suppressed'
  countKind?: 'PAIRED_VALID' | 'COMPLETE_CASE'
  validCaseN?: number
  waveMeans?: Array<{ waveId: string; waveKey: string; mean: number }>
  comparisons?: Array<{
    fromWaveId: string
    toWaveId: string
    comparability: ReportingComparabilityDecisionV1
    delta?: number
  }>
}
export interface ReportingMatchedArtifactProjectionV1 {
  schemaVersion: 1
  kind: 'MATCHED_LONGITUDINAL'
  mode: ReportingMatchedModeV1
  state: 'present' | 'suppressed'
  waveIds: string[]
  matchedEligibleN?: number
  metrics?: Record<string, ReportingMatchedArtifactMetricProjectionV1>
  evidence: ReportingEvidenceProjectionV1
}

export interface ReportingProtectedMetricProjectionV1 {
  state: 'present' | 'suppressed'
  aggregations?: Record<string, unknown>
}
export interface ReportingProtectedFeedbackProjectionV1 {
  schemaVersion: 1
  kind: 'PROTECTED_FEEDBACK'
  policyDomain: 'ORG_PROTECTED_FEEDBACK_V1'
  state: 'present' | 'suppressed'
  metrics?: Record<string, ReportingProtectedMetricProjectionV1>
  limitations: ['RESPONDENT_PRIVACY_PROTECTED', 'NO_RESPONDENT_IDENTITIES']
}

/** Exact legacy GROUP artifact payload. Do not add fields: existing snapshot hashes commit this shape. */
export interface ReportingGroupArtifactPayloadV1 {
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

export interface ReportingLongitudinalWaveBindingV1 {
  waveId: string
  waveKey: string
  ordinal: number
  cohortSnapshotId: string
  inputIdentityHash: string
  snapshotHash: string
}

export interface ReportingLongitudinalArtifactPayloadV1 {
  schemaVersion: 1
  artifactId: string
  organizationId: string
  analysisKind: 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'
  policyDomain: 'ORG_GROUP_REPORT_V1'
  source: { kind: 'SERIES'; seriesId: string; seriesIdentityHash: string }
  specId: string
  specHash: string
  analysisIdentityHash: string
  generatedByUserId: string
  generatedAt: string
  waveBindings: ReportingLongitudinalWaveBindingV1[]
  maturityProfile: Record<string, number>
  options: { mode?: ReportingMatchedModeV1 }
  projection: ReportingRepeatedCohortProjectionV1 | ReportingMatchedArtifactProjectionV1
}

export interface ReportingProtectedArtifactInputV1 {
  executionId: string
  respondentUserId: string
  respondentMembershipId: string | null
  state: 'COMPLETED' | 'MISSING'
  canonicalResultHash: string | null
  scientificMaturity: ReportingMaturity | null
  provenanceState: ReportingProvenanceState | null
  scientificProvenanceHash: string | null
}

export interface ReportingProtectedArtifactPayloadV1 {
  schemaVersion: 1
  artifactId: string
  organizationId: string
  analysisKind: 'PROTECTED_FEEDBACK'
  policyDomain: 'ORG_PROTECTED_FEEDBACK_V1'
  source: {
    kind: 'RUN_TRACK_PROTECTED'
    runId: string
    trackId: string
    subjectActorSnapshotId: string
    subjectUserId: string
    relationshipKind: string
    perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
  }
  resource: { family: ReportingResourceFamily; key: string; version: string }
  specId: string
  specHash: string
  analysisIdentityHash: string
  generatedByUserId: string
  generatedAt: string
  inputManifest: ReportingProtectedArtifactInputV1[]
  inputIdentityHash: string
  maturityProfile: Record<string, number>
  evidence: ReportingEvidenceProjectionV1
  projection: ReportingProtectedFeedbackProjectionV1
  /** Private publication proof; absent on immutable legacy artifacts. */
  fixedPopulationDisclosure?: { schemaVersion: 1; complete: boolean }
}

export type ReportingArtifactPayloadV1 =
  | ReportingGroupArtifactPayloadV1
  | ReportingLongitudinalArtifactPayloadV1
  | ReportingProtectedArtifactPayloadV1
  | ReportingIndividualArtifactPayloadV1

interface ReportingArtifactRecordBase {
  id: string
  organizationId: string
  specId: string
  analysisIdentityHash: string
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}
export interface ReportingGroupArtifactRecord extends ReportingArtifactRecordBase {
  analysisKind: 'GROUP'
  policyDomain: 'ORG_GROUP_REPORT_V1'
  cohortSnapshotId: string
  seriesId: null
  sourceRunId: null
  sourceTrackId: null
  subjectActorSnapshotId: null
  relationshipKind: null
  perspective: null
  artifactPayload: ReportingGroupArtifactPayloadV1
}
export interface ReportingLongitudinalArtifactRecord extends ReportingArtifactRecordBase {
  analysisKind: 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'
  policyDomain: 'ORG_GROUP_REPORT_V1'
  cohortSnapshotId: null
  seriesId: string
  sourceRunId: null
  sourceTrackId: null
  subjectActorSnapshotId: null
  relationshipKind: null
  perspective: null
  artifactPayload: ReportingLongitudinalArtifactPayloadV1
}
export interface ReportingProtectedArtifactRecord extends ReportingArtifactRecordBase {
  analysisKind: 'PROTECTED_FEEDBACK'
  policyDomain: 'ORG_PROTECTED_FEEDBACK_V1'
  cohortSnapshotId: null
  seriesId: null
  sourceRunId: string
  sourceTrackId: string
  subjectActorSnapshotId: string
  relationshipKind: string
  perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
  artifactPayload: ReportingProtectedArtifactPayloadV1
}
export type ReportingArtifactRecord = ReportingGroupArtifactRecord | ReportingLongitudinalArtifactRecord | ReportingProtectedArtifactRecord | ReportingIndividualArtifactRecord

export class ReportingError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'ReportingError'
  }
}

export const reportingFail = (code: string, message: string, statusCode = 409): never => {
  throw new ReportingError(code, message, statusCode)
}

export type ReportingIndividualMetricRuleV1 = Omit<ReportingLongitudinalMetricRuleV1, 'aggregations' | 'minimumMetricN'>
export interface ReportingIndividualLongitudinalSpecV1 {
  schemaVersion: 1
  analysisKind: 'INDIVIDUAL_LONGITUDINAL'
  engineKey: 'ORG_INDIVIDUAL_LONGITUDINAL_V1'
  engineVersion: '1.0.0'
  privacyUnit: 'SUBJECT'
  selectionPolicy: 'UNIQUE_OR_REJECT'
  reportEvidenceCeiling: ReportingMaturity
  metricRules: ReportingIndividualMetricRuleV1[]
  comparabilityRules: ReportingComparabilityRuleV1[]
}
export interface ReportingIndividualProjectionV1 {
  schemaVersion: 1
  kind: 'INDIVIDUAL_LONGITUDINAL'
  referenceTrajectories?: { metrics: Record<string, LongitudinalReferenceSnapshotV1> }
  state: 'present'
  waves: Array<{
    waveId: string
    waveKey: string
    ordinal: number
    metrics: Record<string, { state: 'present'; value: number } | { state: 'missing'; reason: 'NOT_COMPLETED' | 'METRIC_UNAVAILABLE' }>
    evidence: ReportingEvidenceProjectionV1
  }>
  comparisons: Array<{
    fromWaveId: string
    toWaveId: string
    metrics: Record<string, { comparability: ReportingComparabilityDecisionV1; delta?: number }>
  }>
  limitations: string[]
}
export interface ReportingIndividualArtifactPayloadV1 extends Omit<ReportingLongitudinalArtifactPayloadV1, 'analysisKind' | 'policyDomain' | 'projection'> {
  analysisKind: 'INDIVIDUAL_LONGITUDINAL'
  policyDomain: 'ORG_INDIVIDUAL_REPORT_V1'
  subjectUserId: string
  projection: ReportingIndividualProjectionV1
}
export interface ReportingIndividualArtifactRecord extends Omit<ReportingLongitudinalArtifactRecord, 'analysisKind' | 'policyDomain' | 'artifactPayload'> {
  analysisKind: 'INDIVIDUAL_LONGITUDINAL'
  policyDomain: 'ORG_INDIVIDUAL_REPORT_V1'
  subjectUserId: string
  artifactPayload: ReportingIndividualArtifactPayloadV1
}
