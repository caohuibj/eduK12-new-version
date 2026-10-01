import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
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
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在Flanker 箭头干扰中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 个平衡试次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在Flanker 箭头干扰中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用80 个平衡试次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在Flanker 箭头干扰中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用160 个平衡试次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "干扰效应必须与两种条件的准确率一起解释，避免速度—准确权衡误读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次箭头干扰任务表现，不是临床诊断或人口常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "周围的提示，会怎样影响选择？",
      "introduction": "对照提示一致与冲突时的记录。",
      "summary": {
        "template": "本次两种提示条件的用时差为 {flankerEffectMs}，冲突条件正确率为 {incongruentAccuracy}。",
        "metricKeys": [
          "flankerEffectMs",
          "incongruentAccuracy"
        ]
      },
      "studentMetricKeys": [
        "flankerEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCongruentTrials",
        "insufficientIncongruentTrials"
      ],
      "metricGates": {},
      "nextStep": "先确认操作规则，再一起阅读用时差与正确率。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "congruentAccuracy",
          "incongruentAccuracy"
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
