import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "mentalrotation",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "心理旋转",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "angleCost": {
        "label": "大角度反应时代价",
        "explanation": "大角度条件减去小角度条件的正确反应中位时间。",
        "singleExplanation": "大角度条件减去小角度条件的正确反应中位时间。"
      },
      "medianCorrectRtMs": {
        "label": "典型正确反应时间",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "mirrorErrorRate": {
        "label": "镜像项目错误率",
        "explanation": "镜像项目中判断错误的比例。",
        "singleExplanation": "镜像项目中判断错误的比例。"
      },
      "omissionRate": {
        "label": "遗漏比例",
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
        "participantConclusion": "本次体验版结果提示你在心理旋转中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用12 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在心理旋转中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用40 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在心理旋转中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用80 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "角度代价只在大小角度都有足够正确反应时解释，并与正确率同屏阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部几何旋转任务表现，不是完整空间智力、诊断或人口常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "转过一个角度，你如何判断？",
      "introduction": "同时阅读本次旋转判断的正确率与用时。",
      "summary": {
        "template": "本次旋转判断正确率为 {accuracy}，正确作答典型用时为 {medianCorrectRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianCorrectRtMs"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "medianCorrectRtMs",
        "mirrorErrorRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAngleCoverage"
      ],
      "metricGates": {},
      "nextStep": "不同角度与设备可能影响作答；不以单一正确率概括空间能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy",
          "mirrorErrorRate"
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
