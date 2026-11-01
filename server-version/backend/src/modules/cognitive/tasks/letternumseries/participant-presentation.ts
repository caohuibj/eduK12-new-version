import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "letternumseries",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "字母数字序列",
    "metrics": {
      "overallAccuracy": {
        "label": "重排回忆正确率",
        "explanation": "重排回忆正确率：把字母按字母表、数字按从小到大排序后，所有应回忆位置中填对的比例；不是整题全对的比例。",
        "singleExplanation": "重排回忆正确率：字母按顺序、数字按大小放对的比例。"
      },
      "lettersAccuracy": {
        "label": "字母排序正确率",
        "explanation": "字母排序正确率：字母按 A→Z 顺序放对的比例。",
        "singleExplanation": "字母排序正确率：字母按 A→Z 顺序放对的比例。"
      },
      "digitsAccuracy": {
        "label": "数字排序正确率",
        "explanation": "数字排序正确率：数字按从小到大放对的比例。",
        "singleExplanation": "数字排序正确率：数字按从小到大放对的比例。"
      },
      "emptyRecallCount": {
        "label": "空回忆试次数"
      },
      "medianResponseMs": {
        "label": "回忆用时中位数"
      }
    },
    "experienceHeadline": "overallAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先记住“有哪些”，回忆时再排序：字母按 A→Z，数字从小到大。",
      "观看逐项呈现时，可以在心里分组记住字母与数字。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次字母数字序列任务的回忆表现，不是记忆能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "混在一起的信息，你能分门别类吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的重排回忆正确率是 {overallAccuracy}；字母部分 {lettersAccuracy}、数字部分 {digitsAccuracy}。",
        "metricKeys": [
          "overallAccuracy",
          "lettersAccuracy",
          "digitsAccuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的重排回忆正确率是 {overallAccuracy}；正式版会分别给出字母与数字的记录。",
          "metricKeys": [
            "overallAccuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "overallAccuracy",
        "lettersAccuracy",
        "digitsAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyRecallExcess"
      ],
      "metricGates": {},
      "nextStep": "先看总体记录，再对照字母和数字两部分。一次差异可能与熟悉程度、排序策略或作答中断有关，不代表稳定的记忆弱项。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "lettersAccuracy",
          "digitsAccuracy"
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
        "concept": "字母和数字会混在一起出现，比如 D、4、K、9。回忆时不能按出现顺序，而是要把字母按 A→Z 排好，再把数字从小到大排好——这就是“边记边整理”。",
        "takeaway": "记住内容只是第一步，重新整理才是关键。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "记车牌字母加数字、整理课程代码、把听到的书名按拼音归类，都需要一边保持信息一边重排。这只反映工作记忆操作的一小部分，不代表记忆能力全貌。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看序列",
            "text": "字母和数字混着出现。"
          },
          {
            "title": "分组整理",
            "text": "心里分成字母组和数字组。"
          },
          {
            "title": "按序回忆",
            "text": "字母按 A→Z，数字从小到大。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "overallAccuracy": {
            "label": "总共放对了多少",
            "explanation": "两个回忆部分合并计算的按位正确比例。"
          },
          "lettersAccuracy": {
            "label": "字母排对了多少",
            "explanation": "字母按字母表顺序放对的比例。"
          },
          "digitsAccuracy": {
            "label": "数字排对了多少",
            "explanation": "数字按从小到大放对的比例。"
          }
        }
      },
      "professional": {
        "construct": "工作记忆的重排/操作（字母-数字序列）",
        "procedure": "每试次呈现 lettersPerTrial 个字母与 digitsPerTrial 个数字（混合顺序）；回忆分两段：字母按字母表顺序、数字按升序；串行严格计分（位置与内容均正确）。",
        "interpretation": "分别阅读字母与数字两部分正确率；回忆阶段自定速，用时仅作描述。",
        "confounders": [
          "排序策略（分组复述 vs 逐项更新）影响成绩。",
          "作答中断与空回忆降低可解释性。",
          "本报告不提供经过验证的人口常模、诊断、记忆能力或智力等级结论。"
        ],
        "metricNotes": {
          "overallAccuracy": {
            "definition": "(字母串行正确数 + 数字串行正确数) / (字母总数 + 数字总数)。",
            "readingHint": "两部分合并的总体指标。"
          },
          "lettersAccuracy": {
            "definition": "字母按升序串行正确的比例。",
            "readingHint": "与数字部分对照阅读。"
          },
          "digitsAccuracy": {
            "definition": "数字按升序串行正确的比例。",
            "readingHint": "与字母部分对照阅读。"
          },
          "emptyRecallCount": {
            "definition": "两段回忆均为空的试次数。",
            "readingHint": "占比达到 0.5 触发空回忆过多标记。"
          },
          "medianResponseMs": {
            "definition": "未中断试次中，从呈现结束后的间隔开始到两段答案提交的用时中位数。",
            "readingHint": "自定速任务，仅作描述。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "lettersPerTrial",
            "label": "每试次字母数"
          },
          {
            "key": "digitsPerTrial",
            "label": "每试次数字数"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "letternumseries",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "把混排的字母和数字重新整理",
    "metrics": {
      "overallAccuracy": {
        "label": "未中断题目的位置重排正确率",
        "explanation": "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。",
        "singleExplanation": "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。"
      },
      "lettersAccuracy": {
        "label": "字母部分正确比例",
        "explanation": "字母排序正确率：字母按 A→Z 顺序放对的比例。",
        "singleExplanation": "字母排序正确率：字母按 A→Z 顺序放对的比例。"
      },
      "digitsAccuracy": {
        "label": "数字部分正确比例",
        "explanation": "数字排序正确率：数字按从小到大放对的比例。",
        "singleExplanation": "数字排序正确率：数字按从小到大放对的比例。"
      },
      "emptyRecallCount": {
        "label": "空回忆试次数"
      },
      "medianResponseMs": {
        "label": "回忆用时中位数"
      }
    },
    "experienceHeadline": "overallAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "区分漏记、分组和排序错误；不把本次几轮结果当作一般工作记忆分数。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次字母数字序列任务的回忆表现，不是记忆能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "把混排的字母和数字重新整理",
      "introduction": "像把一串混排标签重新分组，这里是看屏幕后整理顺序的小游戏，不是听力或标准韦氏测验。",
      "summary": {
        "template": "这一次，你的重排回忆正确率是 {overallAccuracy}；字母部分 {lettersAccuracy}、数字部分 {digitsAccuracy}。",
        "metricKeys": [
          "overallAccuracy",
          "lettersAccuracy",
          "digitsAccuracy"
        ]
      },
      "summaryByProfile": {},
      "studentMetricKeys": [
        "overallAccuracy",
        "lettersAccuracy",
        "digitsAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyRecallExcess"
      ],
      "metricGates": {},
      "nextStep": "区分漏记、分组和排序错误；不把本次几轮结果当作一般工作记忆分数。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "lettersAccuracy",
          "digitsAccuracy"
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
        "concept": "像把一串混排标签重新分组，这里是看屏幕后整理顺序的小游戏，不是听力或标准韦氏测验。",
        "takeaway": "先看清并记住，再按本任务规则把字母和数字分开整理。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "先按本任务规则排列字母，再整理数字；成绩按位置计，不等于整串都完整答对。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看序列",
            "text": "字母和数字混着出现。"
          },
          {
            "title": "分组整理",
            "text": "心里分成字母组和数字组。"
          },
          {
            "title": "按序回忆",
            "text": "字母按 A→Z，数字从小到大。"
          }
        ],
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "overallAccuracy": {
            "label": "未中断题目的位置重排正确率",
            "explanation": "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。"
          },
          "lettersAccuracy": {
            "label": "字母部分正确比例",
            "explanation": "字母排序正确率：字母按 A→Z 顺序放对的比例。"
          },
          "digitsAccuracy": {
            "label": "数字部分正确比例",
            "explanation": "数字排序正确率：数字按从小到大放对的比例。"
          }
        }
      },
      "professional": {
        "construct": "视觉、固定长度的字母数字重排项目变式",
        "procedure": "每试次呈现 lettersPerTrial 个字母与 digitsPerTrial 个数字（混合顺序）；回忆分两段：字母按字母表顺序、数字按升序；串行严格计分（位置与内容均正确）。",
        "interpretation": "准确率按未中断题的各个位置计分，固定每题4字母+3数字；不是整串全对率。先排字母再排数字，视觉按钮输入，不是韦氏原测验、听觉记忆或广度。",
        "confounders": [
          "排序策略（分组复述 vs 逐项更新）影响成绩。",
          "作答中断与空回忆降低可解释性。",
          "本报告不提供经过验证的人口常模、诊断、记忆能力或智力等级结论。"
        ],
        "metricNotes": {
          "overallAccuracy": {
            "definition": "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。",
            "readingHint": "中断题整体排除，不能只凭高比例推断完整表现。"
          },
          "lettersAccuracy": {
            "definition": "字母按升序串行正确的比例。",
            "readingHint": "与数字部分对照阅读。"
          },
          "digitsAccuracy": {
            "definition": "数字按升序串行正确的比例。",
            "readingHint": "与字母部分对照阅读。"
          },
          "emptyRecallCount": {
            "definition": "两段回忆均为空的试次数。",
            "readingHint": "占比达到 0.5 触发空回忆过多标记。"
          },
          "medianResponseMs": {
            "definition": "未中断试次中，从呈现结束后的间隔开始到两段答案提交的用时中位数。",
            "readingHint": "自定速任务，仅作描述。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "lettersPerTrial",
            "label": "每试次字母数"
          },
          {
            "key": "digitsPerTrial",
            "label": "每试次数字数"
          }
        ]
      }
    }
  }
]
