import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "arithverify",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "算术验证",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：全部正式试次中判断正确的比例；未回应也计入分母。",
        "singleExplanation": "总体正确率：全部正式试次中判断正确的比例；未回应也计入分母。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：纳入用时统计的正确试次中，从算式出现到选择对/错的典型时间。",
        "singleExplanation": "正确作答中位用时：纳入用时统计的正确试次中，从算式出现到选择对/错的典型时间。"
      },
      "problemSizeSlopeMs": {
        "label": "问题规模斜率",
        "explanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化；正值代表大数目的算式更费时。",
        "singleExplanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化。"
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
      "先算结果，再和给出的数比较；保持稳定节奏比抢快更重要。",
      "回想这次更常见的是算错、看错给出的结果，还是未及时作答；可先选几道简单算式，慢慢核对判断过程。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次加法等式验证的表现，不是数学能力、计算水平或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "这些算式，你判得又准又快吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，全部正式试次有 {accuracy} 判断正确；正确有效作答的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，全部正式试次有 {accuracy} 判断正确；未回应也计入分母。试次较少，先关注是否理解规则。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "problemSizeSlopeMs"
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
        ],
        "problemSizeSlopeMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先看正确率，再读正确作答用时。回想容易出错的是计算还是核对结果，下次可以先算出答案再比较；不要只为缩短用时而抢答。",
      "chart": {
        "kind": "metrics",
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
        "concept": "你需要读式子、心算结果、核对给出的数，再判断对错。任务记录整个判断过程的正确率和用时，不分别测量这些步骤；还会描述本次用时随两数之和的变化。",
        "takeaway": "熟练来自准确优先：先求对，再求快。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "核对小票金额、检查考勤天数、估算购物花费，都需要又快又准的加法判断。这只反映计算熟练度的一小部分，不代表数学能力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "读式子",
            "text": "看清两个加数和给出的结果。"
          },
          {
            "title": "算一算",
            "text": "在心里把两个数相加。"
          },
          {
            "title": "判对错",
            "text": "一致按对，不一致按错。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是考试排名、升学依据或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "纳入用时统计的正确试次中，从算式出现到作答的典型时间。"
          },
          "problemSizeSlopeMs": {
            "label": "数变大时慢多少",
            "explanation": "两数之和每增大 1，用时的平均变化；正值代表大算式更费时。"
          }
        }
      },
      "professional": {
        "construct": "加法等式验证的计算流畅度",
        "procedure": "逐试次呈现 a+b=c，服务端由操作数推导等式真伪；正确率与正确有效 RT（rtMs ≥ validRtFloorMs）为主要指标，问题规模斜率为正确有效 RT 对操作数之和的线性回归斜率。",
        "interpretation": "正确率过低时用时指标需谨慎解释；斜率为有符号量，受策略（精算/估算）与试次规模分布影响，不单独作为能力等级。",
        "confounders": [
          "设备与输入方式、显示延迟会影响用时记录。",
          "策略差异（直接提取 vs 逐位累加）改变用时结构。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：全部正式试次中判断（含真伪两个方向）正确的比例，错误和未回应均留在分母。",
            "readingHint": "配合有效 RT 数与质量标记阅读。"
          },
          "medianRtMs": {
            "definition": "正确有效反应（rtMs ≥ validRtFloorMs）的中位时间。",
            "readingHint": "与正确率同读；速度—准确率权衡会改变解释。"
          },
          "problemSizeSlopeMs": {
            "definition": "正确有效 RT 对 leftOperand+rightOperand 的 OLS 斜率；有效点或不同规模不足时为 null。",
            "readingHint": "有符号量；仅描述本次任务内用时随规模的变化趋势。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时正确率解释需谨慎。"
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
            "key": "operandMax",
            "label": "操作数上限"
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
    "testType": "arithverify",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "算式对不对",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：全部正式试次中判断正确的比例；未回应也计入分母。",
        "singleExplanation": "总体正确率：全部正式试次中判断正确的比例；未回应也计入分母。"
      },
      "medianRtMs": {
        "label": "答对时通常用多久",
        "explanation": "正确作答中位用时：纳入用时统计的正确试次中，从算式出现到选择对/错的典型时间。",
        "singleExplanation": "正确作答中位用时：纳入用时统计的正确试次中，从算式出现到选择对/错的典型时间。"
      },
      "problemSizeSlopeMs": {
        "label": "和变大时的用时趋势",
        "explanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化；正值代表大数目的算式更费时。",
        "singleExplanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "纳入用时统计的题数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次算式对不对的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "正式12题，真/假各6题，练习2题最多2轮；配置估计约2分钟（未实测）。只读正确比例、错误/超时与答对用时，不显示题目大小斜率。",
          "体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。"
        ]
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次算式对不对的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次算式对不对的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      }
    },
    "practicalTips": [
      "先把两个数相加，再与显示的结果比较。想比较自己的记录时，用同样的题量和数字范围，并让手指先熟悉按键。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "先算一算，再决定对或错",
      "introduction": "给加法算式当一次小检查员：不只看结果眼熟不眼熟，先心算，再判断写出的答案对不对。",
      "summary": {
        "template": "这一次，全部正式试次有 {accuracy} 判断正确；正确有效作答的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次简短体验中，全部正式试次有 {accuracy} 判断正确；未回应也计入分母。试次较少，先关注是否理解规则。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "problemSizeSlopeMs"
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
        ],
        "problemSizeSlopeMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先把两个数相加，再与显示的结果比较。想比较自己的记录时，用同样的题量和数字范围，并让手指先熟悉按键。",
      "chart": {
        "kind": "metrics",
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
        "concept": "记录你这次判断加法真假的正确比例，以及答对时通常用多久。学校所学、练习经历、当前疲劳与按键熟练程度都会影响记录。",
        "takeaway": "做得快要和答得对一起看。短体验没有足够题目说明“数字变大时慢多少”，因此不展示这个趋势指标。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "核对小票上两件商品的合计数时，也需要先求和再比较。这里是理解任务的例子，不能用这次小游戏判定全部数学水平。",
        "scene": "rules",
        "frames": [
          {
            "title": "读式子",
            "text": "看清两个加数和给出的结果。"
          },
          {
            "title": "算一算",
            "text": "在心里把两个数相加。"
          },
          {
            "title": "判对错",
            "text": "一致按对，不一致按错。"
          }
        ],
        "boundary": "体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。",
        "metricHelp": {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "答对时通常用多久",
            "explanation": "纳入用时统计的正确试次中，从算式出现到作答的典型时间。"
          },
          "problemSizeSlopeMs": {
            "label": "和变大时的用时趋势",
            "explanation": "两数之和每增大 1，用时的平均变化；正值代表大算式更费时。"
          },
          "validRtCount": {
            "label": "纳入用时统计的题数",
            "explanation": "纳入用时统计的题数"
          }
        }
      },
      "professional": {
        "construct": "加法等式验证的计算流畅度",
        "procedure": "逐试次呈现 a+b=c，服务端由操作数推导等式真伪；正确率与正确有效 RT（rtMs ≥ validRtFloorMs）为主要指标，问题规模斜率为正确有效 RT 对操作数之和的线性回归斜率。 方法与文献核对：研究档60题，真/假各30题，加数1–10，假结果偏离正确和±1/2/3且不低于0；500毫秒准备，后续另加300毫秒，响应窗6秒。Ashcraft与Battaglia(1978), DOI 10.1037/0278-7393.4.5.527的原作者上传摘要支持真/假验证与错和偏离量影响用时；其合理/不合理错和操纵与本项目不同。本项目不分组平衡那些原条件，不能解释为原实验复刻；未核全文题量/练习。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。",
        "confounders": [
          "设备与输入方式、显示延迟会影响用时记录。",
          "策略差异（直接提取 vs 逐位累加）改变用时结构。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：全部正式试次中判断（含真伪两个方向）正确的比例，错误和未回应均留在分母。",
            "readingHint": "配合有效 RT 数与质量标记阅读。"
          },
          "medianRtMs": {
            "definition": "正确有效反应（rtMs ≥ validRtFloorMs）的中位时间。",
            "readingHint": "与正确率同读；速度—准确率权衡会改变解释。"
          },
          "problemSizeSlopeMs": {
            "definition": "正确有效 RT 对 leftOperand+rightOperand 的 OLS 斜率；有效点或不同规模不足时为 null。",
            "readingHint": "有符号量；仅描述本次任务内用时随规模的变化趋势。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时正确率解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式题数/轮数"
          },
          {
            "key": "operandMax",
            "label": "最大加数"
          },
          {
            "key": "trueRatio",
            "label": "真算式比例"
          },
          {
            "key": "fixationMs",
            "label": "准备注视时长（毫秒）"
          },
          {
            "key": "timeoutMs",
            "label": "每题响应上限（毫秒）"
          },
          {
            "key": "validRtFloorMs",
            "label": "纳入用时统计的最短时间（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": [
          "problemSizeSlopeMs"
        ]
      }
    }
  }
]
