import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "picturesequence",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图片序列学习",
    "metrics": {
      "adjacentPairScore": {
        "label": "相邻顺序得分"
      },
      "positionScore": {
        "label": "位置得分"
      },
      "learningGain": {
        "label": "学习增益"
      },
      "delayedRetention": {
        "label": "延迟保持变化"
      },
      "adjacentPairScoreByRound": {
        "label": "各轮相邻顺序得分"
      },
      "positionScoreByRound": {
        "label": "各轮位置得分"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "延迟保持只有在科研档延迟阶段实际完成时展示；缺失不等于低分。"
    ]
  }
]
