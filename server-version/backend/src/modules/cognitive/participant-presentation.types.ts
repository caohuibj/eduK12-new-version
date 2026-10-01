import type { CognitiveProfile } from './cognitive.types'
import type { CognitiveProtocolPresentationV1 } from './protocol-presentation.types'

/** Display policy, frozen with the presentation. Never used by a scorer/compiler. */
export interface CognitiveReportReadingPolicy {
  version: string
  title: string
  introduction: string
  summary: { template: string; metricKeys: string[] }
  summaryByProfile?: Partial<Record<CognitiveProfile, { template: string; metricKeys: string[] }>>
  studentMetricKeys: string[]
  processMetricKeys: string[]
  withholdFlags: string[]
  metricGates: Record<string, string[]>
  hiddenByProfile?: Partial<Record<CognitiveProfile, string[]>>
  nextStep: string
  illustration?: 'signal' | 'sequence' | 'stop' | 'rules'
  caveatTerms?: Record<string, string>
  qualityLabels?: Record<string, string>
  chart?: { kind: 'reaction_trials' | 'memory_lengths' | 'metrics'; metricKeys: string[]; pointUnit?: 'd-prime' | 'ratio' | 'ms' }
}

/** Display-only sidecar, deliberately absent from compiler/runtime definitions. */
export interface CognitiveParticipantPresentationV1 {
  schemaVersion: 1
  presentationVersion: string
  testType: string
  engineVersion: string
  scoringVersion: string
  title: string
  metrics: Record<string, { label: string; explanation?: string; singleExplanation?: string; displayUnit?: string; valueUnit?: 'ratio' | 'count' | 'ms'; valueLabels?: Record<string, string> }>
  experienceHeadline?: string
  hiddenMetrics: string[]
  singleHiddenMetrics: string[]
  disclaimer: string
  suppressTips: boolean
  practicalTips: string[]
  protocols: Partial<Record<CognitiveProfile, CognitiveProtocolPresentationV1>>
  reportReading?: CognitiveReportReadingPolicy
}
