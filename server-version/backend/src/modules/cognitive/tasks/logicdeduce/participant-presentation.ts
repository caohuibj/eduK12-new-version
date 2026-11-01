import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "logicdeduce",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "多条件逻辑推断",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对答案的比例。",
        "singleExplanation": "总体正确率：正式作答中选对答案的比例。"
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
      "把题目给出的条件一条条列出来，再逐步推导。",
      "用代入法：把每个选项放进条件里验证是否矛盾。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次逻辑推断的表现，不是语言能力、智力或年龄常模判断。",
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
        "concept": "每题给出若干逻辑条件（比如“甲比乙高，乙比丙高”），你要从条件出发推出结论。这个任务看的是你从已知信息出发做演绎推理的本领。",
        "takeaway": "先理条件，再推结论。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "做计划排优先级、根据线索找答案、判断谁对谁错，都用到了逻辑推理。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        "scene": "rules",
        "frames": [
          {
            "title": "读前对",
            "text": "把条件一条条列清楚。"
          },
          {
            "title": "套关系",
            "text": "从条件出发逐步推导。"
          },
          {
            "title": "选答案",
            "text": "四个选项里只有一个不与条件矛盾。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对答案的比例。"
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
        "construct": "多条件逻辑推断（关系推理）",
        "procedure": "题目集 logicdeduce-zh-v1.0.0 冻结于 config；逐题呈现逻辑推断题与四个选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        "interpretation": "正确率与用时同读；题库覆盖排序、条件、三段论等多种题型，分题型分析属研究用途，本报告不输出。",
        "confounders": [
          "阅读理解能力是必要的但不是充分的，核心是逻辑推导。",
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
    "presentationVersion": "2.0.0",
    "testType": "logicdeduce",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "title": "多条件逻辑推断",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对答案的比例。",
        "singleExplanation": "总体正确率：正式作答中选对答案的比例。"
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
      "把题目给出的条件一条条列出来，再逐步推导。",
      "用代入法：把每个选项放进条件里验证是否矛盾。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次逻辑推断的表现，不是语言能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "2.0.0",
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
          "template": "这次18题体验中，你答对的比例是 {accuracy}。短版只描述本次表现，不与其他人排名比较。",
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
        "legacyUninterpretable"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先看本次答对比例，再看用时和超时。下次可练习理清条件；这份报告不提供能力排名。",
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
        "concept": "每题给出若干逻辑条件（比如“甲比乙高，乙比丙高”），你要从条件出发推出结论。这个任务看的是你从已知信息出发做演绎推理的本领。",
        "takeaway": "先理条件，再推结论。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "做计划排优先级、根据线索找答案、判断谁对谁错，都用到了逻辑推理。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        "scene": "rules",
        "frames": [
          {
            "title": "读清条件",
            "text": "确认题目给了哪些信息、要求什么。"
          },
          {
            "title": "逐步推导",
            "text": "只用题内条件，区分一定成立与仅有可能。"
          },
          {
            "title": "核对选项",
            "text": "按题目问题选择结论；条件不足时可以选择无法确定。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对答案的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几题",
            "explanation": "已作出选择但答案不正确的正式题数；超时另计。"
          }
        }
      },
      "professional": {
        "construct": "多条件演绎推断",
        "procedure": "冻结题池 logicdeduce-zh-v2.0.0：36道独立正式题，另有1道不入分练习；体验/标准/科研为18/30/36题，每题15秒。超时记录null，正确率包含已呈现的超时题；正确且未中断、300ms至时限内的反应进入用时统计。",
        "interpretation": "正确率与用时同读；题库覆盖排序、条件、三段论等多种题型，分题型分析属研究用途，本报告不输出。",
        "confounders": [
          "阅读理解能力是必要的但不是充分的，核心是逻辑推导。",
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
    "presentationVersion": "3.0.0",
    "testType": "logicdeduce",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "title": "多条件逻辑推断",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对答案的比例。",
        "singleExplanation": "总体正确率：正式作答中选对答案的比例。"
      },
      "medianRtMs": {
        "label": "答对时的典型用时（中位数）",
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
        "label": "可用于用时统计的作答数"
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
          "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。",
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
          "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。",
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
          "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "把每条条件分开列出，再逐个验证选项；不能确定也可能是唯一合理结论。",
      "把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。 只描述本次记录，不换算IQ、同龄排名或诊断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "只凭这些条件，能推出什么？",
      "introduction": "把题目给出的条件连起来，区分必然成立、可能成立和暂时无法确定的结论。这里不需要用现实常识补条件。",
      "summary": {
        "template": "这次根据题内条件答对的比例为 {accuracy}；超时未答 {timeoutCount} 题。",
        "metricKeys": [
          "accuracy",
          "timeoutCount"
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
        "medianRtMs",
        "errorCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "把每条条件分开列出，再逐个验证选项；不能确定也可能是唯一合理结论。",
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
        "concept": "把题目给出的条件连起来，区分必然成立、可能成立和暂时无法确定的结论。这里不需要用现实常识补条件。",
        "takeaway": "把每条条件分开列出，再逐个验证选项；不能确定也可能是唯一合理结论。",
        "exampleTitle": "生活里，也会用到这样的思路",
        "example": "安排小组发言顺序时，“小林在小周前面”并不自动告诉你第三个人排在哪里。",
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
        "boundary": "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。",
        "metricHelp": {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对答案的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几题",
            "explanation": "已作出选择但答案不正确的正式题数；超时另计。"
          }
        }
      },
      "professional": {
        "construct": "多条件演绎推断",
        "procedure": "项目自编中文四选一，36道正式题与1道独立练习；seed确定不重复18/30/36题，每题15秒、起始注视400ms，后续另有约200ms间隔。正式正确率以全部已呈现完整题序列为分母（超时进入分母）；错误与未答分开，合格正确反应统计用时，null不补0。 本项目固定来源及协议：logicdeduce/bank与对应scorer；见本轮打卡表精确commit链接。",
        "interpretation": "没有标准原版可逐时序复刻。研究档仅增加本项目同一题池的观察量；未建立难度等值、可靠性或常模，不借其他标准工具的名字背书。",
        "confounders": [
          "这次只描述自编条件题中的选择，不代表完整逻辑能力或智力等级。",
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。"
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
      },
      "hiddenByProfile": {
        "experience": []
      }
    }
  }
]
