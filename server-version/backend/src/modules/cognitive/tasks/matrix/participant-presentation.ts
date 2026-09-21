import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "matrix",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "矩阵规则推理",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "accuracyByRuleFamily": {
        "label": "各规则族正确率"
      },
      "reachedDifficulty": {
        "label": "达到的最高难度"
      },
      "medianRtMs": {
        "label": "正确反应中位时长",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [
      "reachedDifficulty"
    ],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "正确率按规则族和难度覆盖一起阅读，不换算 IQ 或智力等级。"
    ]
  }
]
