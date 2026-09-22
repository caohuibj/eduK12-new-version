import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "cardsort",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "规则卡片分类",
    "metrics": {
      "switchCostRtMs": {
        "label": "规则转换 RT 代价",
        "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。",
        "singleExplanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
      },
      "switchCostAccuracy": {
        "label": "规则转换准确率代价",
        "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。",
        "singleExplanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
      },
      "perseverativeErrorRate": {
        "label": "持续性错误率",
        "explanation": "规则转换后仍按上一规则作答的比例。",
        "singleExplanation": "规则转换后仍按上一规则作答的比例。"
      },
      "postSwitchRecovery": {
        "label": "转换后恢复",
        "explanation": "转换后的重复试次正确率减去转换试次正确率。",
        "singleExplanation": "转换后的重复试次正确率减去转换试次正确率。"
      },
      "accuracySwitch": {
        "label": "转换条件正确率",
        "explanation": "规则发生转换时正确作答的比例。",
        "singleExplanation": "规则发生转换时正确作答的比例。"
      },
      "accuracyRepeat": {
        "label": "重复条件正确率",
        "explanation": "规则重复且两种规则答案冲突时正确作答的比例。",
        "singleExplanation": "规则重复且两种规则答案冲突时正确作答的比例。"
      },
      "medianRtSwitch": {
        "label": "转换条件典型反应时间",
        "explanation": "规则转换试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则转换试次中正确有效反应时间的中位数。"
      },
      "medianRtRepeat": {
        "label": "重复条件典型反应时间",
        "explanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。"
      },
      "overallAccuracy": {
        "label": "总体准确率",
        "explanation": "所有正式试次中正确且反应时间有效的比例。",
        "singleExplanation": "所有正式试次中正确且反应时间有效的比例。"
      },
      "omissionRate": {
        "label": "未反应比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数",
        "explanation": "规则转换后仍按上一规则选择的次数。",
        "singleExplanation": "规则转换后仍按上一规则选择的次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在规则卡片分类中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 次、2 组。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在规则卡片分类中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用72 次、3 组。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在规则卡片分类中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用144 次、6 组。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "持续性错误由冻结规则和实际响应推导，不等同于临床执行功能判断。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次双规则分类任务表现，不是商业卡片分类测验、临床诊断或人口常模。"
  }
]
