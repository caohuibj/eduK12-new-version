import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "trailmaking",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Trail Making 视觉搜索",
    "metrics": {
      "completionTimeMs": {
        "label": "累计正确步骤时长"
      },
      "errorCount": {
        "label": "错误尝试次数"
      },
      "setShiftCostMs": {
        "label": "Set shifting 时间代价"
      },
      "partACompletionTimeMs": {
        "label": "A 部分累计正确步骤时长"
      },
      "partBCompletionTimeMs": {
        "label": "B 部分累计正确步骤时长"
      },
      "meanCorrectStepTimeMs": {
        "label": "平均正确步骤时间"
      },
      "completedStepCount": {
        "label": "完成步骤数"
      },
      "errorRate": {
        "label": "错误尝试比例"
      },
      "omissionRate": {
        "label": "遗漏步骤比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "累计正确步骤时长应与错误尝试、A/B 部分和设备/指针信息一起阅读；它不是从任务开始到结束的端到端用时。"
    ]
  }
]
