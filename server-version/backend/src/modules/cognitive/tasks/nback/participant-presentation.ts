import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
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
        "label": "各 N 命中率"
      },
      "falseAlarmRateByN": {
        "label": "各 N 误报率"
      },
      "medianRtByN": {
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
    "disclaimer": "结果反映本次工作记忆更新任务表现，不是临床诊断或常模。"
  }
]
