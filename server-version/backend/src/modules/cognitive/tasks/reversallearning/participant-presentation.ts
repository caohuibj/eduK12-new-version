import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "reversallearning",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "概率反转学习",
    "metrics": {
      "acquisitionAccuracy": {
        "label": "初始学习正确率",
        "explanation": "初始学习阶段选择当前优势符号的比例。",
        "singleExplanation": "初始学习阶段选择当前优势符号的比例。"
      },
      "reversalAccuracy": {
        "label": "反转学习正确率",
        "explanation": "规则反转后选择新优势符号的比例。",
        "singleExplanation": "规则反转后选择新优势符号的比例。"
      },
      "reversalCost": {
        "label": "反转准确率变化",
        "explanation": "初始学习正确率减去反转阶段正确率；需结合两阶段数据阅读。",
        "singleExplanation": "初始学习正确率减去反转阶段正确率；需结合两阶段数据阅读。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数",
        "explanation": "反转后仍选择原优势符号的次数。",
        "singleExplanation": "反转后仍选择原优势符号的次数。"
      },
      "trialsToAcquisitionCriterion": {
        "label": "初始学习达标所需次数",
        "explanation": "初始学习阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
        "singleExplanation": "初始学习阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。"
      },
      "trialsToReversalCriterion": {
        "label": "反转学习达标所需次数",
        "explanation": "反转阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
        "singleExplanation": "反转阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。"
      },
      "feedbackWinRate": {
        "label": "反馈获胜比例",
        "explanation": "有效选择中获得正向反馈的比例，受到任务的概率反馈机制影响。",
        "singleExplanation": "有效选择中获得正向反馈的比例，受到任务的概率反馈机制影响。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "validResponseCount": {
        "label": "有效响应次数",
        "explanation": "本次两个阶段的有效选择次数。",
        "singleExplanation": "本次两个阶段的有效选择次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在概率反转学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用40 次，学习与反转各 20 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在概率反转学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用120 次，学习与反转各 60 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在概率反转学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用240 次，学习与反转各 120 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "结果描述本次 acquisition/reversal 阶段的作答轨迹，不评价人格、风险偏好或因果机制。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次概率学习和规则反转任务表现，不是人格、风险偏好或临床判断。"
  }
]
