import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const stroopParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "stroopEffectMs": {
      "explanation": "冲突干扰时间：冲突条件相对一致条件增加的反应时间。"
    },
    "errorCost": {
      "label": "准确率干扰差",
      "explanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。"
    },
    "incongruentAccuracy": {
      "label": "不一致条件正确率",
      "explanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。"
    },
    "accuracy": {
      "explanation": "正确率：正式作答中判断正确的比例。"
    },
    "congruentAccuracy": {
      "label": "一致条件正确率",
      "explanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。"
    },
    "medianRtCongruent": {
      "label": "一致条件典型反应时间",
      "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
    },
    "medianRtIncongruent": {
      "label": "不一致条件典型反应时间",
      "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
