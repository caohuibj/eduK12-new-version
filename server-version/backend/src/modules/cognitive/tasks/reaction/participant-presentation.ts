import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "中位反应时",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "rtICV": {
        "label": "反应时变异系数",
        "explanation": "反应稳定性：不同试次之间反应速度的波动程度。",
        "singleExplanation": "反应稳定性：不同试次之间反应速度的波动程度。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应时"
      },
      "sdRtMs": {
        "label": "反应时标准差"
      },
      "fastestRtMs": {
        "label": "最快有效反应"
      },
      "prematureCount": {
        "label": "提前反应次数"
      },
      "validTrialCount": {
        "label": "有效试次数"
      },
      "missCount": {
        "label": "遗漏次数"
      },
      "totalTrials": {
        "label": "总试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。"
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "中位反应时",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "rtICV": {
        "label": "反应时变异系数",
        "explanation": "反应稳定性：不同试次之间反应速度的波动程度。",
        "singleExplanation": "反应稳定性：不同试次之间反应速度的波动程度。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应时"
      },
      "sdRtMs": {
        "label": "反应时标准差"
      },
      "fastestRtMs": {
        "label": "最快有效反应"
      },
      "prematureCount": {
        "label": "提前反应次数"
      },
      "validTrialCount": {
        "label": "有效试次数"
      },
      "missCount": {
        "label": "遗漏次数"
      },
      "totalTrials": {
        "label": "总试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "在需要快速响应时先减少外部干扰。",
      "比较多次结果时尽量使用相近设备和作答方式。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。任务表现指数不是常模位置。"
  }
]
