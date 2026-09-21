import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "sst",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "停止信号任务 SST",
    "metrics": {
      "ssrtMs": {
        "label": "停止信号反应时 SSRT",
        "explanation": "停止反应估计时间：根据停止信号模型估计的动作停止时间。",
        "singleExplanation": "停止反应估计时间：根据停止信号模型估计的动作停止时间。"
      },
      "pRespondStop": {
        "label": "Stop trial 响应概率",
        "explanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。",
        "singleExplanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。"
      },
      "goMedianRtMs": {
        "label": "Go 中位RT"
      },
      "goOmissionRate": {
        "label": "Go 遗漏率"
      },
      "goChoiceErrorRate": {
        "label": "Go 选择错误率"
      },
      "meanSsdMs": {
        "label": "平均 SSD"
      },
      "unsuccessfulStopRtMs": {
        "label": "失败 Stop 的 RT"
      }
    },
    "experienceHeadline": "pRespondStop",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "科研版以 SSRT 为主；体验/正式版不得输出过度确定的个人抑制结论。"
    ]
  }
]
