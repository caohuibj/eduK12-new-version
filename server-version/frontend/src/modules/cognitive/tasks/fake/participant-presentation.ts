import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const fakeParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "correctCount": {
      "label": "正确比较次数",
      "explanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。"
    },
    "accuracy": {
      "explanation": "正确率：正式作答中判断正确的比例。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
