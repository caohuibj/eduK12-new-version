import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "pairedassociate",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形—位置配对学习",
    "metrics": {
      "correctByTrial": {
        "label": "各轮正确数"
      },
      "learningSlope": {
        "label": "学习斜率"
      },
      "trialsToCriterion": {
        "label": "达到标准所需轮次"
      },
      "immediateAccuracy": {
        "label": "最终即时正确率"
      },
      "delayedAccuracy": {
        "label": "延迟正确率"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "学习斜率、达到标准轮次与最终正确率应一起阅读；延迟缺失不按 0 计。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果来自内部非语言配对刺激，不等同 CANTAB PAL、临床记忆判断或人口常模。"
  }
]
