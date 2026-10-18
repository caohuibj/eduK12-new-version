import type { ReportingComparabilityDecisionV1 } from '../reporting/types'

export type TrainingAnalysisModeV1 = 'PAIRWISE' | 'FULL_CASE'
export interface TrainingAnalysisWaveV1 {
  waveKey: string
  taskId: string
  /** Exact frozen publication, represented as its canonical ISO timestamp. */
  publication: string
  configDigest: string | null
  variantKey: string | null
  metrics: Array<{ metricKey: string; itemId: string }>
}
export interface TrainingAnalysisRequestV1 {
  schemaVersion: 1
  courseId: string
  waves: TrainingAnalysisWaveV1[]
  mode: TrainingAnalysisModeV1
}
export interface TrainingMetricIdentityV1 {
  instrumentKey: string
  scoreKey: string
  scoringDigest: string
  responseSignature: string
  respondentType: string
  unit: string | null
  version: string
}
export type TrainingObservationReason =
  | 'RESEARCH_SCOPE_NOT_COVERED' | 'RESEARCH_CONSENT_UNKNOWN' | 'RESEARCH_WITHDRAWAL_PENDING' | 'RESEARCH_EXCLUDED'
  | 'QUALITY_EXCLUDED' | 'NOT_COMPARABLE' | 'NOT_ASSIGNED' | 'UNANSWERED'
  | 'NON_FINAL' | 'NOT_ATTEMPTED' | 'INVALID_VALUE' | 'MISSING_SOURCE'
  | 'LEGACY_UNSCOPED' | 'IDENTITY_UNAVAILABLE' | 'NO_OBSERVATION' | 'NOT_CALCULABLE'
/** Only an authorized adapter may create this source. Never use an anonymous
 * response token or demographic attribute as a stable participant identity. */
export interface TrainingNumericObservationV1 {
  researchCategory?: string
  participantKey: string
  participantKind: 'USER' | 'STUDY_LOCAL'
  waveKey: string
  taskId: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  attemptId: string | null
  attemptEpoch: number | null
  sourceHashes: Record<string, string>
  metricKey: string
  itemId: string
  measurement: TrainingMetricIdentityV1 | null
  value: number | null
  reason: TrainingObservationReason | null
  /** Accepted FINAL status is never rewritten by later sample-quality overlays. */
  originalFinalStatus?: string | null
  taskSatisfied?: boolean | null
  /** Higher frozen source thresholds always override the product floor. */
  minimumN?: number
}
export interface TrainingAnalysisSourceV1 {
  schemaVersion: 1
  courseId: string
  observations: TrainingNumericObservationV1[]
}
export interface TrainingNumericStatisticsV1 {
  mean: number | null
  median: number | null
  sdSample: number | null
  minMax: { min: number; max: number } | null
  quartiles: { q1: number; q2: number; q3: number } | null
}
export interface TrainingDescriptiveMetricV1 {
  waveKey: string
  taskId: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  metricKey: string
  itemId: string
  measurement: TrainingMetricIdentityV1 | null
  state: 'present' | 'suppressed'
  eligibleN?: number
  validN?: number
  missingByReason?: Partial<Record<TrainingObservationReason, number>>
  statistics?: TrainingNumericStatisticsV1
}
export interface TrainingMatchedMetricV1 {
  metricKey: string
  state: 'present' | 'suppressed' | 'not_comparable'
  countKind: 'PAIRED_VALID' | 'COMPLETE_CASE'
  validCaseN?: number
  waveMeans?: Array<{ waveId: string; waveKey: string; mean: number }>
  comparisons?: Array<{
    fromWaveId: string
    toWaveId: string
    comparability: ReportingComparabilityDecisionV1
    delta?: number
  }>
  reason?: 'NOT_COMPARABLE'
  flow?: Array<{
    fromWaveKey: string
    toWaveKey: string
    state: 'present' | 'suppressed'
    basis: 'OBSERVED_SAMPLE'
    fromObservedN?: number
    toObservedN?: number
    retainedN?: number
    attritionN?: number
    lateJoiningN?: number
  }>
}
export interface TrainingAnalysisProjectionV1 {
  schemaVersion: 1
  kind: 'TRAINING_NUMERIC_LONGITUDINAL'
  courseId: string
  mode: TrainingAnalysisModeV1
  minimumN: number
  state: 'present' | 'suppressed'
  matchedEligibleN?: number
  descriptives: TrainingDescriptiveMetricV1[]
  metrics: TrainingMatchedMetricV1[]
  limitations: string[]
}
export interface TrainingAnalysisDictionaryColumnV1 {
  columnKey: string
  waveKey: string
  taskId: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  metricKey: string
  itemId: string
  measurement: TrainingMetricIdentityV1 | null
  valueType: 'NUMBER'
  missingReasons: TrainingObservationReason[]
}
export type TrainingAnalysisExportFormat = 'LONG' | 'WIDE' | 'CODEBOOK'
export interface TrainingAnalysisExportV1 {
  schemaVersion: 1
  format: TrainingAnalysisExportFormat
  rowCount: number
  columnCount: number
  csv: string
  dictionary: TrainingAnalysisDictionaryColumnV1[]
}
export interface TrainingAnalysisTableV1 {
  columns: string[]
  rows: Array<Record<string, unknown>>
}
export interface TrainingAnalysisTablesV1 {
  long: TrainingAnalysisTableV1
  wide: TrainingAnalysisTableV1
  dictionary: TrainingAnalysisTableV1
}
