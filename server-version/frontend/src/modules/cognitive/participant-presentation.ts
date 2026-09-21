import { COGNITIVE_FRONTEND_PARTICIPANT_PRESENTATIONS } from './generated/participant-presentations.generated'

export const resolveCognitiveFrontendParticipantPresentation = (testType: string) =>
  COGNITIVE_FRONTEND_PARTICIPANT_PRESENTATIONS.find((candidate) => candidate.testType === testType)?.presentation ?? null
