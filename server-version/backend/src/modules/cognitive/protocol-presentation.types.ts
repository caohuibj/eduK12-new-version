import type { CognitiveProfile } from './cognitive.types'

export type CognitiveProtocolTier = 'PILOT' | 'RESEARCH_READY'

export interface CognitiveProtocolPresentationV1 {
  tier: CognitiveProtocolTier
  profileLabel: string
  participantConclusion: string
  reportCaveats: string[]
  showProductIndex?: boolean
}

