import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "nback",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "N-Back 工作记忆更新",
    "metrics": {
      "dPrimeByN": {
        "label": "各 N 水平 d′",
        "explanation": "各 N 难度的目标辨别敏感度；不同 N 应分开阅读。",
        "singleExplanation": "各 N 难度的目标辨别敏感度；不同 N 应分开阅读。"
      },
      "maxReliableN": {
        "label": "达到质量门槛的最高 N",
        "explanation": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。",
        "singleExplanation": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。"
      },
      "hitRateByN": {
        "valueUnit": "ratio",
        "label": "各 N 命中率"
      },
      "falseAlarmRateByN": {
        "valueUnit": "ratio",
        "label": "各 N 误报率"
      },
      "medianRtByN": {
        "valueUnit": "ms",
        "label": "各 N 正确反应中位RT"
      },
      "loadCostDPrime": {
        "label": "高负荷相对低负荷的 d′ 下降"
      }
    },
    "experienceHeadline": "dPrimeByN",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "maxReliableN 只是本次配置内表现，不是标准化工作记忆等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次工作记忆更新任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "回看几步，你如何记住？",
      "introduction": "把不同回看难度下的记录分别阅读。",
      "summary": {
        "template": "本次达到可靠作答条件的最高回看难度为 {maxReliableN}。",
        "metricKeys": [
          "maxReliableN"
        ]
      },
      "studentMetricKeys": [
        "maxReliableN"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientTargetsByN"
      ],
      "metricGates": {},
      "nextStep": "不同难度不可直接混成能力总分；详细解读保留按难度的命中与误报。",
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议"
      },
      "illustration": "sequence",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "dPrimeByN"
        ],
        "pointUnit": "d-prime"
      }
    }
  }
]
