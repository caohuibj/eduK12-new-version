import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const cptParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "dPrime": {
      "explanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
    },
    "omissionRate": {
      "explanation": "遗漏比例：应该响应但没有响应的比例。"
    },
    "commissionRate": {
      "explanation": "误按比例：本来不应该按时发生按键的比例。"
    },
    "rtICV": {
      "explanation": "反应稳定性：不同试次之间反应速度的波动程度。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
