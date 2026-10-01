import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
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
    "disclaimer": "结果反映本次认知灵活性任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "规则换了，你如何调整？",
      "introduction": "对照规则重复与切换时的表现。",
      "summary": {
        "template": "本次切换与重复条件的用时差为 {switchCostRtMs}，正确率差为 {switchCostAccuracy}。",
        "metricKeys": [
          "switchCostRtMs",
          "switchCostAccuracy"
        ]
      },
      "studentMetricKeys": [
        "switchCostRtMs",
        "accuracySwitch",
        "accuracyRepeat"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientSwitchTrials",
        "insufficientRepeatTrials"
      ],
      "metricGates": {},
      "nextStep": "用时差与正确率一起看，不把一次切换成本解释为灵活性能力等级。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracySwitch",
          "accuracyRepeat"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议"
      },
      "illustration": "rules"
    }
  }
]
