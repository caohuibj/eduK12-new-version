import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const patterncompareParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "correctPerMinute": {
      "label": "每分钟正确比较数",
      "explanation": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。"
    },
    "accuracy": {
      "explanation": "正确率：正式作答中判断正确的比例。"
    },
    "medianCorrectRtMs": {
      "label": "典型正确反应时间",
      "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
    },
    "lapseRate": {
      "label": "未作答比例",
      "explanation": "未作答比例：正式试次中未在有效时间内作答的比例。"
    },
    "correctCount": {
      "label": "正确比较次数",
      "explanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。"
    },
    "completedTrialCount": {
      "label": "完成比较次数",
      "explanation": "完成比较次数：本次正式计时内进入评分的试次数。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
