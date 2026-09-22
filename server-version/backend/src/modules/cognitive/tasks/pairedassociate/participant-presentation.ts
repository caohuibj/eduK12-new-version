import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "pairedassociate",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形—位置配对学习",
    "metrics": {
      "correctByTrial": {
        "label": "各轮正确数",
        "explanation": "各学习轮次中图形位置配对正确的数量。",
        "singleExplanation": "各学习轮次中图形位置配对正确的数量。"
      },
      "learningSlope": {
        "label": "学习斜率",
        "explanation": "首末轮正确率之差除以轮次间隔，描述本次平均每轮变化。",
        "singleExplanation": "首末轮正确率之差除以轮次间隔，描述本次平均每轮变化。"
      },
      "trialsToCriterion": {
        "label": "达到标准所需轮次",
        "explanation": "首次达到 80% 正确率的学习轮次；未达到时不显示数值。",
        "singleExplanation": "首次达到 80% 正确率的学习轮次；未达到时不显示数值。"
      },
      "immediateAccuracy": {
        "label": "最终即时正确率",
        "explanation": "最后一轮即时配对作答的正确率。",
        "singleExplanation": "最后一轮即时配对作答的正确率。"
      },
      "delayedAccuracy": {
        "label": "延迟正确率",
        "explanation": "短延迟后配对作答的正确率；该阶段未完成时不显示数值。",
        "singleExplanation": "短延迟后配对作答的正确率；该阶段未完成时不显示数值。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图形—位置配对学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 对图形、2 轮学习。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图形—位置配对学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用12 对图形、3 轮学习。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图形—位置配对学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用18 对图形、4 轮学习及短延迟回忆。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "学习斜率、达到标准轮次与最终正确率应一起阅读；延迟缺失不按 0 计。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果来自内部非语言配对刺激，不等同 CANTAB PAL、临床记忆判断或人口常模。"
  }
]
