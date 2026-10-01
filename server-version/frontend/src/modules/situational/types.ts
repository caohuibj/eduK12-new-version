import type {
  AssessmentStaticImageAssetIdentityV1,
  AssessmentVideoPresentationV1,
} from '../assessment-media/types'

export type SituationalResponseValue = string | number

export type SituationalResponseType = 'SINGLE_CHOICE' | 'CONTINUOUS' | 'FREE_TEXT'

export interface SituationalOption {
  optionKey: string
  label: string
}

export interface SituationalRunnerChannel {
  channelKey: string
  responseType: SituationalResponseType
  prompt: string
  /** Omitted means required; only explicit false is projected by V2. */
  required?: false
  options?: SituationalOption[]
  maxLength?: number
  range?: { min: number; max: number }
}

export type SituationalRunnerAssetReference = AssessmentStaticImageAssetIdentityV1

export type SituationalRunnerStimulus =
  | { type: 'TEXT_V1'; text: string }
  | { type: 'IMAGE'; text?: string; asset: SituationalRunnerAssetReference; altText: string; caption?: string }
  | { type: 'COMIC'; text?: string; panels: Array<{ assetRef: SituationalRunnerAssetReference; altText: string; caption?: string }> }
  | { type: 'VIDEO'; text?: string; presentation: AssessmentVideoPresentationV1 }

export interface SituationalRunnerScene {
  sceneKey: string
  title: string
  sortOrder: number
  stimulus: SituationalRunnerStimulus
  channels: SituationalRunnerChannel[]
}

export interface SituationalRunnerDefinitionV1 {
  schemaVersion: 1
  respondentType: string
  sampling: { strategy: 'ALL' }
  scenes: SituationalRunnerScene[]
}

export interface SituationalRunnerNextTransition {
  type: 'NEXT'
  nextNodeKey: string
}

export interface SituationalRunnerDecisionTransition {
  type: 'DECISION'
  channelKey: string
  branches: Array<{
    optionKey: string
    nextNodeKey: string
  }>
}

export interface SituationalRunnerBranchSceneNode {
  nodeType: 'SCENE'
  nodeKey: string
  sceneKey: string
  motherSceneKey: string
  roundKey: string
  stepKey: string
  interactionRole?: 'DECISION' | 'DIAGNOSTIC'
  responseStages?: Array<{ stageKey: string; kind: 'PRE_CHOICE_PROBE' | 'CHOICE' | 'POST_CHOICE_PROBE'; channelKeys: string[] }>
  transition: SituationalRunnerNextTransition | SituationalRunnerDecisionTransition
}

export interface SituationalRunnerBranchTerminalNode {
  nodeType: 'TERMINAL'
  nodeKey: string
}

export type SituationalRunnerBranchFlowNode = SituationalRunnerBranchSceneNode | SituationalRunnerBranchTerminalNode

export interface SituationalRunnerDefinitionV2 {
  schemaVersion: 2
  respondentType: string
  sampling: { strategy: 'BRANCH_REACHABLE' }
  scenes: SituationalRunnerScene[]
  flow: {
    strategy: 'BRANCHING_DAG_V1'
    entryNodeKey: string
    nodes: SituationalRunnerBranchFlowNode[]
  }
}

export type SituationalRunnerDefinition = SituationalRunnerDefinitionV1 | SituationalRunnerDefinitionV2

export interface SituationalReportGuidance {
  category: 'reflection' | 'strategy' | 'environment' | 'support'
  text: string
}

export interface SituationalReportBand {
  key: string
  label: string
  summary: string
  guidance: SituationalReportGuidance[]
}

export interface SituationalReportInterpretation {
  metricKey: string
  headline: string
  summary: string
  bands: SituationalReportBand[]
  guidance: SituationalReportGuidance[]
}

export interface SituationalReportDefinition {
  reportVersion: string
  primaryMetricKeys: string[]
  metricOrder: string[]
  interpretations: SituationalReportInterpretation[]
  limitations: string[]
  disclaimer: string
}

export interface SituationalScientificContext {
  scientificMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
  governanceRevision: number | null
  scope: { language: string; population: string; use: string; claim: string } | null
  evidenceDigest: string | null
  provenance: 'CURRENT' | 'FROZEN' | 'LEGACY_MISSING'
}

export interface SituationalInstrument {
  title?: string
  assignment?: { assignmentVersion: string; assignmentIdentity: string; seedIdentity: string; selections: Array<{ groupKey: string; nodeKey: string; eligibleSet: string[]; assignedVariant: string; probability: number; omittedChannelKeys: string[]; probeTiming: 'DEFINED' | 'PRE_CHOICE' | 'POST_CHOICE'; stimulusVariantKey?: string }> }
  scientificContext?: SituationalScientificContext
  key: string
  version: string
  releaseStatus: 'PUBLISHED' | 'DRAFT' | 'RETIRED'
  scienceMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  frozenAt: string
  sampling: SituationalRunnerDefinition['sampling']
  definition: SituationalRunnerDefinition
  report: SituationalReportDefinition
  referencePolicy: { type: 'none' }
  runtimeCapabilities: {
    standalone: boolean
    embedded: boolean
    aggregateEligible: boolean
    collectionFacts: boolean
    supported: boolean
  }
}

export interface SituationalAttempt {
  id: string
  instrumentKey: string
  instrumentVersion: string
  attemptNo: number
  status: 'IN_PROGRESS' | 'COMPLETED'
  deliveryMode: 'FINAL_ONLY'
  runtimeGeneration: 'UNIFIED_V1'
  attemptEpoch: number
  progress: number
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  submissionId: string | null
  submissionPayloadHash: string | null
  submittedAt: string | null
  startedAt: string
  completedAt: string | null
  totalTime: number | null
  createdAt: string
  updatedAt: string
}

export interface SituationalResponse {
  sceneKey: string
  channelKey: string
  responseValue: SituationalResponseValue
  responseTimeMs?: number
  answeredAt?: string
  responseRevision?: number
  historyIdentity?: string
  stageConfirmed?: boolean
}

export interface SituationalMetric {
  key: string
  label: string
  construct: string
  channelKey: string
  direction: string
  role: 'primary' | 'secondary'
  displayPrecision: number
  value: number | null
  range: { min: number; max: number } | null
  expectedResponses: string[]
  answeredResponses: string[]
  estimate?: number | null
  precision?: { status: 'NOT_ESTIMATED' | 'ESTIMATED'; standardError: number | null; interval: { lower: number; upper: number; level: number; kind: 'CONFIDENCE' | 'CREDIBLE' } | null }
  coverage?: { numberOfOpportunities: number; numberOfAnsweredOpportunities: number; numberOfIndependentScenes: number }
  maturity?: 'PROVISIONAL' | 'CALIBRATED'
  status: 'calculated' | 'limited' | 'not_calculable'
}

export interface SituationalResult {
  narrative?: { version: 'sjt-narrative-v1'; paragraphs: string[] }
  model?: { modelKey: string; modelVersion: string; scoringVersion: string; parameterSetHash?: string }
  metrics: SituationalMetric[]
  quality: {
    status: 'interpretable' | 'limited' | 'invalid'
    flags: string[]
  }
}

export interface CanonicalSituationalMetric {
  key: string
  value: number | null
  unit: string
  quality: string
}

export interface CanonicalSituationalResult {
  core: {
    unitType: 'SITUATIONAL'
    instrumentKey: string
    instrumentVersion: string
    scoringVersion: string
    metrics: CanonicalSituationalMetric[]
    quality: { status: string; flags: string[] }
    references: unknown[]
    [key: string]: unknown
  }
  resultHash: string
  [key: string]: unknown
}

export interface SituationalAttemptResponse {
  attemptId: string
  attempt: SituationalAttempt
  instrument: SituationalInstrument
  result?: SituationalResult
  canonicalResult?: CanonicalSituationalResult
  replayed?: boolean
}

export type SituationalDraftAnswer = {
  responseValue: SituationalResponseValue
  responseTimeMs?: number
  answeredAt?: string
  responseRevision?: number
  historyIdentity?: string
  stageConfirmed?: boolean
}
