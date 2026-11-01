import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "proofread",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "文本校对",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中找对错误的比例。",
        "singleExplanation": "总体正确率：正式作答中找对错误的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：答对的题目中，从题目出现到选择的典型时间。",
        "singleExplanation": "正确作答中位用时：答对的题目中，从题目出现到选择的典型时间。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "有效正确RT数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "仔细读句子的每个字，找出写错或用错的那个。",
      "把每个选项代回句子读一读，看哪个不通顺。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次文本校对的表现，不是语言能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "词与词之间的“关系”，你抓得住吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的类比推理正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的类比推理正确率是 {accuracy}；正式版会给出更稳的用时记录。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "errorCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先看正确率，再读用时；把错题的关系类型记下来，比只看分数更有用。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "题目给出一对词的关系，比如“鸟 对 翅膀”——翅膀是鸟身体的一部分。你要在选项里找到拥有同样关系的一对。这个任务看的是你发现并套用言语关系的能力。",
        "takeaway": "仔细读每个字，找出错的那一个。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "写作文后检查错字、帮同学改作业、审阅文件内容，都是文本校对。它只是语言能力的一小部分，不代表你的语言能力或智力全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "读前对",
            "text": "仔细读句子的每个字。"
          },
          {
            "title": "套关系",
            "text": "找出写错或用错的那个字词。"
          },
          {
            "title": "选答案",
            "text": "选出含有错误的那个字词。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "找对了多少",
            "explanation": "正式作答中找对错误的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "选择错误关系的次数；与用时一起看。"
          }
        }
      },
      "professional": {
        "construct": "文本校对（关系推理）",
        "procedure": "题目集 proofread-zh-v1.0.0 冻结于 config；逐题呈现词对类比与四个选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        "interpretation": "正确率与用时同读；题库覆盖错字、语法等多种错误类型，分类型分析属研究用途，本报告不输出。",
        "confounders": [
          "文字规范掌握与注意细节的能力共同影响成绩。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中选对的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应（rtMs ≥ validRtFloorMs）的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "stimulusSetVersion",
            "label": "题目集版本"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "proofread",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "文本校对",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "全部正式题中答对的比例；超时也进入分母。零正确不等于没有作答。",
        "singleExplanation": "全部正式题中答对的比例，包含超时题；不是人群排名。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "答对、未中断且不低于最低有效用时的反应中位数；没有合格反应时为空，不记成零。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数",
        "explanation": "未在时限内回应的题数；不混为选择错误。"
      },
      "validRtCount": {
        "label": "有效正确RT数"
      },
      "correctCount": {
        "label": "答对题数",
        "explanation": "本次正式题中选对的题数，零也是实际记录。"
      },
      "answeredCount": {
        "label": "已作答题数",
        "explanation": "在时限内实际选择了选项的正式题数。"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先完整读句子，再逐个核对选项中的原词，兼顾字形和上下文。",
      "错选与超时含义不同；可以先放慢速度练习检查，再逐渐建立稳定节奏。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果仅描述本次文本校对表现，无常模、诊断、信效度或能力等级结论。",
    "reportReading": {
      "version": "1.1.0",
      "title": "这次文本校对，你是怎样作答的？",
      "introduction": "从答对、已回应和超时的数量开始理解本次记录，再谨慎查看用时。",
      "summary": {
        "template": "本次正式题中答对 {correctCount} 题，实际回应 {answeredCount} 题，超时 {timeoutCount} 题；总体正确率为 {accuracy}。",
        "metricKeys": [
          "correctCount",
          "answeredCount",
          "timeoutCount",
          "accuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "本次简短体验总体正确率为 {accuracy}，实际回应 {answeredCount} 题，超时 {timeoutCount} 题。题目较少，不代表稳定能力。",
          "metricKeys": [
            "accuracy",
            "answeredCount",
            "timeoutCount"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "correctCount",
        "answeredCount",
        "timeoutCount",
        "medianRtMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "noResponses"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先完整读句子，再逐个核对选项中的原词，兼顾字形和上下文。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "你会读到一句只有一处错误的句子，并从四个原句字词中选出写错的一项。任务观察本次文字细节检查表现，不把词语关系推理当作校对。",
        "takeaway": "先完整读句子，再逐个核对选项中的原词，兼顾字形和上下文。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "写好一段通知后，把字词逐个放回上下文核对，可以发现错别字和“的／地”使用问题。",
        "scene": "rules",
        "frames": [
          {
            "title": "读题",
            "text": "先读完整材料和作答要求。"
          },
          {
            "title": "核对",
            "text": "逐一比较选项与原文或原句。"
          },
          {
            "title": "作答",
            "text": "在时限内选出唯一答案，不连按抢答。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "找对了多少",
            "explanation": "正式作答中找对错误的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "实际回应但选择错误的次数，不含超时。"
          }
        }
      },
      "professional": {
        "construct": "原创中文文本校对任务表现",
        "procedure": "题目集proofread-zh-v1.1.0冻结36道原创审订题，按seed不重复抽取18/30/36题；独立练习1题，答对后进入正式。每题15秒上限，全部正式题进入正确率分母。",
        "interpretation": "仅描述本次正确率、作答数、错误数、超时数及合格正确反应中位用时。没有合格用时显示缺失；全部未回应不解释为能力零分。",
        "confounders": [
          "文字规范掌握与注意细节的能力共同影响成绩。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "答对正式题数除以计划且实际齐全的正式题数，超时进入分母。",
            "readingHint": "与已回应、错选及超时数量同读；不是百分位。"
          },
          "medianRtMs": {
            "definition": "正确、未中断且validRtFloorMs≤rtMs≤timeoutMs反应的中位时间。",
            "readingHint": "少于2个合格反应时仅保留原值，不解释稳定速度。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "stimulusSetVersion",
            "label": "题目集版本"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "proofread",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "文本校对",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "全部正式题中答对的比例；超时也进入分母。零正确不等于没有作答。",
        "singleExplanation": "全部正式题中答对的比例，包含超时题；不是人群排名。"
      },
      "medianRtMs": {
        "label": "答对时的典型用时（中位数）",
        "explanation": "答对、未中断且不低于最低有效用时的反应中位数；没有合格反应时为空，不记成零。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数",
        "explanation": "未在时限内回应的题数；不混为选择错误。"
      },
      "validRtCount": {
        "label": "可用于用时统计的作答数"
      },
      "correctCount": {
        "label": "答对题数",
        "explanation": "本次正式题中选对的题数，零也是实际记录。"
      },
      "answeredCount": {
        "label": "已作答题数",
        "explanation": "在时限内实际选择了选项的正式题数。"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "回看这次完成的18题；只描述本次表现。",
        "reportCaveats": [
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "标准任务",
        "participantConclusion": "回看这次完成的30题；只描述本次表现。",
        "reportCaveats": [
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "没有标准原版可逐时序复刻。研究档仅增加本项目同一题池的观察量；未建立难度等值、可靠性或常模，不借其他标准工具的名字背书。",
        "reportCaveats": [
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "按词语和句子结构慢一点核对；看懂大意后，再检查容易被顺读带过去的小错误。",
      "把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。 只描述本次记录，不换算IQ、同龄排名或诊断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "找出一句话里不合适的字词",
      "introduction": "逐字核对句子里原有的写法，选出一处错别字或指定的用法错误。比较的是原句里的字词，不是选改正后的答案。",
      "summary": {
        "template": "本次正式题中答对 {correctCount} 题，实际回应 {answeredCount} 题，超时 {timeoutCount} 题；总体正确率为 {accuracy}。",
        "metricKeys": [
          "correctCount",
          "answeredCount",
          "timeoutCount",
          "accuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，答对比例是 {accuracy}。题目较少，只描述这一次选择，不推断稳定能力。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "correctCount",
        "answeredCount",
        "timeoutCount",
        "medianRtMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "noResponses"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "按词语和句子结构慢一点核对；看懂大意后，再检查容易被顺读带过去的小错误。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "逐字核对句子里原有的写法，选出一处错别字或指定的用法错误。比较的是原句里的字词，不是选改正后的答案。",
        "takeaway": "按词语和句子结构慢一点核对；看懂大意后，再检查容易被顺读带过去的小错误。",
        "exampleTitle": "生活里，也会用到这样的思路",
        "example": "发出消息前再看一遍，容易发现“已经”打成了“以经”；这里也要看原句实际写了什么。",
        "scene": "rules",
        "frames": [
          {
            "title": "看清任务",
            "text": "先看清本题给出的信息和需要完成的目标。"
          },
          {
            "title": "核对线索",
            "text": "把一个可能的办法与完整条件逐一核对。"
          },
          {
            "title": "留下记录",
            "text": "按本任务规则作答；报告回看这一次的选择与过程。"
          }
        ],
        "boundary": "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。",
        "metricHelp": {
          "accuracy": {
            "label": "找对了多少",
            "explanation": "正式作答中找对错误的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "实际回应但选择错误的次数，不含超时。"
          }
        }
      },
      "professional": {
        "construct": "原创中文文本校对任务表现",
        "procedure": "项目自编中文四选一，36道正式题与1道独立练习；seed确定不重复18/30/36题，每题15秒、起始注视400ms，后续另有约200ms间隔。正式正确率以全部已呈现完整题序列为分母（超时进入分母）；错误与未答分开，合格正确反应统计用时，null不补0。 本项目固定来源及协议：proofread/bank与对应scorer；见本轮打卡表精确commit链接。",
        "interpretation": "没有标准原版可逐时序复刻。研究档仅增加本项目同一题池的观察量；未建立难度等值、可靠性或常模，不借其他标准工具的名字背书。",
        "confounders": [
          "校对结果受中文书写规范熟悉程度与注意状态影响，不能解释为人格或完整语言能力。",
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "答对正式题数除以计划且实际齐全的正式题数，超时进入分母。",
            "readingHint": "与已回应、错选及超时数量同读；不是百分位。"
          },
          "medianRtMs": {
            "definition": "正确、未中断且validRtFloorMs≤rtMs≤timeoutMs反应的中位时间。",
            "readingHint": "少于2个合格反应时仅保留原值，不解释稳定速度。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "stimulusSetVersion",
            "label": "题目集版本"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": []
      }
    }
  }
]
