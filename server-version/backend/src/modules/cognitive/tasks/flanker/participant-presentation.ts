import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "flanker",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Flanker 箭头干扰",
    "metrics": {
      "flankerEffectMs": {
        "label": "干扰反应时间差",
        "explanation": "干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。",
        "singleExplanation": "干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。"
      },
      "incongruentAccuracy": {
        "label": "不一致条件正确率",
        "explanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。"
      },
      "congruentAccuracy": {
        "label": "一致条件正确率",
        "explanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。"
      },
      "errorCost": {
        "label": "准确率干扰差",
        "explanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
        "singleExplanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。"
      },
      "accuracy": {
        "label": "总体准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "medianRtCongruent": {
        "label": "一致条件典型反应时间",
        "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
        "singleExplanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
      },
      "medianRtIncongruent": {
        "label": "不一致条件典型反应时间",
        "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
        "singleExplanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
      },
      "omissionRate": {
        "label": "未反应比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "standard": {
        "tier": "PILOT",
        "profileLabel": "Pilot 版",
        "participantConclusion": "本次 Pilot 短版结果提示你在本次箭头干扰任务中，中央目标方向受到两侧干扰时的反应差异；由于试次数较少，应把干扰效应与两种条件的正确率一起作为初步任务表现参考。",
        "reportCaveats": [
          "Pilot 版采用 80 个严格平衡的正式试次，提供最低限度但可解释的单次干扰信息；干扰反应时间差可能仍有较大波动，不能单独解释为稳定的抑制控制能力。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "RESEARCH_READY",
        "profileLabel": "Research Ready 版",
        "participantConclusion": "本次 Research Ready 完整协议显示你在本次箭头干扰任务中的干扰反应时间差和条件正确率；在数据质量达标时，160 个平衡试次可提供较稳定的单次任务证据。",
        "reportCaveats": [
          "Research Ready 版采用 160 个严格平衡的正式试次，以更多一致与不一致条件观察提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级、诊断或稳定人格/能力结论。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "干扰效应必须与两种条件的准确率一起解释，避免速度—准确权衡误读。"
    ]
  }
]
