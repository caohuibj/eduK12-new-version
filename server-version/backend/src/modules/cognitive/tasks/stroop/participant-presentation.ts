import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
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
      "version": "1.1.0",
      "title": "有干扰时，你怎样抓住重点？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "字义与颜色冲突时，你这次答对了 {incongruentAccuracy}；两种情况下的通常用时相差 {stroopEffectMs}。",
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "看到一个字，我们很容易先读它。可当任务要求说出颜色，字的意思反而会来“抢注意”。我们比较有无冲突时的记录，观察这一次处理干扰的过程。",
        "takeaway": "抓住重点，有时需要绕过第一反应。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "校对时忽略熟悉的词义、按颜色标记核查表格，都需要遵循当前目标。这里的颜色冲突不等于日常专注力或学习能力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "stroopEffectMs": {
            "label": "多一层干扰，用时差了多少",
            "explanation": "有冲突和无冲突时典型用时的差；要连同正确率一起看。"
          },
          "incongruentAccuracy": {
            "label": "有干扰时，判断正确多少",
            "explanation": "当周围线索或字义与目标冲突时，判断正确的比例。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "congruentAccuracy": {
            "label": "没有冲突时，判断正确多少",
            "explanation": "当线索与目标一致时，判断正确的比例。"
          }
        }
      },
      "professional": {
        "construct": "颜色—词义冲突条件下的干扰效应",
        "procedure": "按一致/不一致条件分别计算正确率和有效正确反应 RT；干扰用时为不一致条件中位 RT 减一致条件中位 RT。",
        "interpretation": "同时阅读条件正确率、有效反应数与差值。差值可能受速度—准确率权衡影响，不直接推断抑制能力等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "stroopEffectMs": {
            "definition": "不一致条件的正确反应中位 RT 减去一致条件的正确反应中位 RT。",
            "readingHint": "需要两条件足够有效记录；保留符号，不凭差值判断个体抑制能力。"
          },
          "errorCost": {
            "definition": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "incongruentAccuracy": {
            "definition": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "congruentAccuracy": {
            "definition": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtCongruent": {
            "definition": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtIncongruent": {
            "definition": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validCongruentRtCount": {
            "definition": "按本次冻结任务定义记录“一致有效RT数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validIncongruentRtCount": {
            "definition": "按本次冻结任务定义记录“不一致有效RT数”。",
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
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
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
      "version": "1.1.0",
      "title": "有干扰时，你怎样抓住重点？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "字义与颜色冲突时，你这次答对了 {incongruentAccuracy}；两种情况下的通常用时相差 {stroopEffectMs}。",
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "看到一个字，我们很容易先读它。可当任务要求说出颜色，字的意思反而会来“抢注意”。我们比较有无冲突时的记录，观察这一次处理干扰的过程。",
        "takeaway": "抓住重点，有时需要绕过第一反应。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "校对时忽略熟悉的词义、按颜色标记核查表格，都需要遵循当前目标。这里的颜色冲突不等于日常专注力或学习能力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "stroopEffectMs": {
            "label": "多一层干扰，用时差了多少",
            "explanation": "有冲突和无冲突时典型用时的差；要连同正确率一起看。"
          },
          "incongruentAccuracy": {
            "label": "有干扰时，判断正确多少",
            "explanation": "当周围线索或字义与目标冲突时，判断正确的比例。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "congruentAccuracy": {
            "label": "没有冲突时，判断正确多少",
            "explanation": "当线索与目标一致时，判断正确的比例。"
          }
        }
      },
      "professional": {
        "construct": "颜色—词义冲突条件下的干扰效应",
        "procedure": "按一致/不一致条件分别计算正确率和有效正确反应 RT；干扰用时为不一致条件中位 RT 减一致条件中位 RT。",
        "interpretation": "同时阅读条件正确率、有效反应数与差值。差值可能受速度—准确率权衡影响，不直接推断抑制能力等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "stroopEffectMs": {
            "definition": "不一致条件的正确反应中位 RT 减去一致条件的正确反应中位 RT。",
            "readingHint": "需要两条件足够有效记录；保留符号，不凭差值判断个体抑制能力。"
          },
          "errorCost": {
            "definition": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "incongruentAccuracy": {
            "definition": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "congruentAccuracy": {
            "definition": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtCongruent": {
            "definition": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtIncongruent": {
            "definition": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validCongruentRtCount": {
            "definition": "按本次冻结任务定义记录“一致有效RT数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validIncongruentRtCount": {
            "definition": "按本次冻结任务定义记录“不一致有效RT数”。",
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
          }
        ]
      }
    }
  }
]
