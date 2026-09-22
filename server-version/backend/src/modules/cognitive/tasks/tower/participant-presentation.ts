import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "tower",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "塔式规划",
    "metrics": {
      "minimumMoveSolveRate": {
        "label": "最短步解题比例",
        "explanation": "以最少步数解出的题目占全部题目的比例。",
        "singleExplanation": "以最少步数解出的题目占全部题目的比例。"
      },
      "excessMoves": {
        "label": "已解题平均额外步数",
        "explanation": "已解题目相对最短解法多走的平均步数。",
        "singleExplanation": "已解题目相对最短解法多走的平均步数。"
      },
      "solveRate": {
        "label": "解题比例",
        "explanation": "达到目标圆盘状态的题目比例。",
        "singleExplanation": "达到目标圆盘状态的题目比例。"
      },
      "firstMoveLatencyMs": {
        "label": "首步计划时长",
        "explanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。",
        "singleExplanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。"
      },
      "ruleViolations": {
        "label": "规则违反次数",
        "explanation": "不符合圆盘移动规则的尝试次数。",
        "singleExplanation": "不符合圆盘移动规则的尝试次数。"
      },
      "noAttemptRate": {
        "label": "未尝试问题比例",
        "explanation": "没有尝试移动的题目比例。",
        "singleExplanation": "没有尝试移动的题目比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在塔式规划中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用4 道规划题。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在塔式规划中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用10 道规划题。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在塔式规划中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用18 道规划题。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "解题比例、额外步数和规则违反应分开阅读；首步时长只作方法信息。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部塔式任务表现，不是商业 Tower 测验、计划能力诊断或人口常模。"
  }
]
