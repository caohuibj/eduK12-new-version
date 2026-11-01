import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "delaydiscount",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "延迟满足选择",
    "metrics": {
      "aucDelayDiscounting": {
        "label": "折扣曲线下面积",
        "explanation": "折扣曲线下面积（AUC）：把每个延迟下的“心理等价点”连成曲线后下方的面积，越接近 1 表示越愿意等待。",
        "singleExplanation": "折扣曲线下面积（AUC）：每个延迟下心理等价点连线下方的面积，越接近 1 越愿意等待。"
      },
      "meanIndifferenceRate": {
        "label": "平均无差异点",
        "explanation": "平均无差异点：各延迟下，你觉得“现在拿多少”与“延后拿全额”差不多的比例，越接近 1 越愿意等待。",
        "singleExplanation": "平均无差异点：各延迟下心理等价金额占全额的比例。"
      },
      "laterChoiceRate": {
        "label": "选延后奖赏比例",
        "explanation": "选延后奖赏比例：有效选择中选“延后拿更多”的比例，不含超时未答。",
        "singleExplanation": "选延后奖赏比例：有效选择中选“延后拿更多”的比例，不含超时未答。"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validTrialCount": {
        "label": "有效选择数"
      }
    },
    "experienceHeadline": "aucDelayDiscounting",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "没有标准答案：可以回想，金额和等待时间分别怎样影响了你的选择。",
      "想一想等待是否值得，不要因为想“表现好”而刻意选某一边。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次跨期选择的表现，不是性格、自控力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "等待，对你值多少？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的折扣曲线下面积是 {aucDelayDiscounting}；其中 {laterChoiceRate} 的选择给了延后的大奖励。",
        "metricKeys": [
          "aucDelayDiscounting",
          "laterChoiceRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你 {laterChoiceRate} 的选择给了延后的大奖励；体验版的无差异点估计较粗。",
          "metricKeys": [
            "laterChoiceRate"
          ]
        }
      },
      "studentMetricKeys": [
        "aucDelayDiscounting",
        "laterChoiceRate",
        "meanIndifferenceRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteDelayBand"
      ],
      "metricGates": {
        "aucDelayDiscounting": [
          "incompleteDelayBand"
        ],
        "meanIndifferenceRate": [
          "incompleteDelayBand"
        ]
      },
      "nextStep": "先看 AUC 是否完整可算，再读各延迟下的等价点；这不是“自控力分数”，只是一次权衡记录。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "meanIndifferenceRate",
          "laterChoiceRate"
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
        "concept": "“现在立刻拿 50”和“30 天后拿 100”，你会怎么选？任务会一步步调整“现在”的金额，找出对你来说两边差不多等值的那个点——它在不同等待时间下怎么变化，就是这次要看的权衡过程。",
        "takeaway": "等待值不值，取决于金额、时间和当时的你；这里只记录其中一次。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "零花钱是马上买小零食，还是攒几周买想要已久的东西，都涉及同样的权衡。这是很普通的决策偏好，没有好坏，也不代表你的性格或自控力等级。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看两个选项",
            "text": "一边是现在的小额，一边是延后的大额。"
          },
          {
            "title": "做选择",
            "text": "按你的真实偏好选，金额会跟着调整。"
          },
          {
            "title": "看等值点",
            "text": "多轮之后得到每个延迟下的心理等价点。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、消费建议或同龄人排名。",
        "metricHelp": {
          "aucDelayDiscounting": {
            "label": "等待在你心里的分量",
            "explanation": "各延迟等价点连线的下方面积，越接近 1 越愿意等待。"
          },
          "laterChoiceRate": {
            "label": "选等待的比例",
            "explanation": "有效选择中选“延后拿更多”的比例，不含超时未答。"
          },
          "meanIndifferenceRate": {
            "label": "平均等价点",
            "explanation": "你觉得两边差不多的金额，占全额的比例。"
          }
        }
      },
      "professional": {
        "construct": "即时与延后奖赏的跨期权衡（延迟折扣）",
        "procedure": "固定延后全额与延迟带，按二分法逐试次调整即时金额；每带的无差异点为最终上下界中点，AUC 以延迟天数/maxDelay 归一化后按梯形法求和（Myerson et al. 2001）。",
        "interpretation": "AUC 越高表示对延后奖赏的折扣越浅；超时使所在带不完整时 AUC 撤下。轨迹由服务端按二分规则复核，违背轨迹的提交直接拒绝。",
        "confounders": [
          "点数/虚拟奖励与真实激励的折扣率可能不同。",
          "作答中断、超时和延迟带数量影响 AUC 的可计算性。",
          "本报告不提供经过验证的人口常模、诊断、稳定性格或自控力等级结论。"
        ],
        "metricNotes": {
          "aucDelayDiscounting": {
            "definition": "各完整延迟带无差异点（比例）对归一化延迟的梯形面积和，范围约 0..1。",
            "readingHint": "仅当全部延迟带完整时计算；越高越愿意等待，不构成性格判断。"
          },
          "meanIndifferenceRate": {
            "definition": "完整延迟带无差异点比例的算术平均。",
            "readingHint": "与 AUC 同读；对延迟分布敏感。"
          },
          "laterChoiceRate": {
            "definition": "有效选择中选延后奖赏的比例。",
            "readingHint": "描述性比例，受金额范围影响。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时带不进入 AUC。"
          },
          "validTrialCount": {
            "definition": "按本次冻结任务定义记录“有效选择数”。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "delayBands",
            "label": "延迟带（天）"
          },
          {
            "key": "delayedAmount",
            "label": "延后全额"
          },
          {
            "key": "bisectionSteps",
            "label": "每带二分步数"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "delaydiscount",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "现在拿，还是以后拿",
    "metrics": {
      "aucDelayDiscounting": {
        "label": "等待曲线面积（方法附注）",
        "explanation": "用7至90天的归一化点做梯形积分；不补0天锚点，不是自控力分数。",
        "singleExplanation": "用7至90天的归一化点做梯形积分；不补0天锚点，不是自控力分数。"
      },
      "meanIndifferenceRate": {
        "label": "选择转变位置的平均比例",
        "explanation": "由完整二分轨迹估计；任一等待带缺答时不提供，不是实际货币价值。",
        "singleExplanation": "由完整二分轨迹估计；任一等待带缺答时不提供，不是实际货币价值。"
      },
      "laterChoiceRate": {
        "label": "选择以后领取的比例",
        "explanation": "分母只含明确选择现在或以后的轮次，不包含超时。",
        "singleExplanation": "分母只含明确选择现在或以后的轮次，不包含超时。"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validTrialCount": {
        "label": "有效选择数"
      }
    },
    "experienceHeadline": "laterChoiceRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "每轮在现在较少点数和以后100点之间选择。后续金额会随选择调整，用来粗略描绘这次选择转变的位置。",
        "reportCaveats": [
          "本次正式任务共9次跨期选择。另有1次练习。",
          "体验约1–3分钟；研究约2–6分钟（流程估计，非实测）。",
          "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
          "借鉴 Richards 等1999的调整金额方法，改为100虚拟点数、7/30/90天与固定二分步数。曲线面积只在7–90天归一化点间做梯形积分，不补0天锚点，不等同所有文献AUC实现；任一等待带缺答时AUC和无差异点均不提供。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "每轮在现在较少点数和以后100点之间选择。后续金额会随选择调整，用来粗略描绘这次选择转变的位置。",
        "reportCaveats": [
          "本次正式任务共15次跨期选择。另有1次练习。",
          "体验约1–3分钟；研究约2–6分钟（流程估计，非实测）。",
          "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
          "借鉴 Richards 等1999的调整金额方法，改为100虚拟点数、7/30/90天与固定二分步数。曲线面积只在7–90天归一化点间做梯形积分，不补0天锚点，不等同所有文献AUC实现；任一等待带缺答时AUC和无差异点均不提供。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "每轮在现在较少点数和以后100点之间选择。后续金额会随选择调整，用来粗略描绘这次选择转变的位置。",
        "reportCaveats": [
          "本次正式任务共21次跨期选择。另有1次练习。",
          "体验约1–3分钟；研究约2–6分钟（流程估计，非实测）。",
          "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
          "借鉴 Richards 等1999的调整金额方法，改为100虚拟点数、7/30/90天与固定二分步数。曲线面积只在7–90天归一化点间做梯形积分，不补0天锚点，不等同所有文献AUC实现；任一等待带缺答时AUC和无差异点均不提供。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "不必追求某个比例；可以想想自己选择时更在意等待时间、当下用途，还是未来点数是否确定。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
    "reportReading": {
      "version": "3.0.0",
      "title": "现在少一点，还是等几天多一点？",
      "introduction": "每轮在现在较少点数和以后100点之间选择。后续金额会随选择调整，用来粗略描绘这次选择转变的位置。",
      "summary": {
        "template": "已明确作答 {validTrialCount} 次，其中选择以后领取的比例为 {laterChoiceRate}；超时 {timeoutCount} 次。",
        "metricKeys": [
          "laterChoiceRate",
          "validTrialCount",
          "timeoutCount"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "已明确作答 {validTrialCount} 次，其中选择以后领取的比例为 {laterChoiceRate}；超时 {timeoutCount} 次。",
          "metricKeys": [
            "laterChoiceRate",
            "validTrialCount",
            "timeoutCount"
          ]
        }
      },
      "studentMetricKeys": [
        "laterChoiceRate",
        "validTrialCount",
        "timeoutCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteDelayBand"
      ],
      "metricGates": {
        "aucDelayDiscounting": [
          "incompleteDelayBand"
        ],
        "meanIndifferenceRate": [
          "incompleteDelayBand"
        ]
      },
      "nextStep": "不必追求某个比例；可以想想自己选择时更在意等待时间、当下用途，还是未来点数是否确定。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "laterChoiceRate"
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
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "每轮在现在较少点数和以后100点之间选择。后续金额会随选择调整，用来粗略描绘这次选择转变的位置。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "想象立即拿到一张小额游戏券，或过几天拿到更大一张。等待成本、用途和是否相信会兑现，都会改变决定。",
        "scene": "sequence",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "9 / 15 / 21次；7、30、90天各3 / 5 / 7次自适应二分；另有1次练习。"
          },
          {
            "title": "大概需要多久",
            "text": "体验约1–3分钟；研究约2–6分钟。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "不必追求某个比例；可以想想自己选择时更在意等待时间、当下用途，还是未来点数是否确定。"
          }
        ],
        "boundary": "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
        "metricHelp": {
          "laterChoiceRate": {
            "label": "选择以后领取的比例",
            "explanation": "分母只含明确选择现在或以后的轮次，不包含超时。"
          },
          "validTrialCount": {
            "label": "有效选择数",
            "explanation": "只描述本次记录。"
          },
          "timeoutCount": {
            "label": "超时次数",
            "explanation": "只描述本次记录。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "9 / 15 / 21次；7、30、90天各3 / 5 / 7次自适应二分；另有1次练习。 借鉴 Richards 等1999的调整金额方法，改为100虚拟点数、7/30/90天与固定二分步数。曲线面积只在7–90天归一化点间做梯形积分，不补0天锚点，不等同所有文献AUC实现；任一等待带缺答时AUC和无差异点均不提供。",
        "interpretation": "这些是虚拟点数，三个等待时间只代表本任务设置。短体验每个时间只有3次选择，不能判断自控力，也不能代替真实消费决定。",
        "confounders": [
          "点数/虚拟奖励与真实激励的折扣率可能不同。",
          "作答中断、超时和延迟带数量影响 AUC 的可计算性。",
          "本报告不提供经过验证的人口常模、诊断、稳定性格或自控力等级结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "aucDelayDiscounting": {
            "definition": "用7至90天的归一化点做梯形积分；不补0天锚点，不是自控力分数。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "meanIndifferenceRate": {
            "definition": "由完整二分轨迹估计；任一等待带缺答时不提供，不是实际货币价值。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "laterChoiceRate": {
            "definition": "分母只含明确选择现在或以后的轮次，不包含超时。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时带不进入 AUC。"
          },
          "validTrialCount": {
            "definition": "按本次冻结任务定义记录“有效选择数”。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "delayBands",
            "label": "延迟带（天）"
          },
          {
            "key": "delayedAmount",
            "label": "延后全额"
          },
          {
            "key": "bisectionSteps",
            "label": "每带二分步数"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": [
          "aucDelayDiscounting",
          "meanIndifferenceRate"
        ]
      },
      "qualityLabels": {
        "incompleteDelayBand": "部分等待时间的选择未答完整"
      }
    }
  }
]
