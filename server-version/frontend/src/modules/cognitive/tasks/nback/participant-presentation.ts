import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const nbackParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "dPrimeByN": {
      "explanation": "各 N 难度的目标辨别敏感度；不同 N 应分开阅读。"
    },
    "maxReliableN": {
      "explanation": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
