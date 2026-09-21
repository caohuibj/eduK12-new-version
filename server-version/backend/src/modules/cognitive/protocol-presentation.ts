import type { CognitiveProfile } from './cognitive.types'
import { resolveCognitiveTaskParticipantPresentation } from './tasks/participant-presentation'

export type {
  CognitiveProtocolTier,
  CognitiveProtocolPresentationV1,
} from './tasks/participant-presentation.types'

export const resolveCognitiveProtocolPresentation = (input: {
  testType: string
  engineVersion: string
  scoringVersion: string
  profile: CognitiveProfile | null
}) => resolveCognitiveTaskParticipantPresentation(input)?.protocol ?? null
