import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const taskswitchParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "switchCostRtMs": {
      "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
    },
    "switchCostAccuracy": {
      "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
