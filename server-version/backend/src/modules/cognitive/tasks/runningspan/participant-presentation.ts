import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "runningspan",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "运行记忆广度",
    "metrics": {
      "runningSpanAccuracy": {
        "label": "串行回忆正确率",
        "explanation": "串行回忆正确率：已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。",
        "singleExplanation": "串行回忆正确率：已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。"
      },
      "totalCorrectPositions": {
        "label": "串行正确总数",
        "explanation": "串行正确总数：未中断试次中位置与字母都正确的个数。",
        "singleExplanation": "串行正确总数：未中断试次中位置与字母都正确的个数。"
      },
      "intrusionRate": {
        "label": "侵入比例",
        "explanation": "侵入比例：已填位置中不属于目标末尾窗口的字母比例；这类字母未必在前面的序列里出现过。",
        "singleExplanation": "侵入比例：已填位置中不属于目标末尾窗口的字母比例。"
      },
      "medianResponseMs": {
        "label": "回忆用时中位数",
        "explanation": "回忆用时中位数：未中断试次记录的回忆阶段典型用时。",
        "singleExplanation": "回忆用时中位数：未中断试次记录的回忆阶段典型用时。"
      }
    },
    "experienceHeadline": "runningSpanAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "不知道序列何时结束：试着一直保持“最近几个”在脑子里。",
      "按顺序回忆，别只求快；留意有没有漏填或顺序颠倒。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次运行广度任务的回忆表现，不是记忆能力、临床状态或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "脑中的“最近几个”，你留住了多少？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的串行回忆正确率是 {runningSpanAccuracy}；混入目标窗口外字母的比例是 {intrusionRate}。",
        "metricKeys": [
          "runningSpanAccuracy",
          "intrusionRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的串行回忆正确率是 {runningSpanAccuracy}；试次较少，只描述这次体验。",
          "metricKeys": [
            "runningSpanAccuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "runningSpanAccuracy",
        "intrusionRate",
        "totalCorrectPositions"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyRecall",
        "excessiveIntrusions"
      ],
      "metricGates": {},
      "nextStep": "先回想有没有漏填或顺序颠倒，再结合正确率和侵入比例阅读。下次可尝试始终在心里保留最近几个字母；中断时只参考已记录的部分。",
      "chart": {
        "kind": "memory_lengths",
        "metricKeys": [
          "runningSpanAccuracy"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
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
        "concept": "字母一个一个蹦出来，什么时候停谁也不知道。你唯一的办法，是让脑子里一直只留“最近的几个”。停止后要把最后三个按顺序写出来——这就是工作记忆的“更新”：不断放进新的，挤掉旧的。",
        "takeaway": "记住最新的，放下过时的。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "老师连续报作业、比赛记分牌滚动更新、群消息一条条刷过，都需要不断替换脑子里的旧信息。这只反映记忆更新的一小部分，不代表你的记忆能力全貌。",
        "scene": "sequence",
        "frames": [
          {
            "title": "跟住新字母",
            "text": "每个字母都替换掉脑中的旧队列。"
          },
          {
            "title": "等待停止",
            "text": "你不知道哪一个是最后一个。"
          },
          {
            "title": "按序回忆",
            "text": "把最后三个按出现顺序选出。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "runningSpanAccuracy": {
            "label": "按顺序记对了多少",
            "explanation": "已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。"
          },
          "intrusionRate": {
            "label": "混入了窗口外的字母吗",
            "explanation": "已填位置中不属于目标末尾窗口的字母比例。"
          },
          "totalCorrectPositions": {
            "label": "一共记对了几个",
            "explanation": "未中断试次中位置与字母都正确的总数。"
          }
        }
      },
      "professional": {
        "construct": "工作记忆更新（运行广度）",
        "procedure": "每试次呈现 listLengthMin..listLengthMax 内随机长度的字母序列（刺激时长 stimulusMs、间隔 isiMs，终点不可预知），回忆最后 recallLength 项；串行严格计分：位置与字母均正确才计 1；侵入指回忆项不属于目标窗口。",
        "interpretation": "串行正确率只以已填槽位为分母，需结合漏填和侵入比例阅读；侵入不能单独证明旧信息清除失败。中断试次不进入这些统计。回忆阶段自定速，用时仅作描述。",
        "confounders": [
          "组块化/复述策略改变成绩。",
          "作答中断与空回忆降低可解释性。",
          "本报告不提供经过验证的人口常模、诊断、稳定记忆能力等级或临床结论。"
        ],
        "metricNotes": {
          "runningSpanAccuracy": {
            "definition": "未中断试次的串行正确数 / 已填回忆槽位数；没有未中断试次的已填槽位时为 null，填了但全错时为 0。",
            "readingHint": "严格串行计分；与侵入率同读。"
          },
          "totalCorrectPositions": {
            "definition": "未中断试次中位置与字母均正确的累计个数。",
            "readingHint": "受试次数影响，跨 profile 不可比。"
          },
          "intrusionRate": {
            "definition": "回忆中不属于目标窗口的字母占已填槽位的比例。",
            "readingHint": "达到 0.5 触发侵入过多标记。"
          },
          "medianResponseMs": {
            "definition": "未中断试次记录的回忆阶段用时中位数；没有这类试次时为 null。",
            "readingHint": "自定速任务，仅作描述。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "recallLength",
            "label": "回忆长度"
          },
          {
            "key": "stimulusMs",
            "label": "单字母呈现时长（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "runningspan",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "跟住不断变化的最后几项",
    "metrics": {
      "runningSpanAccuracy": {
        "label": "已填位置的顺序正确比例",
        "explanation": "串行回忆正确率：已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。",
        "singleExplanation": "串行回忆正确率：已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。"
      },
      "totalCorrectPositions": {
        "label": "字母和位置都正确的个数",
        "explanation": "串行正确总数：未中断试次中位置与字母都正确的个数。",
        "singleExplanation": "串行正确总数：未中断试次中位置与字母都正确的个数。"
      },
      "intrusionRate": {
        "label": "已填位置中的目标外字母比例",
        "explanation": "侵入比例：已填位置中不属于目标末尾窗口的字母比例；这类字母未必在前面的序列里出现过。",
        "singleExplanation": "侵入比例：已填位置中不属于目标末尾窗口的字母比例。"
      },
      "medianResponseMs": {
        "label": "典型回忆用时（中位数）",
        "explanation": "回忆用时中位数：未中断试次记录的回忆阶段典型用时。",
        "singleExplanation": "回忆用时中位数：未中断试次记录的回忆阶段典型用时。"
      }
    },
    "experienceHeadline": "runningSpanAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "可以留意漏填和顺序颠倒，不急着给自己贴标签；保持更新或结束后提取都可能参与，结果不能分离具体策略。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次运行广度任务的回忆表现，不是记忆能力、临床状态或年龄常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "跟住不断变化的最后几项",
      "introduction": "像在滚动消息里记住最后几条，这里观察序列结束后能否按顺序找回末尾内容。",
      "summary": {
        "template": "已经填入的位置中，字母和顺序都对的比例为 {runningSpanAccuracy}。空缺位置不在这个分母中，请同时看本次填写与完成情况。",
        "metricKeys": [
          "runningSpanAccuracy"
        ]
      },
      "summaryByProfile": {},
      "studentMetricKeys": [
        "runningSpanAccuracy",
        "intrusionRate",
        "totalCorrectPositions"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyRecall",
        "excessiveIntrusions"
      ],
      "metricGates": {},
      "nextStep": "可以留意漏填和顺序颠倒，不急着给自己贴标签；保持更新或结束后提取都可能参与，结果不能分离具体策略。",
      "chart": {
        "kind": "memory_lengths",
        "metricKeys": [
          "runningSpanAccuracy"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
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
        "concept": "像在滚动消息里记住最后几条，这里观察序列结束后能否按顺序找回末尾内容。",
        "takeaway": "序列停下后，按顺序找回最后几个；不同人可能采用不同策略。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "本次正确率只计算已经填入的位置，空格不进分母；必须同时看填写量，不能把高比例当作完整回忆。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看字母出现",
            "text": "字母逐个出现，序列长短不固定。"
          },
          {
            "title": "等序列停止",
            "text": "记住最后三个，策略可以不同。"
          },
          {
            "title": "按序找回",
            "text": "填写量和填写准确程度要一起读。"
          }
        ],
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "runningSpanAccuracy": {
            "label": "已填位置的顺序正确比例",
            "explanation": "串行回忆正确率：已填回忆位置中字母与顺序都对的比例；空缺位置不计入分母。"
          },
          "intrusionRate": {
            "label": "已填位置中的目标外字母比例",
            "explanation": "侵入比例：已填位置中不属于目标末尾窗口的字母比例；这类字母未必在前面的序列里出现过。"
          },
          "totalCorrectPositions": {
            "label": "字母和位置都正确的个数",
            "explanation": "串行正确总数：未中断试次中位置与字母都正确的个数。"
          }
        }
      },
      "professional": {
        "construct": "不定长视觉字母序列的末尾回忆",
        "procedure": "每试次呈现 listLengthMin..listLengthMax 内随机长度的字母序列（刺激时长 stimulusMs、间隔 isiMs，终点不可预知），回忆最后 recallLength 项；串行严格计分：位置与字母均正确才计 1；侵入指回忆项不属于目标窗口。",
        "interpretation": "已填位置准确率不包含空缺，需结合正确总数和中断情况。持续更新、复述或结束后提取都可能参与，不能据此分离单一更新机制。",
        "confounders": [
          "组块化/复述策略改变成绩。",
          "作答中断与空回忆降低可解释性。",
          "本报告不提供经过验证的人口常模、诊断、稳定记忆能力等级或临床结论。"
        ],
        "metricNotes": {
          "runningSpanAccuracy": {
            "definition": "未中断试次的串行正确数 / 已填回忆槽位数；没有未中断试次的已填槽位时为 null，填了但全错时为 0。",
            "readingHint": "严格串行计分；与侵入率同读。"
          },
          "totalCorrectPositions": {
            "definition": "未中断试次中位置与字母均正确的累计个数。",
            "readingHint": "受试次数影响，跨 profile 不可比。"
          },
          "intrusionRate": {
            "definition": "回忆中不属于目标窗口的字母占已填槽位的比例。",
            "readingHint": "达到 0.5 触发侵入过多标记。"
          },
          "medianResponseMs": {
            "definition": "未中断试次记录的回忆阶段用时中位数；没有这类试次时为 null。",
            "readingHint": "自定速任务，仅作描述。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "recallLength",
            "label": "回忆长度"
          },
          {
            "key": "stimulusMs",
            "label": "单字母呈现时长（毫秒）"
          }
        ]
      }
    }
  }
]
