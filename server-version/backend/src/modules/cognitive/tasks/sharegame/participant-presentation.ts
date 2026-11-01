import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "sharegame",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "分享决策",
    "metrics": {
      "givingRate": {
        "label": "给出比例",
        "explanation": "给出比例：全部轮次中，分给同伴的点数占总额的比例。",
        "singleExplanation": "给出比例：分给同伴的点数占总额的比例。"
      },
      "equalSplitCount": {
        "label": "对半分轮数",
        "explanation": "对半分轮数：你选择正好对半分的轮次数。",
        "singleExplanation": "对半分轮数：选择正好对半分的轮次数。"
      },
      "generousRate": {
        "label": "对半及以上比例",
        "explanation": "对半及以上比例：分出一半或更多的轮次占比。",
        "singleExplanation": "对半及以上比例：分出一半或更多的轮次占比。"
      },
      "givingRateSd": {
        "label": "给出比例波动",
        "explanation": "给出比例波动：各轮给出比例的标准差，越小越一致。",
        "singleExplanation": "给出比例波动：各轮给出比例的差异程度。"
      },
      "medianDecisionMs": {
        "label": "决策用时中位数"
      }
    },
    "experienceHeadline": "givingRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "没有对错：按你真实的分配习惯选择即可。",
      "不同轮次的金额不同，先看清楚本轮总额。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次分享决策的选择分布，是偏好描述而非品德、人格或能力判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "一笔可以自由分配的点数，你会怎么分？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你平均分出 {givingRate}；其中 {generousRate} 的轮次给了一半或更多。",
        "metricKeys": [
          "givingRate",
          "generousRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你平均分出 {givingRate}；体验版轮次少，只作演示。",
          "metricKeys": [
            "givingRate"
          ]
        }
      },
      "studentMetricKeys": [
        "givingRate",
        "generousRate",
        "equalSplitCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "先看给出比例，再结合波动幅度理解一致性；这是偏好记录，没有好坏评分。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "givingRate",
          "generousRate"
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
        "concept": "每轮你拿到一笔点数，可以完全自留，也可以分一部分给一位看不到名字的同伴——对方无法回报你。你怎么分，就是这次想记录的分配偏好。",
        "takeaway": "分享没有标准答案，一致性比数字更重要。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "班费分摊、小组分工的利益分配、抽奖后与朋友分享奖品，都涉及自由分配。这里只是把这种选择放在了一个小场景里，不代表你的品德或人缘。",
        "scene": "rules",
        "frames": [
          {
            "title": "看本轮总额",
            "text": "每轮的总额可能不同。"
          },
          {
            "title": "做分配",
            "text": "决定给同伴多少、自己留多少。"
          },
          {
            "title": "看分布",
            "text": "多轮选择汇成分配偏好记录。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是品德评价、人格测验或同龄人排名。",
        "metricHelp": {
          "givingRate": {
            "label": "平均分出多少",
            "explanation": "分给同伴的点数占总额的比例。"
          },
          "generousRate": {
            "label": "给一半以上的轮次",
            "explanation": "分出一半或更多的轮次占比。"
          },
          "equalSplitCount": {
            "label": "对半分的轮数",
            "explanation": "选择正好对半分的轮次数。"
          },
          "givingRateSd": {
            "label": "选择是否一致",
            "explanation": "各轮给出比例的标准差；越小越一致。"
          }
        }
      },
      "professional": {
        "construct": "无回报情境下的分配偏好（独裁者式）",
        "procedure": "每轮禀赋随 config 冻结，参与者从五个预设档位（0、1/4、1/2、3/4、全部）中选择分给同伴的份额；给出比例为总给出点数/总禀赋；一致性为各轮给出比例的标准差。",
        "interpretation": "全部指标为描述性偏好量；档位颗粒度限制给出量的分辨率；本任务不设能力分数，不做品德或人格推断。",
        "confounders": [
          "点数/虚拟资源与真实资源下的分享偏好可能不同。",
          "预设档位限制分配粒度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。"
        ],
        "metricNotes": {
          "givingRate": {
            "definition": "总给出点数 / 总禀赋。",
            "readingHint": "描述性偏好量，无好坏方向。"
          },
          "equalSplitCount": {
            "definition": "给出点数恰好为一半的轮次数。",
            "readingHint": "对半分是常见的公平规范锚点。"
          },
          "generousRate": {
            "definition": "给出比例 ≥ 0.5 的轮次占比。",
            "readingHint": "与 givingRate 同读。"
          },
          "givingRateSd": {
            "definition": "各轮给出比例的标准差；单轮时为 0。",
            "readingHint": "越小越一致；受轮次数影响。"
          },
          "medianDecisionMs": {
            "definition": "各轮决策用时的中位数。",
            "readingHint": "仅作描述。"
          }
        },
        "configFields": [
          {
            "key": "endowments",
            "label": "各轮禀赋"
          },
          {
            "key": "timeoutMs",
            "label": "单轮时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "2.0.0",
    "testType": "sharegame",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "title": "分享决策",
    "metrics": {
      "givingRate": {
        "label": "给出比例",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "equalSplitCount": {
        "label": "对半分轮数",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "generousRate": {
        "label": "对半及以上比例",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "givingRateSd": {
        "label": "给出比例波动",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "medianDecisionMs": {
        "label": "决策用时中位数",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "plannedRounds": {
        "label": "计划轮数",
        "explanation": "计划轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "answeredRounds": {
        "label": "有效选择轮数",
        "explanation": "有效选择轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "timeoutRounds": {
        "label": "超时未答轮数",
        "explanation": "超时未答轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "omittedRounds": {
        "label": "未响应轮数",
        "explanation": "未响应轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "zeroChoiceCount": {
        "label": "明确选择零轮数",
        "explanation": "明确选择零轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "responseRate": {
        "label": "有效选择覆盖率",
        "explanation": "有效选择覆盖率；零选择属于有效回答，未答不属于零选择。"
      },
      "answeredEndowment": {
        "label": "有效轮次点数总额",
        "explanation": "有效轮次点数总额；零选择属于有效回答，未答不属于零选择。"
      }
    },
    "experienceHeadline": "givingRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "未答不补零；先看有效轮次和覆盖率，再看分配比例。",
      "如想重新体验，请另开一次；不会改写本次冻结结果。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "本次有效选择的描述性结果，无已验证常模，不作人格、品德或能力判断。",
    "reportReading": {
      "version": "2.0.0",
      "title": "一笔可以自由分配的点数，你会怎么分？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "本次有效选择覆盖率为 {responseRate}。在有效选择的点数总额中，分给同伴的比例为 {givingRate}。未答不视为选择零。",
        "metricKeys": [
          "responseRate",
          "givingRate"
        ]
      },
      "summaryByProfile": {},
      "studentMetricKeys": [
        "givingRate",
        "generousRate",
        "equalSplitCount"
      ],
      "processMetricKeys": [
        "plannedRounds",
        "answeredRounds",
        "timeoutRounds",
        "omittedRounds",
        "zeroChoiceCount",
        "answeredEndowment"
      ],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "先查看有效轮次与未答数，再理解本次选择。可在安静环境另开一次体验；不据此判断品德或人格。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "givingRate",
          "generousRate"
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
        "concept": "每轮你拿到一笔点数，可以完全自留，也可以分一部分给一位看不到名字的同伴——对方无法回报你。你怎么分，就是这次想记录的分配偏好。",
        "takeaway": "分享没有标准答案，一致性比数字更重要。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "班费分摊、小组分工的利益分配、抽奖后与朋友分享奖品，都涉及自由分配。这里只是把这种选择放在了一个小场景里，不代表你的品德或人缘。",
        "scene": "rules",
        "frames": [
          {
            "title": "看本轮总额",
            "text": "每轮的总额可能不同。"
          },
          {
            "title": "做分配",
            "text": "决定给同伴多少、自己留多少。"
          },
          {
            "title": "看分布",
            "text": "多轮选择汇成分配偏好记录。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是品德评价、人格测验或同龄人排名。",
        "metricHelp": {
          "givingRate": {
            "label": "平均分出多少",
            "explanation": "分给同伴的点数占总额的比例。"
          },
          "generousRate": {
            "label": "给一半以上的轮次",
            "explanation": "分出一半或更多的轮次占比。"
          },
          "equalSplitCount": {
            "label": "对半分的轮数",
            "explanation": "选择正好对半分的轮次数。"
          },
          "givingRateSd": {
            "label": "选择是否一致",
            "explanation": "各轮给出比例的标准差；越小越一致。"
          }
        }
      },
      "professional": {
        "construct": "无回报情境下的分配偏好（独裁者式）",
        "procedure": "每轮点数随配置冻结，从五个档位中明确选择分给同伴的份额。choice包含真实零；timeout/omitted不参与偏好指标分母。给出比例为有效选择给出总额/有效选择点数总额；覆盖率为有效选择轮数/计划轮数。",
        "interpretation": "全部指标为描述性偏好量；档位颗粒度限制给出量的分辨率；本任务不设能力分数，不做品德或人格推断。",
        "confounders": [
          "点数/虚拟资源与真实资源下的分享偏好可能不同。",
          "预设档位限制分配粒度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。"
        ],
        "metricNotes": {
          "givingRate": {
            "definition": "有效choice的given总和 / 有效choice的endowment总和；真实零包含在分母，超时与未答排除。全未答为null。",
            "readingHint": "先看覆盖率与有效轮数；不作人格或品德评价。"
          },
          "equalSplitCount": {
            "definition": "给出点数恰好为一半的轮次数。",
            "readingHint": "对半分是常见的公平规范锚点。"
          },
          "generousRate": {
            "definition": "有效choice中给出比例≥0.5的轮数 / 有效choice轮数；全未答为null。",
            "readingHint": "未答不补零，不与不同有效覆盖率直接比较。"
          },
          "givingRateSd": {
            "definition": "有效choice的各轮给出比例总体标准差；一轮为0，全未答为null。",
            "readingHint": "有效轮次少时，不据此推断稳定偏好。"
          },
          "medianDecisionMs": {
            "definition": "仅有效choice的rtMs中位数；全未答为null。",
            "readingHint": "超时与未答不进入决策用时。"
          }
        },
        "configFields": [
          {
            "key": "endowments",
            "label": "各轮禀赋"
          },
          {
            "key": "timeoutMs",
            "label": "单轮时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "sharegame",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "title": "模拟分享：这次你怎么分",
    "metrics": {
      "givingRate": {
        "label": "有效点数中的分出比例",
        "explanation": "明确选择的分出点数之和/这些轮次总额之和；按点数加权，未答轮均不进分子分母；全未答为缺失。",
        "singleExplanation": "明确选择的分出点数之和/这些轮次总额之和；按点数加权，未答轮均不进分子分母；全未答为缺失。"
      },
      "equalSplitCount": {
        "label": "对半分轮数",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "generousRate": {
        "label": "明确选择中分出至少一半的比例",
        "explanation": "分母是明确选择轮数，不是计划轮数，也不是道德评价。",
        "singleExplanation": "分母是明确选择轮数，不是计划轮数，也不是道德评价。"
      },
      "givingRateSd": {
        "label": "给出比例波动",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "medianDecisionMs": {
        "label": "决策用时中位数",
        "explanation": "仅依据有效选择轮次计算；未答、超时不进入分母或决策用时。",
        "singleExplanation": "仅依据有效选择轮次计算；未答不补零。"
      },
      "plannedRounds": {
        "label": "计划轮数",
        "explanation": "计划轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "answeredRounds": {
        "label": "有效选择轮数",
        "explanation": "有效选择轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "timeoutRounds": {
        "label": "超时未答轮数",
        "explanation": "超时未答轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "omittedRounds": {
        "label": "未响应轮数",
        "explanation": "未响应轮数；零选择属于有效回答，未答不属于零选择。"
      },
      "zeroChoiceCount": {
        "label": "明确选择分出零的轮数",
        "explanation": "必须实际点击零方案；与超时、其他未答分别记录。",
        "singleExplanation": "必须实际点击零方案；与超时、其他未答分别记录。"
      },
      "responseRate": {
        "label": "有效选择覆盖率",
        "explanation": "有效选择覆盖率；零选择属于有效回答，未答不属于零选择。"
      },
      "answeredEndowment": {
        "label": "有效轮次点数总额",
        "explanation": "有效轮次点数总额；零选择属于有效回答，未答不属于零选择。"
      }
    },
    "experienceHeadline": "givingRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "从五个比例中选一个分配方案；对方是模拟对象，没有真人收款。这里记录这一次的选择分布，没有正确答案。",
        "reportCaveats": [
          "本次正式任务共3轮模拟分享。另有1轮练习。",
          "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
          "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
          "与独裁者分配范式有关。Forsythe 等1994比较真实报酬和无报酬条件，其差异提示不能直接外推；本版虚拟点数、无真人伙伴、五档离散比例及重复总额，不是原双人实验复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "从五个比例中选一个分配方案；对方是模拟对象，没有真人收款。这里记录这一次的选择分布，没有正确答案。",
        "reportCaveats": [
          "本次正式任务共5轮模拟分享。另有1轮练习。",
          "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
          "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
          "与独裁者分配范式有关。Forsythe 等1994比较真实报酬和无报酬条件，其差异提示不能直接外推；本版虚拟点数、无真人伙伴、五档离散比例及重复总额，不是原双人实验复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "从五个比例中选一个分配方案；对方是模拟对象，没有真人收款。这里记录这一次的选择分布，没有正确答案。",
        "reportCaveats": [
          "本次正式任务共8轮模拟分享。另有1轮练习。",
          "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
          "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
          "与独裁者分配范式有关。Forsythe 等1994比较真实报酬和无报酬条件，其差异提示不能直接外推；本版虚拟点数、无真人伙伴、五档离散比例及重复总额，不是原双人实验复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "先看有效作答和未答轮数，再看分出比例；可以回想不同总额是否影响了你的决定，无需追求某个数值。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
    "reportReading": {
      "version": "3.0.0",
      "title": "一笔虚拟点数，你想留多少、分多少？",
      "introduction": "从五个比例中选一个分配方案；对方是模拟对象，没有真人收款。这里记录这一次的选择分布，没有正确答案。",
      "summary": {
        "template": "明确选择 {answeredRounds} 轮，其中选择分出零 {zeroChoiceCount} 轮；超时 {timeoutRounds} 轮、其他未答 {omittedRounds} 轮；有效选择点数中的分出比例为 {givingRate}。",
        "metricKeys": [
          "givingRate",
          "answeredRounds",
          "zeroChoiceCount",
          "timeoutRounds",
          "omittedRounds"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "明确选择 {answeredRounds} 轮，其中选择分出零 {zeroChoiceCount} 轮；超时 {timeoutRounds} 轮、其他未答 {omittedRounds} 轮；有效选择点数中的分出比例为 {givingRate}。",
          "metricKeys": [
            "givingRate",
            "answeredRounds",
            "zeroChoiceCount",
            "timeoutRounds",
            "omittedRounds"
          ]
        }
      },
      "studentMetricKeys": [
        "givingRate",
        "answeredRounds",
        "zeroChoiceCount",
        "timeoutRounds",
        "omittedRounds"
      ],
      "processMetricKeys": [
        "plannedRounds",
        "answeredRounds",
        "timeoutRounds",
        "omittedRounds",
        "zeroChoiceCount",
        "answeredEndowment"
      ],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "先看有效作答和未答轮数，再看分出比例；可以回想不同总额是否影响了你的决定，无需追求某个数值。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "givingRate"
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
        "concept": "从五个比例中选一个分配方案；对方是模拟对象，没有真人收款。这里记录这一次的选择分布，没有正确答案。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "分一袋小零食时，可能留着自己吃，也可能拿出一部分。真实分享还受关系、需求和情境影响，虚拟点数不能代替这些因素。",
        "scene": "rules",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "3 / 5 / 8轮；总额20、50或100点，五档比例；每轮最多20秒；另有1轮练习。"
          },
          {
            "title": "大概需要多久",
            "text": "体验约1–2分钟；研究约2–4分钟。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "先看有效作答和未答轮数，再看分出比例；可以回想不同总额是否影响了你的决定，无需追求某个数值。"
          }
        ],
        "boundary": "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
        "metricHelp": {
          "givingRate": {
            "label": "有效点数中的分出比例",
            "explanation": "明确选择的分出点数之和/这些轮次总额之和；按点数加权，未答轮均不进分子分母；全未答为缺失。"
          },
          "answeredRounds": {
            "label": "有效选择轮数",
            "explanation": "有效选择轮数；零选择属于有效回答，未答不属于零选择。"
          },
          "zeroChoiceCount": {
            "label": "明确选择分出零的轮数",
            "explanation": "必须实际点击零方案；与超时、其他未答分别记录。"
          },
          "timeoutRounds": {
            "label": "超时未答轮数",
            "explanation": "超时未答轮数；零选择属于有效回答，未答不属于零选择。"
          },
          "omittedRounds": {
            "label": "未响应轮数",
            "explanation": "未响应轮数；零选择属于有效回答，未答不属于零选择。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "3 / 5 / 8轮；总额20、50或100点，五档比例；每轮最多20秒；另有1轮练习。 与独裁者分配范式有关。Forsythe 等1994比较真实报酬和无报酬条件，其差异提示不能直接外推；本版虚拟点数、无真人伙伴、五档离散比例及重复总额，不是原双人实验复刻。",
        "interpretation": "体验3轮的比例会随一次选择明显变化。结果不测善良、慷慨人格或社交能力；超时与未答均不是选择分出零。",
        "confounders": [
          "点数/虚拟资源与真实资源下的分享偏好可能不同。",
          "预设档位限制分配粒度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "givingRate": {
            "definition": "明确选择的分出点数之和/这些轮次总额之和；按点数加权，未答轮均不进分子分母；全未答为缺失。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "equalSplitCount": {
            "definition": "给出点数恰好为一半的轮次数。",
            "readingHint": "对半分是常见的公平规范锚点。"
          },
          "generousRate": {
            "definition": "分母是明确选择轮数，不是计划轮数，也不是道德评价。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "givingRateSd": {
            "definition": "有效choice的各轮给出比例总体标准差；一轮为0，全未答为null。",
            "readingHint": "有效轮次少时，不据此推断稳定偏好。"
          },
          "medianDecisionMs": {
            "definition": "仅有效choice的rtMs中位数；全未答为null。",
            "readingHint": "超时与未答不进入决策用时。"
          },
          "zeroChoiceCount": {
            "definition": "必须实际点击零方案；与超时、其他未答分别记录。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          }
        },
        "configFields": [
          {
            "key": "endowments",
            "label": "各轮禀赋"
          },
          {
            "key": "timeoutMs",
            "label": "单轮时限（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": [
          "givingRateSd"
        ]
      }
    }
  }
]
