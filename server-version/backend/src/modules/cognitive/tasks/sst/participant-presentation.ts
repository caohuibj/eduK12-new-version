import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "sst",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "停止信号任务 SST",
    "metrics": {
      "ssrtMs": {
        "label": "停止反应估计用时",
        "explanation": "根据停止信号模型估计，须结合协议和质量限制阅读。",
        "singleExplanation": "停止反应估计时间：根据停止信号模型估计的动作停止时间。"
      },
      "pRespondStop": {
        "label": "停止信号后仍响应的比例",
        "explanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。",
        "singleExplanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。"
      },
      "goMedianRtMs": {
        "label": "回应信号的典型用时",
        "explanation": "Go 条件有效响应的中位用时。"
      },
      "goOmissionRate": {
        "label": "回应信号未响应比例",
        "explanation": "Go 条件应该回应但没有回应的比例。"
      },
      "goChoiceErrorRate": {
        "label": "回应信号选择错误比例",
        "explanation": "Go 条件出现错误方向选择的比例。"
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
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次动作停止任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "信号让你停下时，会发生什么？",
      "introduction": "先看停止信号条件，再理解反应过程。",
      "summary": {
        "template": "本次停止反应估计用时为 {ssrtMs}；停止信号后仍响应的比例为 {pRespondStop}。",
        "metricKeys": [
          "ssrtMs",
          "pRespondStop"
        ]
      },
      "studentMetricKeys": [
        "ssrtMs",
        "pRespondStop",
        "goMedianRtMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [],
      "metricGates": {
        "ssrtMs": [
          "legacyUninterpretable",
          "insufficientStopTrials",
          "pRespondStopOutOfRange",
          "highGoOmission",
          "strategicSlowingSuspected"
        ],
        "pRespondStop": []
      },
      "nextStep": "停止信号后的响应比例不是越低越好。先阅读协议限制，不作个人或临床抑制结论。",
      "hiddenByProfile": {
        "experience": [
          "ssrtMs"
        ]
      },
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pRespondStop",
          "goOmissionRate",
          "goChoiceErrorRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "本次短程体验中，停止信号后仍响应的比例为 {pRespondStop}。这只描述作答过程。",
          "metricKeys": [
            "pRespondStop"
          ]
        }
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "SSRT": "停止反应估计用时（SSRT）",
        "Stop": "停止信号条件",
        "Go": "回应信号条件"
      },
      "illustration": "stop"
    }
  }
]
