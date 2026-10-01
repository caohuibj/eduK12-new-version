import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "matrix",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "矩阵规则推理",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "accuracyByRuleFamily": {
        "valueUnit": "ratio",
        "valueLabels": { "progression": "递进规律", "alternation": "交替规律", "combination": "组合规律" },
        "label": "各规则族正确率",
        "explanation": "按图形规则类别分别统计正确率。",
        "singleExplanation": "按图形规则类别分别统计正确率。"
      },
      "reachedDifficulty": {
        "label": "达到的最高难度",
        "explanation": "本次正确完成题目所达到的最高内部难度，不是智力等级。",
        "singleExplanation": "本次正确完成题目所达到的最高内部难度，不是智力等级。"
      },
      "medianRtMs": {
        "label": "正确反应中位时长",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [
      "reachedDifficulty"
    ],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在矩阵规则推理中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 道题。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在矩阵规则推理中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用16 道题。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在矩阵规则推理中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用24 道题。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "正确率按规则族和难度覆盖一起阅读，不换算 IQ 或智力等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部矩阵规则任务表现，不是 Raven、IQ、临床判断或人口常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "图形有规律，你发现了什么？",
      "introduction": "观察这次图形规律题的作答记录。",
      "summary": {
        "template": "本次图形规律题正确率为 {accuracy}。",
        "metricKeys": [
          "accuracy"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "reachedDifficulty"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "题目内容与难度会影响记录；这里不提供智商或一般推理能力等级。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
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
