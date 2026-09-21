import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "wordlist",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "中文词表自由回忆",
    "metrics": {
      "immediateAccuracy": {
        "label": "即时回忆正确率"
      },
      "learningGain": {
        "label": "学习轮次增益"
      },
      "delayedRecallAccuracy": {
        "label": "延迟回忆正确率"
      },
      "totalImmediateCorrect": {
        "label": "即时回忆累计正确数"
      },
      "recallByRound": {
        "label": "各轮回忆正确率"
      },
      "intrusionCount": {
        "label": "侵入词数量"
      },
      "duplicateResponseCount": {
        "label": "重复响应数量"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "medianResponseDurationMs": {
        "label": "回忆作答时长中位数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "输入归一化只清理 Unicode 格式、空白和标点，并统一英文字母大小写；不做繁简转换、同义词匹配或模糊纠错。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次中文词表的键盘自由回忆表现，不是记忆能力、临床状态或人口常模判断。"
  }
]
