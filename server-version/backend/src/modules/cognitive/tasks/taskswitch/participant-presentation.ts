import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "taskswitch",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "任务转换 Task Switching",
    "metrics": {
      "switchCostRtMs": {
        "label": "RT 转换代价",
        "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。",
        "singleExplanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
      },
      "switchCostAccuracy": {
        "label": "准确率转换代价",
        "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。",
        "singleExplanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
      },
      "medianRtSwitch": {
        "label": "Switch 中位RT"
      },
      "medianRtRepeat": {
        "label": "Repeat 中位RT"
      },
      "accuracySwitch": {
        "label": "Switch 准确率"
      },
      "accuracyRepeat": {
        "label": "Repeat 准确率"
      },
      "mixingCost": {
        "label": "混合区块相对单任务代价"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "转换代价必须与 switch/repeat 准确率同屏阅读，避免只看速度。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次认知灵活性任务表现，不是临床诊断或常模。"
  }
]
