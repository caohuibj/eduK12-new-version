import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "cpt",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "连续执行任务 CPT-X",
    "metrics": {
      "dPrime": {
        "label": "目标辨别 d′",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "omissionRate": {
        "label": "目标遗漏率",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "commissionRate": {
        "label": "非目标误报率",
        "explanation": "误按比例：本来不应该按时发生按键的比例。",
        "singleExplanation": "误按比例：本来不应该按时发生按键的比例。"
      },
      "rtICV": {
        "label": "命中RT变异系数",
        "explanation": "反应稳定性：不同试次之间反应速度的波动程度。",
        "singleExplanation": "反应稳定性：不同试次之间反应速度的波动程度。"
      },
      "hitMedianRtMs": {
        "label": "目标命中中位RT"
      },
      "hitRtSdMs": {
        "label": "目标RT标准差"
      },
      "blockSlopeRt": {
        "label": "跨 block RT 斜率"
      },
      "blockSlopeOmission": {
        "label": "跨 block 遗漏斜率"
      },
      "perseverationRate": {
        "label": "极短反应比例"
      },
      "targetCount": {
        "label": "目标试次数"
      },
      "hitCount": {
        "label": "命中次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "单一反应时不能代表持续注意，请同时看遗漏与误报。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次持续注意任务表现，不是临床诊断或常模。"
  }
]
