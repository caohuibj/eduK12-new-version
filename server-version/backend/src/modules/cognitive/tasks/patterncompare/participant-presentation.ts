import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
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
      "standard": {
        "tier": "PILOT",
        "profileLabel": "Pilot 版",
        "participantConclusion": "本次 Pilot 短版结果提示你在本次图形比较任务中的速度与准确性表现；由于协议较短，应把结果作为初步任务表现参考。",
        "reportCaveats": [
          "Pilot 短版采用 60 秒正式协议，提供最低限度但可解释的单次表现信息；速度、正确率与反应时间应结合阅读，短程结果可能存在较大波动。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "RESEARCH_READY",
        "profileLabel": "Research Ready 版",
        "participantConclusion": "本次 Research Ready 完整协议显示你在本次图形比较任务中的速度与准确性表现；在数据质量达标时，这些指标可作为较稳定的单次任务证据。",
        "reportCaveats": [
          "Research Ready 版采用 90 秒完整协议，以更多正式试次提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级或诊断结论。"
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
