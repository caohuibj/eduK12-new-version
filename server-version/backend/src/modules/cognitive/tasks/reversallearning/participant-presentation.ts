import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "reversallearning",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "概率反转学习",
    "metrics": {
      "acquisitionAccuracy": {
        "label": "Acquisition 正确率"
      },
      "reversalAccuracy": {
        "label": "Reversal 正确率"
      },
      "reversalCost": {
        "label": "反转准确率变化"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数"
      },
      "trialsToAcquisitionCriterion": {
        "label": "达到 Acquisition criterion 的试次"
      },
      "trialsToReversalCriterion": {
        "label": "达到 Reversal criterion 的试次"
      },
      "feedbackWinRate": {
        "label": "反馈获胜比例"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "validResponseCount": {
        "label": "有效响应次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "结果描述本次 acquisition/reversal 阶段的作答轨迹，不评价人格、风险偏好或因果机制。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次概率学习和规则反转任务表现，不是人格、风险偏好或临床判断。"
  }
]
