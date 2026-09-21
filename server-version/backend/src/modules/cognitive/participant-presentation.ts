import { cognitivePresentations } from './generated/presentation'
import type { CognitiveParticipantPresentationV1 } from './participant-presentation.types'
export type { CognitiveParticipantPresentationV1 } from './participant-presentation.types'
const keyOf = (v: { testType: string; engineVersion: string; scoringVersion: string }) => `${v.testType}/${v.engineVersion}/${v.scoringVersion}`
const presentations = new Map<string, CognitiveParticipantPresentationV1>()
for (const presentation of cognitivePresentations) {
  const key = keyOf(presentation)
  if (presentations.has(key)) throw new Error(`COG_PRESENTATION_DUPLICATE: ${key}`)
  presentations.set(key, presentation)
}
export const resolveParticipantPresentation = (identity: { testType: string; engineVersion: string; scoringVersion: string }): CognitiveParticipantPresentationV1 | undefined => presentations.get(keyOf(identity))
