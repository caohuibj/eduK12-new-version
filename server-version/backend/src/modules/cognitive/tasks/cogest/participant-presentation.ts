import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "cogest",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "认知估算",
    "metrics": {
      "accuracy": {
        "label": "合理量级选中率",
        "explanation": "合理量级选中率：正式作答中选对答案的比例。",
        "singleExplanation": "合理量级选中率：正式作答中选对答案的比例。"
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
      "先想想现实中的物体和场景，再判断数量是否合理。",
      "检查估计是否明显偏大或偏小，不要求精确背数。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次现实数量估算的表现，不是语言能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "现实中的数量，大致有多大？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的估算题目标量级选中率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的估算题目标量级选中率是 {accuracy}；短任务记录较少，不能据此推断稳定能力。",
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
        "concept": "根据日常经验判断现实数量的合理量级。它混合一般知识与估算策略，不是纯粹的估算能力测量。",
        "takeaway": "先联系现实，再核查数量级。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "判断物体多重、空间多大，需要结合经验检查数量是否合理；本任务不提供智力、诊断或同龄人排名。",
        "scene": "rules",
        "frames": [
          {
            "title": "读前对",
            "text": "先确认在估计哪一种现实数量。"
          },
          {
            "title": "套关系",
            "text": "结合现实经验判断量级。"
          },
          {
            "title": "选答案",
            "text": "排除明显偏离现实量级的选项。"
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
            "explanation": "未选中项目预期量级选项的题数；与超时分开看。"
          }
        }
      },
      "professional": {
        "construct": "现实数量合理性判断",
        "procedure": "题目集 cogest-zh-v1.0.0 冻结于 config；逐题呈现现实数量估算题与四个选项，按冻结题库预期选项计分；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        "interpretation": "选中预期量级选项的比例与用时同读；一般知识和生活经验会影响表现，不能作临床常模或能力排名。",
        "confounders": [
          "一般知识、文化和生活经验会影响估算，不能解释为纯估算能力。",
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
    "testType": "cogest",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "认知估算",
    "metrics": {
      "accuracy": {
        "label": "本次合理量级选中率",
        "explanation": "选中项目预设量级选项的题数除以已呈现正式题数；超时计入分母，0保留；不是人群常模。"
      },
      "medianRtMs": {
        "label": "正确且未中断作答的典型用时",
        "explanation": "仅纳入300毫秒至题目时限之间的正确、未中断作答；没有记录为null，不补成0。"
      },
      "errorCount": {
        "label": "选错题数"
      },
      "timeoutCount": {
        "label": "超时未答题数"
      },
      "validRtCount": {
        "label": "有效正确用时数量"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "singleHiddenMetrics": [],
    "disclaimer": "内部估算候选题；区间是粗粒度量级选项，不是临床容许范围或人口常模。本报告只描述项目自编36题试测中的数量级选择；一般知识、生活经验和文化背景影响表现，不据此判断临床状态、智商或同龄人排名。",
    "suppressTips": false,
    "practicalTips": [
      "结合日常经验，检查选项是否明显偏大或偏小。"
    ],
    "protocols": {},
    "reportReading": {
      "version": "1.1.0",
      "title": "认知估算：回看这次作答",
      "introduction": "根据日常经验估计现实数量的合理量级。",
      "summary": {
        "template": "这次正式题的正确率为 {accuracy}；超时未答 {timeoutCount} 题。",
        "metricKeys": [
          "accuracy",
          "timeoutCount"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "timeoutCount"
      ],
      "processMetricKeys": [
        "medianRtMs",
        "validRtCount"
      ],
      "withholdFlags": [
        "interrupted"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "结合日常经验，检查选项是否明显偏大或偏小。 内部估算候选题；区间是粗粒度量级选项，不是临床容许范围或人口常模。本报告只描述项目自编36题试测中的数量级选择；一般知识、生活经验和文化背景影响表现，不据此判断临床状态、智商或同龄人排名。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "cogest",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "认知估算",
    "metrics": {
      "accuracy": {
        "label": "选中预设合理量级的比例",
        "explanation": "选中项目预设量级选项的题数除以已呈现正式题数；超时计入分母，0保留；不是人群常模。"
      },
      "medianRtMs": {
        "label": "答对时的典型用时（中位数）",
        "explanation": "仅纳入300毫秒至题目时限之间的正确、未中断作答；没有记录为null，不补成0。"
      },
      "errorCount": {
        "label": "选错题数"
      },
      "timeoutCount": {
        "label": "超时未答题数"
      },
      "validRtCount": {
        "label": "可用于用时统计的作答数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "singleHiddenMetrics": [],
    "disclaimer": "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。 只描述本次记录，不换算IQ、同龄排名或诊断。",
    "suppressTips": false,
    "practicalTips": [
      "先找一个熟悉的参照，再核对单位；估算不是精确计算，经验不同也会影响选择。",
      "把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。"
    ],
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "回看这次完成的18题；只描述本次表现。",
        "reportCaveats": [
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
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
          "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "Shallice与Evans（1978）研究要求对没有现成求解策略的问题给出合理估计；本项目是有提示范围的四选一、自编数量级材料与15秒限时，不是原文自由回答CET，也没有临床异常容许范围。",
        "reportCaveats": [
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      }
    },
    "reportReading": {
      "version": "3.0.0",
      "title": "这个数量，大概落在哪个范围？",
      "introduction": "不用精确背数字，先用生活中熟悉的物体和时间作参照，再选一个合理的数量级。报告只描述本次选中项目预设范围的比例。",
      "summary": {
        "template": "本次选中项目预设合理量级的比例为 {accuracy}；超时未答 {timeoutCount} 题。",
        "metricKeys": [
          "accuracy",
          "timeoutCount"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "timeoutCount"
      ],
      "processMetricKeys": [
        "medianRtMs",
        "validRtCount"
      ],
      "withholdFlags": [
        "interrupted"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先找一个熟悉的参照，再核对单位；估算不是精确计算，经验不同也会影响选择。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "本次18题中，选中预设合理量级的比例为 {accuracy}。这不是临床合理性阈值。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "hiddenByProfile": {
        "experience": []
      },
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "不用精确背数字，先用生活中熟悉的物体和时间作参照，再选一个合理的数量级。报告只描述本次选中项目预设范围的比例。",
        "exampleTitle": "生活里，也会用到这样的思路",
        "example": "估计一瓶水的容量，可以先想想日常水杯与饮料瓶；先排除明显大得或小得不合理的范围。",
        "takeaway": "先找一个熟悉的参照，再核对单位；估算不是精确计算，经验不同也会影响选择。",
        "boundary": "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
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
        "scene": "rules",
        "metricHelp": {
          "accuracy": {
            "label": "选中预设合理量级的比例",
            "explanation": "描述本次选择，不是人群百分位。"
          },
          "medianRtMs": {
            "label": "答对时的典型用时",
            "explanation": "中位数指合格用时排序后居中的值；缺失不补零。"
          }
        }
      },
      "professional": {
        "procedure": "项目自编中文四选一，36道正式题与1道独立练习；seed确定不重复18/30/36题，每题15秒、起始注视400ms，后续另有约200ms间隔。正式正确率以全部已呈现完整题序列为分母（超时进入分母）；错误与未答分开，合格正确反应统计用时，null不补0。 Shallice & Evans, The involvement of the frontal lobes in cognitive estimation (1978), DOI 10.1016/S0010-9452(78)80055-0: https://pubmed.ncbi.nlm.nih.gov/679710/",
        "interpretation": "Shallice与Evans（1978）研究要求对没有现成求解策略的问题给出合理估计；本项目是有提示范围的四选一、自编数量级材料与15秒限时，不是原文自由回答CET，也没有临床异常容许范围。",
        "confounders": [
          "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
          "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
          "模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。"
        ],
        "construct": "项目自编数量级估算",
        "configFields": [
          {
            "key": "totalTrials",
            "label": "正式题数"
          },
          {
            "key": "stimulusSetVersion",
            "label": "冻结题池"
          },
          {
            "key": "timeoutMs",
            "label": "每题时限（毫秒）"
          }
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "本次答对题数除以完整的正式题序列题数，超时进入分母。",
            "readingHint": "只读本次表现，不作为常模或稳定能力。"
          },
          "medianRtMs": {
            "definition": "符合本协议有效条件的正确用时中位数。",
            "readingHint": "没有合格记录时保留缺失，不以零替代。"
          }
        }
      }
    }
  }
]
