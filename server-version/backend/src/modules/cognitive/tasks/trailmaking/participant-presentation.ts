import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "trailmaking",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Trail Making 视觉搜索",
    "metrics": {
      "completionTimeMs": {
        "label": "累计正确步骤时长",
        "explanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。",
        "singleExplanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。"
      },
      "errorCount": {
        "label": "错误尝试次数",
        "explanation": "选择错误目标的尝试次数。",
        "singleExplanation": "选择错误目标的尝试次数。"
      },
      "setShiftCostMs": {
        "label": "规则切换时间差",
        "explanation": "B 部分平均正确步骤时间减去 A 部分平均正确步骤时间；仅 A 部分时不提供。",
        "singleExplanation": "B 部分平均正确步骤时间减去 A 部分平均正确步骤时间；仅 A 部分时不提供。"
      },
      "partACompletionTimeMs": {
        "label": "A 部分累计正确步骤时长",
        "explanation": "A 部分在时限内完成的正确步骤时长之和。",
        "singleExplanation": "A 部分在时限内完成的正确步骤时长之和。"
      },
      "partBCompletionTimeMs": {
        "label": "B 部分累计正确步骤时长",
        "explanation": "B 部分在时限内完成的正确步骤时长之和。",
        "singleExplanation": "B 部分在时限内完成的正确步骤时长之和。"
      },
      "meanCorrectStepTimeMs": {
        "label": "平均正确步骤时间",
        "explanation": "已完成正确步骤的平均时长。",
        "singleExplanation": "已完成正确步骤的平均时长。"
      },
      "completedStepCount": {
        "label": "完成步骤数",
        "explanation": "在时限内选择正确目标的步骤数。",
        "singleExplanation": "在时限内选择正确目标的步骤数。"
      },
      "errorRate": {
        "label": "错误尝试比例",
        "explanation": "错误目标尝试占全部目标尝试的比例。",
        "singleExplanation": "错误目标尝试占全部目标尝试的比例。"
      },
      "omissionRate": {
        "label": "遗漏步骤比例",
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
        "participantConclusion": "本次体验版结果提示你在Trail Making 视觉搜索中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用A 部分 12 个目标。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档不测量 A/B 规则切换代价。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在Trail Making 视觉搜索中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用A、B 各 12 个目标。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在Trail Making 视觉搜索中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用A、B 各 24 个目标。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "累计正确步骤时长应与错误尝试、A/B 部分和设备/指针信息一起阅读；它不是从任务开始到结束的端到端用时。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次视觉搜索、动作速度和规则切换任务表现，不是 motor 能力诊断或人口常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "连成顺序，看看这一次",
      "introduction": "一起观察完成用时、步骤和错误记录。",
      "summary": {
        "template": "本次完成用时为 {completionTimeMs}，错误记录为 {errorCount}。",
        "metricKeys": [
          "completionTimeMs",
          "errorCount"
        ]
      },
      "studentMetricKeys": [
        "completionTimeMs",
        "errorCount",
        "completedStepCount"
      ],
      "processMetricKeys": [
        "completedStepCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedSteps"
      ],
      "metricGates": {},
      "nextStep": "时间与纠错过程一起看；不套用临床判断标准。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "partACompletionTimeMs",
          "partBCompletionTimeMs"
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
