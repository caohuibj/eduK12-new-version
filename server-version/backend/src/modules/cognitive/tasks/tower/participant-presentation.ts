import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "tower",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "塔式规划",
    "metrics": {
      "minimumMoveSolveRate": {
        "label": "最短步解题比例"
      },
      "excessMoves": {
        "label": "已解题平均额外步数"
      },
      "solveRate": {
        "label": "解题比例"
      },
      "firstMoveLatencyMs": {
        "label": "首步计划时长"
      },
      "ruleViolations": {
        "label": "规则违反次数"
      },
      "noAttemptRate": {
        "label": "未尝试问题比例"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "解题比例、额外步数和规则违反应分开阅读；首步时长只作方法信息。"
    ]
  }
]
