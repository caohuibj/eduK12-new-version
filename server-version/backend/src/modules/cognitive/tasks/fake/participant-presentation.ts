import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "fake",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Fake 测试",
    "metrics": {
      "trialCount": {
        "label": "试次数"
      },
      "correctCount": {
        "label": "正确比较次数",
        "explanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。",
        "singleExplanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。"
      },
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "meanRtMs": {
        "label": "平均反应时"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": []
  }
]
