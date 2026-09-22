import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "emotionrecognition",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "六类情绪面孔分类",
    "metrics": {
      "accuracy": {
        "label": "总体分类正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "balancedAccuracy": {
        "label": "六类平衡正确率",
        "explanation": "先分别计算六类合成面孔的正确率，再取六类平均值。",
        "singleExplanation": "先分别计算六类合成面孔的正确率，再取六类平均值。"
      },
      "accuracyByEmotion": {
        "label": "各情绪类别正确率",
        "explanation": "六类合成面孔分别的分类正确率。",
        "singleExplanation": "六类合成面孔分别的分类正确率。"
      },
      "confusionMatrix": {
        "label": "情绪分类混淆矩阵",
        "explanation": "记录各目标类别被选择成不同类别的次数，只反映本任务合成刺激的分类情况。",
        "singleExplanation": "记录各目标类别被选择成不同类别的次数，只反映本任务合成刺激的分类情况。"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "validResponseCount": {
        "label": "有效响应数",
        "explanation": "本次有效类别选择的次数。",
        "singleExplanation": "本次有效类别选择的次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在六类情绪面孔分类中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 次，每类 4 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在六类情绪面孔分类中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用60 次，每类 10 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在六类情绪面孔分类中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用120 次，每类 20 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "本任务只描述对当前版本六类合成面孔的分类响应；不输出情绪识别能力、共情能力、人格、临床或文化能力结论。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次六类合成面孔分类表现，不是情绪能力、共情、人格、文化能力或临床判断。"
  }
]
