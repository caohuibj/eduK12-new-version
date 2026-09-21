import type { CognitiveTaskParticipantPresentationV1 } from '../participant-presentation.types'

export const stroopParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "experienceHeadlineMetric": "incongruentAccuracy",
  "suppressPracticalTips": true
} as const satisfies CognitiveTaskParticipantPresentationV1
