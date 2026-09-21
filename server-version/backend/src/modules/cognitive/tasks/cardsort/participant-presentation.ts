import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
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
        "label": "持续性错误率"
      },
      "postSwitchRecovery": {
        "label": "转换后恢复"
      },
      "accuracySwitch": {
        "label": "Switch 准确率"
      },
      "accuracyRepeat": {
        "label": "Repeat 准确率"
      },
      "medianRtSwitch": {
        "label": "Switch 中位RT"
      },
      "medianRtRepeat": {
        "label": "Repeat 中位RT"
      },
      "overallAccuracy": {
        "label": "总体准确率"
      },
      "omissionRate": {
        "label": "未反应比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "持续性错误由冻结规则和实际响应推导，不等同于临床执行功能判断。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次双规则分类任务表现，不是商业卡片分类测验、临床诊断或人口常模。"
  }
]
