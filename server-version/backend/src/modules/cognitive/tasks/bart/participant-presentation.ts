import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "BART 泵压任务",
    "metrics": {
      "adjustedPumps": {
        "label": "Adjusted pumps"
      },
      "explosionCount": {
        "label": "爆破次数"
      },
      "cashoutCount": {
        "label": "现金化次数"
      },
      "meanPumpsAllCompleted": {
        "label": "已完成 balloon 平均泵压"
      },
      "cashoutRate": {
        "label": "现金化比例"
      },
      "completedBalloonCount": {
        "label": "完成 balloon 数"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Adjusted pumps、爆破次数和现金化次数应作为本次任务内的描述性指标阅读，不形成风险高低或好坏等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次虚拟 balloon 任务中的泵压、爆破和现金化行为，不是风险偏好、冲动性、人格或临床判断。"
  }
]
