import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
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
      "version": "1.1.0",
      "title": "一组词，留下了哪些印象？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "即时回忆阶段，你的正确比例是 {immediateAccuracy}，累计正确记录为 {totalImmediateCorrect} 个。",
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
        "科研档": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "学习一组词后，再回忆或辨认它们，不同阶段记录不同过程。报告只解释这次真正完成的阶段。",
        "takeaway": "记忆有过程，阶段要分开。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "学习新术语、回顾刚听到的一组信息，都包含词语学习。这里使用受控词表，记录不能代表日常记忆或学习成绩。",
        "scene": "sequence",
        "frames": [
          {
            "title": "接收信息",
            "text": "看到一组内容与它的先后。"
          },
          {
            "title": "保留与整理",
            "text": "在脑中留下线索，按要求处理。"
          },
          {
            "title": "复现与核对",
            "text": "比较本次答案与任务规则。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "immediateAccuracy": {
            "label": "刚学过的内容，答对多少",
            "explanation": "在本次即时学习或回忆阶段，正确作答的比例。"
          },
          "learningGain": {
            "label": "这几轮，正确比例改变多少",
            "explanation": "最后一轮与第一轮的正确比例差；不是学习潜力分数。"
          },
          "totalImmediateCorrect": {
            "label": "即时回忆中的正确记录",
            "explanation": "正式即时阶段中记录到的正确回忆数量。"
          },
          "intrusionCount": {
            "label": "说出了词表之外的内容",
            "explanation": "任务记录中不属于当前学习词表的回忆次数。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "词表学习中的回忆与再认",
        "procedure": "按冻结词表及阶段核查回忆与再认，分别记录即时、已完成延迟阶段及再认表现。",
        "interpretation": "区分学习次数、回忆与再认；材料熟悉度及语言背景会影响任务。延迟缺失不能解释为遗忘，研究专用轮次数据维持原披露边界。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "immediateAccuracy": {
            "definition": "最后一轮即时回忆中正确回忆出的不同词语占词表的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "learningGain": {
            "definition": "最后一轮与第一轮即时回忆正确率的差值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "delayedRecallAccuracy": {
            "definition": "延迟阶段正确回忆出的不同词语占词表的比例；未完成时不显示数值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "totalImmediateCorrect": {
            "definition": "各即时回忆轮次正确词数之和，同一个词在不同轮次可重复计入。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "recallByRound": {
            "definition": "按学习轮次列出即时回忆正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "intrusionCount": {
            "definition": "回答中不属于所呈现词表的词语数量。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "duplicateResponseCount": {
            "definition": "同一轮内重复输入词语的数量。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianResponseDurationMs": {
            "definition": "各回忆阶段作答时长的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          },
          {
            "key": "blockCount",
            "label": "区组数"
          },
          {
            "key": "startLength",
            "label": "起始序列长度"
          },
          {
            "key": "maxLength",
            "label": "配置长度上限"
          },
          {
            "key": "trialsPerLevel",
            "label": "每长度尝试数"
          },
          {
            "key": "nLevels",
            "label": "N-back 难度"
          },
          {
            "key": "trialCountByN",
            "label": "各 N 计划试次数"
          },
          {
            "key": "learningRounds",
            "label": "即时学习轮数"
          },
          {
            "key": "pairCount",
            "label": "配对数量"
          },
          {
            "key": "delayedEnabled",
            "label": "是否包含延迟阶段"
          }
        ]
      }
    }
  }
]
