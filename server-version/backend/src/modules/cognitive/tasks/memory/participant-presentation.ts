import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "memory",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "数字广度顺背",
    "metrics": {
      "maxSpan": {
        "label": "最大正确广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。"
      },
      "levelsPassed": {
        "label": "通过长度级数"
      },
      "firstTryPassCount": {
        "label": "首次尝试即通过的级数"
      },
      "medianResponseDurationMs": {
        "label": "中位作答时长"
      },
      "trialCount": {
        "label": "实际完成试次数"
      },
      "interruptedCount": {
        "label": "中断试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": []
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "memory",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "数字广度顺背",
    "metrics": {
      "maxSpan": {
        "label": "最大正确广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。"
      },
      "levelsPassed": {
        "label": "通过长度级数"
      },
      "firstTryPassCount": {
        "label": "首次尝试即通过的级数"
      },
      "medianResponseDurationMs": {
        "label": "中位作答时长"
      },
      "trialCount": {
        "label": "实际完成试次数"
      },
      "interruptedCount": {
        "label": "中断试次数"
      },
      "totalCorrectTrials": {
        "label": "正确试次数",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "perseverativeTrialCount": {
        "label": "持续重复作答试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": [
      "较长信息可以尝试分组、复述和分段记忆。"
    ]
  }
]
