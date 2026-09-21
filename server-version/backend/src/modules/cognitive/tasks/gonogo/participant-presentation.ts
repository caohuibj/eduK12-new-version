import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "gonogo",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Go/No-Go",
    "metrics": {
      "commissionRate": {
        "label": "No-Go 误按率",
        "explanation": "误按比例：本来不应该按时发生按键的比例。",
        "singleExplanation": "误按比例：本来不应该按时发生按键的比例。"
      },
      "dPrime": {
        "label": "信号检测敏感度 d′",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "goMedianRtMs": {
        "label": "Go 正确反应中位RT"
      },
      "hitRate": {
        "label": "Go 命中率"
      },
      "omissionRate": {
        "label": "Go 遗漏率",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "commissionErrors": {
        "label": "No-Go 误按次数"
      },
      "goTrialCount": {
        "label": "Go 试次数"
      },
      "nogoTrialCount": {
        "label": "No-Go 试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Go RT 只解释速度—准确权衡，不能单独代表抑制能力。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次反应抑制任务表现，不是临床诊断或常模。"
  }
]
