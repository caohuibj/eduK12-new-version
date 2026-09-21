import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const matrixParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "accuracy": {
      "explanation": "正确率：正式作答中判断正确的比例。"
    },
    "medianRtMs": {
      "explanation": "典型反应速度：多数有效反应所需的时间。"
    },
    "omissionRate": {
      "explanation": "遗漏比例：应该响应但没有响应的比例。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
