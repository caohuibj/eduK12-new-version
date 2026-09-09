import type { ZodType } from 'zod'
import type {
  AssessmentReferenceEntry,
  ReferenceEvidenceLevel,
  ReferenceKind,
} from '../../assessment-reference/reference'
import type { CompiledInstrumentRuntimeV1, ReferenceBindingSnapshot } from '../../assessment-runtime/types'
import type { FinalSubmissionDefinition } from '../cognitive.types'

export type { FinalSubmissionDefinition } from '../cognitive.types'

export const COGNITIVE_V2_SCHEMA_VERSION = 1 as const
export const COGNITIVE_V2_TRIAL_ENVELOPE_VERSION = 1 as const

export type CognitiveProfile = 'experience' | 'standard' | 'research'

export type CognitivePhase = 'test' | 'learning' | 'delayed'

export type QualityState = 'interpretable' | 'limited' | 'invalid'

export type MetricVisibility = 'headline' | 'user' | 'detail' | 'research_only' | 'hidden'

export type MetricDirection =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'target_range'
  | 'descriptive'
  | 'signed'

export type MetricRole = 'primary' | 'secondary' | 'quality' | 'research_only'

export type MetricValueType = 'number' | 'integer' | 'object' | 'array'

export type MetricUnit =
  | 'ms'
  | 'ratio'
  | 'count'
  | 'd-prime'
  | 'level'
  | 'score'
  | 'map'

export interface MetricDefinition {
  key: string
  label: string
  shortLabel?: string
  category: string
  construct: string
  description: string
  unit: MetricUnit
  valueType: MetricValueType
  direction: MetricDirection
  visibility: MetricVisibility
  role: MetricRole
  precision?: number
  availableProfiles: CognitiveProfile[]
  /** A metric may be displayed without a normative reference. */
  referenceEligible: boolean
  /** Explicitly identifies which quality flags gate interpretation of this metric. */
  requiresQualityFlags?: string[]
  export: { summary: boolean; label: string }
}

export interface QualityDefinition {
  key: string
  label: string
  description: string
  /** The strongest user-facing consequence when this flag is active. */
  effect: 'none' | 'limited' | 'invalid'
}

export interface ProtocolPhaseDefinition {
  key: CognitivePhase
  persists: boolean
  required: boolean
}

export interface ProtocolDefinition {
  schemaVersion: typeof COGNITIVE_V2_SCHEMA_VERSION
  key: string
  version: string
  clock: 'performance'
  randomizationAlgorithmVersion: string
  trialEnvelopeVersion: typeof COGNITIVE_V2_TRIAL_ENVELOPE_VERSION
  phases: ProtocolPhaseDefinition[]
  /** Paths in the config snapshot whose change changes measurement meaning. */
  measurementCriticalConfigPaths: string[]
}

export interface TrialFlags {
  timeout: boolean
  premature: boolean
}

export type TrialQualityEvent =
  | 'visibility_lost'
  | 'window_blur'
  | 'resume'
  | 'runner_restart'

export interface TrialEnvelope<TPayload = unknown> {
  schemaVersion: typeof COGNITIVE_V2_TRIAL_ENVELOPE_VERSION
  trialIndex: number
  phase: CognitivePhase
  condition?: string
  startedAtPerfMs: number
  endedAtPerfMs: number
  durationMs: number
  flags: TrialFlags
  qualityEvents: TrialQualityEvent[]
  payload: TPayload
}

export interface SessionConfigSnapshot<TConfig = unknown> {
  schemaVersion: typeof COGNITIVE_V2_SCHEMA_VERSION
  frozenAt: string
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  config: TConfig
  configHash: string
  hashScheme?: 'CANONICAL_JSON_SHA256_V1'
  runtimeGeneration?: 'UNIFIED_V1'
  compiledRuntime?: CompiledInstrumentRuntimeV1
  referenceBindings?: ReferenceBindingSnapshot[]
  protocol: ProtocolDefinition
  protocolSignature: string
}

/** Frozen assignment facts that determine whether a reference applies to a measurement. */
export interface CognitiveMeasurementContext {
  profile: CognitiveProfile | null
  resolvedConfigHash: string | null
}

export interface QualityAssessment {
  state: QualityState
  flags: Record<string, boolean>
  reasons: string[]
}

export interface CognitiveScoreResult {
  metrics: Record<string, unknown>
  quality: QualityAssessment
  /** Audit metadata only; this is not a user-facing product/index score. */
  audit: {
    trialCount: number
    scorerVersion: string
  }
}

export interface CognitiveAssessmentContextReference {
  schemaVersion: 1
  snapshotHash: string
}

export interface CognitiveResultSnapshot {
  schemaVersion: typeof COGNITIVE_V2_SCHEMA_VERSION
  completedAt: string
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  protocolSignature: string
  profile: CognitiveProfile | null
  metrics: Record<string, unknown>
  quality: QualityAssessment
  references: Array<Record<string, unknown>>
  report: Record<string, unknown>
  assessmentContext: CognitiveAssessmentContextReference | null
}

export interface AuthoritativeScorerInput<TConfig, TTrial> {
  config: TConfig
  session: SessionConfigSnapshot<TConfig>
  trials: TrialEnvelope<TTrial>[]
  randomSeed: string
}

export type AuthoritativeScorer<TConfig, TTrial> = (
  input: AuthoritativeScorerInput<TConfig, TTrial>,
) => CognitiveScoreResult

export interface ReferenceApplicability {
  metricKey: string
  referenceVersion: string
  referenceKind: ReferenceKind
  evidenceLevel: Exclude<ReferenceEvidenceLevel, 'none'>
  instrumentVersion: string
  scoringVersion: string
  direction: MetricDirection
  /** Exact approved measurement profiles; omitted/empty is not a wildcard. */
  profiles?: CognitiveProfile[]
  /** Exact resolved config hashes for the approved measurement protocol; omitted/empty is not a wildcard. */
  resolvedConfigHashes?: string[]
  /** Context fields needed by the selected population. */
  requiredContext?: Array<'age' | 'sexAtBirth' | 'gradeLevel' | 'primaryLanguage' | 'countryOrRegion'>
}

export interface ReportDefinition {
  schemaVersion: typeof COGNITIVE_V2_SCHEMA_VERSION
  version: string
  title: string
  /** First screen: one conclusion plus a small number of meaningful metrics. */
  headlineMetrics: string[]
  /** User-facing summary: selected metrics and quality context. */
  userMetrics: string[]
  /** Expandable detail: method, secondary metrics and limitations. */
  detailMetrics: string[]
  disclaimer: string
  practicalTips: string[]
}

export interface TaskPublicationDefinition {
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  publishedAt?: string
  /** Published tasks may legitimately have no eligible reference. */
  referenceRequired: boolean
  evidenceNote: string
}

export interface TaskDefinition<TConfig = unknown, TTrial = unknown> {
  schemaVersion: typeof COGNITIVE_V2_SCHEMA_VERSION
  testType: string
  name: string
  category: string
  engineVersion: string
  scoringVersion: string
  configSchema: ZodType<TConfig>
  trialSchema: ZodType<TTrial>
  protocol: ProtocolDefinition
  scorer: AuthoritativeScorer<TConfig, TTrial>
  finalSubmission: FinalSubmissionDefinition<TConfig>
  profiles: Record<CognitiveProfile, {
    estimatedMinutes: [number, number]
    configPatch: Record<string, unknown>
    reportCaveats: string[]
  }>
  metrics: Record<string, MetricDefinition>
  quality: Record<string, QualityDefinition>
  references: ReferenceApplicability[]
  report: ReportDefinition
  publication: TaskPublicationDefinition
}

/** Used by the reference adapter without copying shared reference definitions. */
export interface CognitiveReferenceInput {
  testType: string
  metricKey: string
  value: number | null
  metric: MetricDefinition
  applicability: ReferenceApplicability
  referenceSet: {
    instrumentType: 'cognitive'
    instrumentKey: string
    referenceVersion: string
    status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
    entries: AssessmentReferenceEntry[]
  }
}
