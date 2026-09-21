import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const sstParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "ssrtMs": {
      "explanation": "停止反应估计时间：根据停止信号模型估计的动作停止时间。"
    },
    "pRespondStop": {
      "explanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
