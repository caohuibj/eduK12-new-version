import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "典型反应用时",
        "explanation": "中位数：有效反应用时按大小排列后的中间位置。",
        "singleExplanation": "中位数：有效反应用时按大小排列后的中间位置。"
      },
      "rtICV": {
        "label": "用时波动比例",
        "explanation": "标准差除以平均反应用时；用于描述波动，不是正确率。",
        "singleExplanation": "标准差除以平均反应用时；用于描述波动，不是正确率。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应用时",
        "explanation": "所有有效反应用时的算术平均值；未及时响应不计入。",
        "singleExplanation": "所有有效反应用时的算术平均值；未及时响应不计入。"
      },
      "sdRtMs": {
        "label": "用时波动（标准差）",
        "explanation": "有效反应用时的离散程度，与平均用时使用相同单位。",
        "singleExplanation": "有效反应用时的离散程度，与平均用时使用相同单位。"
      },
      "fastestRtMs": {
        "label": "最短有效用时",
        "explanation": "有效记录中最短的一次用时，不等同于典型速度。",
        "singleExplanation": "有效记录中最短的一次用时，不等同于典型速度。"
      },
      "prematureCount": {
        "label": "提前操作",
        "explanation": "早于信号的操作事件，可与有效试次重叠。",
        "displayUnit": "次"
      },
      "validTrialCount": {
        "label": "有效反应",
        "explanation": "本次落在有效用时范围内的响应次数。",
        "displayUnit": "次"
      },
      "missCount": {
        "label": "未及时响应",
        "displayUnit": "次",
        "explanation": "没有在有效用时范围内响应的试次数，不推断原因。",
        "singleExplanation": "没有在有效用时范围内响应的试次数，不推断原因。"
      },
      "totalTrials": {
        "label": "总试次数",
        "displayUnit": "次",
        "explanation": "本次正式任务全部试次，作为完成数量的分母。",
        "singleExplanation": "本次正式任务全部试次，作为完成数量的分母。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "看见变化，你如何回应？",
      "introduction": "观察这次看到信号后做出回应的过程。",
      "summary": {
        "template": "本次 {totalTrials} 信号中，完成了 {validTrialCount} 有效反应。典型反应用时为 {medianRtMs}。",
        "metricKeys": [
          "totalTrials",
          "validTrialCount",
          "medianRtMs"
        ]
      },
      "studentMetricKeys": [
        "medianRtMs",
        "validTrialCount",
        "prematureCount"
      ],
      "processMetricKeys": [
        "validTrialCount",
        "totalTrials",
        "missCount",
        "prematureCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials"
      ],
      "metricGates": {},
      "nextStep": "先等信号再回应；比较记录时尽量使用相同设备和操作方式。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议"
      },
      "illustration": "signal",
      "qualityLabels": {
        "insufficientValidTrials": "有效反应记录不足",
        "highMissRate": "未及时响应较多",
        "interrupted": "作答期间出现中断",
        "excessivePremature": "提前操作较多",
        "extremeRtPattern": "反应用时波动较大"
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "典型反应用时",
        "explanation": "中位数：有效反应用时按大小排列后的中间位置。",
        "singleExplanation": "中位数：有效反应用时按大小排列后的中间位置。"
      },
      "rtICV": {
        "label": "用时波动比例",
        "explanation": "标准差除以平均反应用时；用于描述波动，不是正确率。",
        "singleExplanation": "标准差除以平均反应用时；用于描述波动，不是正确率。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应用时",
        "explanation": "所有有效反应用时的算术平均值；未及时响应不计入。",
        "singleExplanation": "所有有效反应用时的算术平均值；未及时响应不计入。"
      },
      "sdRtMs": {
        "label": "用时波动（标准差）",
        "explanation": "有效反应用时的离散程度，与平均用时使用相同单位。",
        "singleExplanation": "有效反应用时的离散程度，与平均用时使用相同单位。"
      },
      "fastestRtMs": {
        "label": "最短有效用时",
        "explanation": "有效记录中最短的一次用时，不等同于典型速度。",
        "singleExplanation": "有效记录中最短的一次用时，不等同于典型速度。"
      },
      "prematureCount": {
        "label": "提前操作",
        "explanation": "早于信号的操作事件，可与有效试次重叠。",
        "displayUnit": "次"
      },
      "validTrialCount": {
        "label": "有效反应",
        "explanation": "本次落在有效用时范围内的响应次数。",
        "displayUnit": "次"
      },
      "missCount": {
        "label": "未及时响应",
        "displayUnit": "次",
        "explanation": "没有在有效用时范围内响应的试次数，不推断原因。",
        "singleExplanation": "没有在有效用时范围内响应的试次数，不推断原因。"
      },
      "totalTrials": {
        "label": "总试次数",
        "displayUnit": "次",
        "explanation": "本次正式任务全部试次，作为完成数量的分母。",
        "singleExplanation": "本次正式任务全部试次，作为完成数量的分母。"
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
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。任务表现指数不是常模位置。",
    "reportReading": {
      "version": "1.0.0",
      "title": "看见变化，你如何回应？",
      "introduction": "观察这次看到信号后做出回应的过程。",
      "summary": {
        "template": "本次 {totalTrials} 信号中，完成了 {validTrialCount} 有效反应。典型反应用时为 {medianRtMs}。",
        "metricKeys": [
          "totalTrials",
          "validTrialCount",
          "medianRtMs"
        ]
      },
      "studentMetricKeys": [
        "medianRtMs",
        "validTrialCount",
        "prematureCount"
      ],
      "processMetricKeys": [
        "validTrialCount",
        "totalTrials",
        "missCount",
        "prematureCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials"
      ],
      "metricGates": {},
      "nextStep": "先等信号再回应；比较记录时尽量使用相同设备和操作方式。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议"
      },
      "illustration": "signal",
      "qualityLabels": {
        "insufficientValidTrials": "有效反应记录不足",
        "highMissRate": "未及时响应较多",
        "interrupted": "作答期间出现中断",
        "excessivePremature": "提前操作较多",
        "extremeRtPattern": "反应用时波动较大"
      }
    }
  }
]
