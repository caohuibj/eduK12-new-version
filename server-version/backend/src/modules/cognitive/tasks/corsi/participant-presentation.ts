import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "corsi",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Corsi 视空间广度",
    "metrics": {
      "maxSpan": {
        "label": "最大空间广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。"
      },
      "totalCorrectTrials": {
        "label": "总正确试次",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "firstTryPassCount": {
        "label": "首次通过级数"
      },
      "medianResponseDurationMs": {
        "label": "中位复现时长"
      },
      "sequenceErrorDistance": {
        "label": "序列位置错误距离"
      },
      "trialCount": {
        "label": "正式试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Corsi 代表视空间广度，不要与数字广度合并成记忆总分。"
    ]
  }
]
