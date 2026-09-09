import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/types'

export type SituationalResponseValue = string | number

export type SituationalResponseType = 'SINGLE_CHOICE' | 'CONTINUOUS'

export interface SituationalOption {
  optionKey: string
  label: string
}

export interface SituationalRunnerChannel {
  channelKey: string
  responseType: SituationalResponseType
  prompt: string
  options?: SituationalOption[]
  range?: { min: number; max: number }
}

export type SituationalRunnerAssetReference = AssessmentStaticImageAssetIdentityV1

export type SituationalRunnerStimulus =
  | { type: 'TEXT_V1'; text: string }
  | { type: 'IMAGE'; text?: string; asset: SituationalRunnerAssetReference; altText: string; caption?: string }
  | { type: 'COMIC'; text?: string; panels: Array<{ assetRef: SituationalRunnerAssetReference; altText: string; caption?: string }> }

export interface SituationalRunnerScene {
  sceneKey: string
  title: string
  sortOrder: number
  stimulus: SituationalRunnerStimulus
  channels: SituationalRunnerChannel[]
}

export interface SituationalRunnerDefinition {
  schemaVersion: 1
  respondentType: string
  sampling: { strategy: 'ALL' }
  scenes: SituationalRunnerScene[]
}

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

export interface SituationalInstrument {
  key: string
  version: string
  releaseStatus: 'PUBLISHED' | 'DRAFT' | 'RETIRED'
  scienceMaturity: 'PILOT' | 'RESEARCH_GRADE'
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  frozenAt: string
  sampling: { strategy: 'ALL' }
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
  status: 'calculated' | 'limited' | 'not_calculable'
}

export interface SituationalResult {
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
}
