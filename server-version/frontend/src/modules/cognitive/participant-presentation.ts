import type { CognitiveFrontendParticipantPresentationV1 } from './participant-presentation.types'
import { COGNITIVE_FRONTEND_PARTICIPANT_PRESENTATIONS } from './generated/participant-presentations.generated'

export const resolveCognitiveFrontendParticipantPresentation = (
  testType: string,
): CognitiveFrontendParticipantPresentationV1 | null =>
  COGNITIVE_FRONTEND_PARTICIPANT_PRESENTATIONS.find((candidate) => candidate.testType === testType)?.presentation ?? null
