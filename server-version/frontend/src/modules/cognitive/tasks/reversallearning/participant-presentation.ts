import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const reversallearningParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "omissionRate": {
      "explanation": "遗漏比例：应该响应但没有响应的比例。"
    },
    "medianRtMs": {
      "explanation": "典型反应速度：多数有效反应所需的时间。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
