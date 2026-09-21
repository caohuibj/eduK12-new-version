import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const mentalrotationParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "accuracy": {
      "explanation": "正确率：正式作答中判断正确的比例。"
    },
    "medianCorrectRtMs": {
      "label": "典型正确反应时间",
      "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
    },
    "omissionRate": {
      "explanation": "遗漏比例：应该响应但没有响应的比例。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
