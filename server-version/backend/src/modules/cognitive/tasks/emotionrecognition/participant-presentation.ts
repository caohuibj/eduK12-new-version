import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "emotionrecognition",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "六类情绪面孔分类",
    "metrics": {
      "accuracy": {
        "label": "总体分类正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "balancedAccuracy": {
        "label": "六类平衡正确率"
      },
      "accuracyByEmotion": {
        "label": "各情绪类别正确率"
      },
      "confusionMatrix": {
        "label": "情绪分类混淆矩阵"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "validResponseCount": {
        "label": "有效响应数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "本任务只描述对当前版本六类合成面孔的分类响应；不输出情绪识别能力、共情能力、人格、临床或文化能力结论。"
    ]
  }
]
