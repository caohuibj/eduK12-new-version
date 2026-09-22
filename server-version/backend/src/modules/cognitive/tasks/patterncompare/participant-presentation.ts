import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "patterncompare",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形模式比较",
    "metrics": {
      "correctPerMinute": {
        "label": "每分钟正确比较数",
        "explanation": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。",
        "singleExplanation": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。"
      },
      "accuracy": {
        "label": "准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "medianCorrectRtMs": {
        "label": "典型正确反应时间",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "lapseRate": {
        "label": "未作答比例",
        "explanation": "未作答比例：正式试次中未在有效时间内作答的比例。",
        "singleExplanation": "未作答比例：正式试次中未在有效时间内作答的比例。"
      },
      "correctCount": {
        "label": "正确比较次数",
        "explanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。",
        "singleExplanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。"
      },
      "completedTrialCount": {
        "label": "完成比较次数",
        "explanation": "完成比较次数：本次正式计时内进入评分的试次数。",
        "singleExplanation": "完成比较次数：本次正式计时内进入评分的试次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图形模式比较中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用30 秒。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图形模式比较中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用60 秒。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图形模式比较中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用90 秒。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "速度指标必须与准确率同屏阅读，避免把快速猜测当作加工速度。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果来自内部自制几何刺激，只反映本次任务表现，不是 NIH Toolbox 分数、临床诊断或人口常模。"
  }
]
