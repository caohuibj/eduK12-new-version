import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "lexicaldecision",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "中文词汇判断",
    "metrics": {
      "dPrime": {
        "label": "词汇判断 d-prime",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "lexicalityEffectMs": {
        "label": "真词/伪词反应时差"
      },
      "accuracyReal": {
        "label": "真词正确率"
      },
      "accuracyPseudo": {
        "label": "伪词正确率"
      },
      "medianRtReal": {
        "label": "真词反应时中位数"
      },
      "medianRtPseudo": {
        "label": "伪词反应时中位数"
      },
      "accuracyByFrequencyBand": {
        "label": "各词频带正确率"
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
      "结果应结合词长、词频带、反应时下限和遗漏情况阅读；冻结词库与伪词生成器均处于 DRAFT 审查阶段。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次中文真词/伪词判断表现，不是语言能力、阅读能力或临床判断。"
  }
]
