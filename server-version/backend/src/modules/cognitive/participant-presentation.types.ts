import type { CognitiveProfile } from './cognitive.types'
import type { CognitiveProtocolPresentationV1 } from './protocol-presentation.types'

/** Display-only sidecar, deliberately absent from compiler/runtime definitions. */
export interface CognitiveParticipantPresentationV1 {
  schemaVersion: 1
  presentationVersion: string
  testType: string
  engineVersion: string
  scoringVersion: string
  title: string
  metrics: Record<string, { label: string; explanation?: string; singleExplanation?: string }>
  experienceHeadline?: string
  hiddenMetrics: string[]
  suppressTips: boolean
  practicalTips: string[]
  protocols: Partial<Record<CognitiveProfile, CognitiveProtocolPresentationV1>>
}
