import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "stroop",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "色词 Stroop",
    "metrics": {
      "stroopEffectMs": {
        "label": "Stroop 干扰效应",
        "explanation": "冲突干扰时间：冲突条件相对一致条件增加的反应时间。",
        "singleExplanation": "冲突干扰时间：冲突条件相对一致条件增加的反应时间。"
      },
      "errorCost": {
        "label": "准确率干扰差",
        "explanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
        "singleExplanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。"
      },
      "incongruentAccuracy": {
        "label": "不一致条件正确率",
        "explanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。"
      },
      "accuracy": {
        "label": "总体准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "congruentAccuracy": {
        "label": "一致条件正确率",
        "explanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。"
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
      "timeoutCount": {
        "label": "超时次数"
      },
      "validCongruentRtCount": {
        "label": "一致有效RT数"
      },
      "validIncongruentRtCount": {
        "label": "不一致有效RT数"
      }
    },
    "experienceHeadline": "incongruentAccuracy",
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": [],
    "singleHiddenMetrics": [],
    "disclaimer": "不得仅以总体准确率代表抑制能力，也不是年龄常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "文字与颜色不同，你如何选择？",
      "introduction": "同时阅读不同条件下的用时与正确率。",
      "summary": {
        "template": "本次两类条件的用时差为 {stroopEffectMs}；冲突条件的正确率为 {incongruentAccuracy}。",
        "metricKeys": [
          "stroopEffectMs",
          "incongruentAccuracy"
        ]
      },
      "studentMetricKeys": [
        "stroopEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidCongruentRt",
        "insufficientValidIncongruentRt"
      ],
      "metricGates": {},
      "nextStep": "先看正确率，再理解条件间的用时差；负差值也不代表抑制能力优秀。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtCongruent",
          "medianRtIncongruent"
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
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "stroop",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "色词 Stroop",
    "metrics": {
      "stroopEffectMs": {
        "label": "Stroop 干扰效应",
        "explanation": "冲突干扰时间：冲突条件相对一致条件增加的反应时间。",
        "singleExplanation": "冲突干扰时间：冲突条件相对一致条件增加的反应时间。"
      },
      "errorCost": {
        "label": "准确率干扰差",
        "explanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
        "singleExplanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。"
      },
      "incongruentAccuracy": {
        "label": "不一致条件正确率",
        "explanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。"
      },
      "accuracy": {
        "label": "总体准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "congruentAccuracy": {
        "label": "一致条件正确率",
        "explanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。"
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
      "timeoutCount": {
        "label": "超时次数"
      },
      "validCongruentRtCount": {
        "label": "一致有效RT数"
      },
      "validIncongruentRtCount": {
        "label": "不一致有效RT数"
      }
    },
    "experienceHeadline": "incongruentAccuracy",
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": [
      "面对冲突信息时先确认目标规则，再做响应。",
      "减少多任务切换可降低无关信息干扰。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "不得仅以总体准确率代表抑制能力，也不是年龄常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "文字与颜色不同，你如何选择？",
      "introduction": "同时阅读不同条件下的用时与正确率。",
      "summary": {
        "template": "本次两类条件的用时差为 {stroopEffectMs}；冲突条件的正确率为 {incongruentAccuracy}。",
        "metricKeys": [
          "stroopEffectMs",
          "incongruentAccuracy"
        ]
      },
      "studentMetricKeys": [
        "stroopEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidCongruentRt",
        "insufficientValidIncongruentRt"
      ],
      "metricGates": {},
      "nextStep": "先看正确率，再理解条件间的用时差；负差值也不代表抑制能力优秀。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtCongruent",
          "medianRtIncongruent"
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
