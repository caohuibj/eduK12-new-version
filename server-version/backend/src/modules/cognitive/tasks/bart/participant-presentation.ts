import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "BART 泵压任务",
    "metrics": {
      "adjustedPumps": {
        "label": "Adjusted pumps"
      },
      "explosionCount": {
        "label": "爆破次数"
      },
      "cashoutCount": {
        "label": "现金化次数"
      },
      "meanPumpsAllCompleted": {
        "label": "已完成 balloon 平均泵压"
      },
      "cashoutRate": {
        "label": "现金化比例"
      },
      "completedBalloonCount": {
        "label": "完成 balloon 数"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Adjusted pumps、爆破次数和现金化次数应作为本次任务内的描述性指标阅读，不形成风险高低或好坏等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次虚拟 balloon 任务中的泵压、爆破和现金化行为，不是风险偏好、冲动性、人格或临床判断。"
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "BART 泵压任务",
    "metrics": {
      "adjustedPumps": {
        "label": "现金化气球平均泵压",
        "explanation": "仅在主动收取积分的气球中计算平均充气次数。",
        "singleExplanation": "仅在主动收取积分的气球中计算平均充气次数。"
      },
      "explosionCount": {
        "label": "爆破次数",
        "explanation": "本次充气达到爆破阈值的气球数。",
        "singleExplanation": "本次充气达到爆破阈值的气球数。"
      },
      "cashoutCount": {
        "label": "现金化次数",
        "explanation": "主动结束充气并收取虚拟积分的气球数。",
        "singleExplanation": "主动结束充气并收取虚拟积分的气球数。"
      },
      "meanPumpsAllCompleted": {
        "label": "已完成气球平均充气次数",
        "explanation": "所有已完成气球的平均充气次数，包含爆破气球。",
        "singleExplanation": "所有已完成气球的平均充气次数，包含爆破气球。"
      },
      "cashoutRate": {
        "label": "现金化比例",
        "explanation": "已完成气球中主动收取积分的比例。",
        "singleExplanation": "已完成气球中主动收取积分的比例。"
      },
      "completedBalloonCount": {
        "label": "完成气球数",
        "explanation": "通过收取积分或爆破结束的气球数。",
        "singleExplanation": "通过收取积分或爆破结束的气球数。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在BART 泵压任务中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用10 个气球。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在BART 泵压任务中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用30 个气球。结果应结合完成量、充气与收取行为和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在BART 泵压任务中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用50 个气球。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "平均充气次数、爆破和主动收取次数一起描述本次任务行为，不形成风险高低或好坏等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次虚拟气球任务中的充气、爆破和收取行为，不是风险偏好、冲动性、人格或临床判断。"
  }
]
