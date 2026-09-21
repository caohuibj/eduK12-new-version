import type { CognitiveProfile } from './cognitive.types'
import type { CognitiveProtocolPresentationV1 } from './protocol-presentation.types'
import { resolveParticipantPresentation } from './participant-presentation'
export type { CognitiveProtocolTier, CognitiveProtocolPresentationV1 } from './protocol-presentation.types'
export const resolveCognitiveProtocolPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
}): CognitiveProtocolPresentationV1 | null => input.profile
  ? resolveParticipantPresentation(input)?.protocols[input.profile] ?? null
  : null
