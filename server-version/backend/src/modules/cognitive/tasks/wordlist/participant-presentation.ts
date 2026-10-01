import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "wordlist",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "中文词表自由回忆",
    "metrics": {
      "immediateAccuracy": {
        "label": "即时回忆正确率",
        "explanation": "最后一轮即时回忆中正确回忆出的不同词语占词表的比例。",
        "singleExplanation": "最后一轮即时回忆中正确回忆出的不同词语占词表的比例。"
      },
      "learningGain": {
        "label": "学习轮次增益",
        "explanation": "最后一轮与第一轮即时回忆正确率的差值。",
        "singleExplanation": "最后一轮与第一轮即时回忆正确率的差值。"
      },
      "delayedRecallAccuracy": {
        "label": "延迟回忆正确率",
        "explanation": "延迟阶段正确回忆出的不同词语占词表的比例；未完成时不显示数值。",
        "singleExplanation": "延迟阶段正确回忆出的不同词语占词表的比例；未完成时不显示数值。"
      },
      "totalImmediateCorrect": {
        "label": "即时回忆累计正确数",
        "explanation": "各即时回忆轮次正确词数之和，同一个词在不同轮次可重复计入。",
        "singleExplanation": "各即时回忆轮次正确词数之和，同一个词在不同轮次可重复计入。"
      },
      "recallByRound": {
        "label": "各轮回忆正确率",
        "explanation": "按学习轮次列出即时回忆正确率。",
        "singleExplanation": "按学习轮次列出即时回忆正确率。"
      },
      "intrusionCount": {
        "label": "侵入词数量",
        "explanation": "回答中不属于所呈现词表的词语数量。",
        "singleExplanation": "回答中不属于所呈现词表的词语数量。"
      },
      "duplicateResponseCount": {
        "label": "重复响应数量",
        "explanation": "同一轮内重复输入词语的数量。",
        "singleExplanation": "同一轮内重复输入词语的数量。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "medianResponseDurationMs": {
        "label": "回忆作答时长中位数",
        "explanation": "各回忆阶段作答时长的中位数。",
        "singleExplanation": "各回忆阶段作答时长的中位数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在中文词表自由回忆中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用8 个词、2 轮即时回忆。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在中文词表自由回忆中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用12 个词、3 轮即时回忆。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在中文词表自由回忆中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用15 个词、5 轮学习及延迟回忆。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "输入归一化只清理 Unicode 格式、空白和标点，并统一英文字母大小写；不做繁简转换、同义词匹配或模糊纠错。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次中文词表的键盘自由回忆表现，不是记忆能力、临床状态或人口常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "这些词，你这次记住了多少？",
      "introduction": "观察本次学习后的即时回忆记录。",
      "summary": {
        "template": "本次即时回忆正确率为 {immediateAccuracy}，即时正确回忆总数为 {totalImmediateCorrect}。",
        "metricKeys": [
          "immediateAccuracy",
          "totalImmediateCorrect"
        ]
      },
      "studentMetricKeys": [
        "immediateAccuracy",
        "totalImmediateCorrect",
        "intrusionCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyImmediateRecall"
      ],
      "metricGates": {
        "delayedRecallAccuracy": [
          "delayedStageIncomplete"
        ]
      },
      "nextStep": "只阅读实际测量的学习与回忆阶段，不推断一般记忆能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "immediateAccuracy",
          "delayedRecallAccuracy"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议"
      },
      "illustration": "sequence"
    }
  }
]
