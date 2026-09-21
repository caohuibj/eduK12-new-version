import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "digitbackward",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "数字倒背",
    "metrics": {
      "maxSpan": {
        "label": "最大倒背广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。"
      },
      "totalCorrectTrials": {
        "label": "正确试次总数",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "sequenceDistance": {
        "label": "平均序列距离"
      },
      "medianResponseDurationMs": {
        "label": "中位作答时长"
      },
      "completedLevelCount": {
        "label": "完成级数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "倒背要求在短时保持之外进行顺序操作，应与顺背结果分开阅读。"
    ]
  }
]
