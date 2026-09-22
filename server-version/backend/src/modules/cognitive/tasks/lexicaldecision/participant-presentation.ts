import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "lexicaldecision",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "中文词汇判断",
    "metrics": {
      "dPrime": {
        "label": "词汇判断 d-prime",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "lexicalityEffectMs": {
        "label": "真词/伪词反应时差",
        "explanation": "伪词条件减去真词条件的正确反应中位时间。",
        "singleExplanation": "伪词条件减去真词条件的正确反应中位时间。"
      },
      "accuracyReal": {
        "label": "真词正确率",
        "explanation": "真词项目中判断正确的比例。",
        "singleExplanation": "真词项目中判断正确的比例。"
      },
      "accuracyPseudo": {
        "label": "伪词正确率",
        "explanation": "伪词项目中判断正确的比例。",
        "singleExplanation": "伪词项目中判断正确的比例。"
      },
      "medianRtReal": {
        "label": "真词反应时中位数",
        "explanation": "正确判断真词的有效反应时间中位数。",
        "singleExplanation": "正确判断真词的有效反应时间中位数。"
      },
      "medianRtPseudo": {
        "label": "伪词反应时中位数",
        "explanation": "正确判断伪词的有效反应时间中位数。",
        "singleExplanation": "正确判断伪词的有效反应时间中位数。"
      },
      "accuracyByFrequencyBand": {
        "label": "各词频带正确率",
        "explanation": "按内部词频分组列出正确率，不代表语言能力等级。",
        "singleExplanation": "按内部词频分组列出正确率，不代表语言能力等级。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "validResponseCount": {
        "label": "有效响应数",
        "explanation": "本次真词与伪词项目的有效响应次数。",
        "singleExplanation": "本次真词与伪词项目的有效响应次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在中文词汇判断中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用40 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在中文词汇判断中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用100 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在中文词汇判断中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用200 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "结果应结合词长、词频带、反应时下限和遗漏情况阅读；冻结词库与伪词生成器均处于 DRAFT 审查阶段。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次中文真词/伪词判断表现，不是语言能力、阅读能力或临床判断。"
  }
]
