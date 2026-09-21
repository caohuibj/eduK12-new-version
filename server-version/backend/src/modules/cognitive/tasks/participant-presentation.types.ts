import type { CognitiveProfile } from '../cognitive.types'

export type CognitiveProtocolTier = 'PILOT' | 'RESEARCH_READY'

export interface CognitiveProtocolPresentationV1 {
  tier: CognitiveProtocolTier
  profileLabel: string
  participantConclusion: string
  reportCaveats: string[]
  showProductIndex?: boolean
}

export interface CognitiveExactProfilePresentationV1 {
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile
  presentation: CognitiveProtocolPresentationV1
}

export interface CognitiveTaskParticipantPresentationV1 {
  schemaVersion: 1
  version: string
  experienceHeadlineMetric?: string
  v2HiddenMetricKeys?: readonly string[]
  suppressPracticalTips?: boolean
  exactProfilePresentations?: readonly CognitiveExactProfilePresentationV1[]
}

export interface ResolvedCognitiveParticipantPresentationV1 {
  version: string
  experienceHeadlineMetric?: string
  v2HiddenMetricKeys: string[]
  suppressPracticalTips: boolean
  protocol?: CognitiveProtocolPresentationV1
}
