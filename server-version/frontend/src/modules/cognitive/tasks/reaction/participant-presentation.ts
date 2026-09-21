import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const reactionParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "medianRtMs": {
      "explanation": "典型反应速度：多数有效反应所需的时间。"
    },
    "rtICV": {
      "explanation": "反应稳定性：不同试次之间反应速度的波动程度。"
    },
    "missRate": {
      "explanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
