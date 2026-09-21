import type { CognitiveTaskParticipantPresentationV1 } from '../participant-presentation.types'

export const flankerParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "exactProfilePresentations": [
    {
      "engineVersion": "1.0.0",
      "scoringVersion": "1.0.0",
      "profile": "standard",
      "presentation": {
        "tier": "PILOT",
        "profileLabel": "Pilot 版",
        "participantConclusion": "本次 Pilot 短版结果提示你在本次箭头干扰任务中，中央目标方向受到两侧干扰时的反应差异；由于试次数较少，应把干扰效应与两种条件的正确率一起作为初步任务表现参考。",
        "reportCaveats": [
          "Pilot 版采用 80 个严格平衡的正式试次，提供最低限度但可解释的单次干扰信息；干扰反应时间差可能仍有较大波动，不能单独解释为稳定的抑制控制能力。"
        ],
        "showProductIndex": false
      }
    },
    {
      "engineVersion": "1.0.0",
      "scoringVersion": "1.0.0",
      "profile": "research",
      "presentation": {
        "tier": "RESEARCH_READY",
        "profileLabel": "Research Ready 版",
        "participantConclusion": "本次 Research Ready 完整协议显示你在本次箭头干扰任务中的干扰反应时间差和条件正确率；在数据质量达标时，160 个平衡试次可提供较稳定的单次任务证据。",
        "reportCaveats": [
          "Research Ready 版采用 160 个严格平衡的正式试次，以更多一致与不一致条件观察提高单次指标稳定性；结果仍只解释本次任务表现，不代表人口常模、年龄等级、诊断或稳定人格/能力结论。"
        ],
        "showProductIndex": false
      }
    }
  ]
} as const satisfies CognitiveTaskParticipantPresentationV1
