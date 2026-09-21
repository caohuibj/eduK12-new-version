import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const trailmakingParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "omissionRate": {
      "explanation": "遗漏比例：应该响应但没有响应的比例。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
