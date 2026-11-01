import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "cancellation",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "视觉划消",
    "metrics": {
      "hitRate": {
        "label": "命中率",
        "explanation": "命中率：所有目标符号中被你成功点亮的比例。",
        "singleExplanation": "命中率：所有目标符号中被你成功点亮的比例。"
      },
      "falseAlarmRate": {
        "label": "误报比例",
        "explanation": "误报比例：可计分轮次中，你点亮的格子里不是目标的占比。它也受符号辨识、点击精度和搜索策略影响，不能据此判断是否心急；没有选中格子时此值缺失。",
        "singleExplanation": "误报比例：点亮的格子里不是目标的占比。"
      },
      "hitCount": {
        "label": "命中数"
      },
      "missCount": {
        "label": "漏报数"
      },
      "falseAlarmCount": {
        "label": "误报数"
      }
    },
    "experienceHeadline": "hitRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "按行从左到右扫，比乱找更快更稳。",
      "不确定的格子不要乱点，误报会拉低分数。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次视觉划消表现，不是注意力诊断、临床状态或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "限时扫一遍，你能逮住多少目标？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你逮住了 {hitRate} 的目标；误报比例 {falseAlarmRate}。",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你逮住了 {hitRate} 的目标；体验版仅 1 轮，仅供体验。",
          "metricKeys": [
            "hitRate"
          ]
        }
      },
      "studentMetricKeys": [
        "hitRate",
        "falseAlarmRate",
        "missCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "excessiveFalseAlarms"
      ],
      "metricGates": {},
      "nextStep": "先对照命中与误报，再回想搜索方式和点击是否顺手。这是本次限时任务的记录，不能单独判断注意力或学习能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "一格一格的符号墙里藏着若干目标符号。限时内把目标全部点亮——尽量找全目标，也留意是否点到了相似符号。这里看的是你的视觉搜索：注意像手电筒，怎么扫、扫得准不准。",
        "takeaway": "按行扫描，又快又准。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "在货架上找特定商品、在表格里核对数据、在地图上找路标，都是视觉搜索。它只是注意力的一小部分，不代表你的专注力或学习能力全貌。",
        "scene": "signal",
        "frames": [
          {
            "title": "记目标",
            "text": "看清楚本轮要找的符号。"
          },
          {
            "title": "按行扫",
            "text": "从左到右、一行一行扫过去。"
          },
          {
            "title": "点亮目标",
            "text": "点对的加分，点错的扣分。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "hitRate": {
            "label": "逮住了多少",
            "explanation": "目标符号中被成功点亮的比例。"
          },
          "falseAlarmRate": {
            "label": "点错了多少",
            "explanation": "点亮的格子里不是目标的占比。"
          },
          "missCount": {
            "label": "漏了几个",
            "explanation": "没被点亮的目标符号个数。"
          }
        }
      },
      "professional": {
        "construct": "视觉搜索/划消（选择性注意）",
        "procedure": "每轮网格由服务端按 seed+scanIndex 重建（目标符号占 CANCELLATION_TARGET_COUNT 格，其余为形状相近干扰项）；参与者限时点亮目标，服务端将最终选中集与目标集求交并计算命中/漏报/误报。",
        "interpretation": "命中率与误报率同读（信号检测：灵敏度与反应偏向分离）；限时与轮次数影响解释边界。",
        "confounders": [
          "触控/鼠标点击精度影响误报计数。",
          "剩余时间压力因人而异。",
          "本报告不提供经过验证的人口常模、诊断、注意力等级或临床结论。"
        ],
        "metricNotes": {
          "hitRate": {
            "definition": "命中目标数 / 目标总数（跨有效轮次累计）。",
            "readingHint": "与误报率同读。"
          },
          "falseAlarmRate": {
            "definition": "误报数 / 选中总数；未选中任何格子时为 null。",
            "readingHint": "达到 0.3 触发误报过多标记。"
          },
          "hitCount": {
            "definition": "选中且为目标格的次数累计。",
            "readingHint": "受轮次数影响。"
          },
          "missCount": {
            "definition": "目标总数 − 命中数。",
            "readingHint": "与命中率互补。"
          },
          "falseAlarmCount": {
            "definition": "选中且非目标格的次数累计。",
            "readingHint": "与误报率互补。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划轮次数"
          },
          {
            "key": "durationMs",
            "label": "每轮时长（毫秒）"
          },
          {
            "key": "stimulusSetVersion",
            "label": "符号集版本"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "cancellation",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "一屏符号找目标",
    "metrics": {
      "hitRate": {
        "label": "目标找到的比例",
        "explanation": "命中率：所有目标符号中被你成功点亮的比例。",
        "singleExplanation": "命中率：所有目标符号中被你成功点亮的比例。"
      },
      "falseAlarmRate": {
        "label": "点亮格子中的误选比例",
        "explanation": "误报比例：可计分轮次中，你点亮的格子里不是目标的占比。它也受符号辨识、点击精度和搜索策略影响，不能据此判断是否心急；没有选中格子时此值缺失。",
        "singleExplanation": "误报比例：点亮的格子里不是目标的占比。"
      },
      "hitCount": {
        "label": "找到的目标数"
      },
      "missCount": {
        "label": "没选中的目标数"
      },
      "falseAlarmCount": {
        "label": "误选格子数"
      }
    },
    "experienceHeadline": "hitRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次一屏符号找目标的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "1轮最多45秒，另有1轮可提前结束的练习；含说明配置估计2–3分钟（未实测）。只描述这屏的命中/漏看/误选，不作持续注意诊断。",
          "体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。"
        ]
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次一屏符号找目标的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次一屏符号找目标的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      }
    },
    "practicalTips": [
      "先认准目标，再按行或按列寻找。注意别为了多点而忽略相似符号；新一轮开始时重新确认目标。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "在符号堆里，找到这一轮的目标",
      "introduction": "先认准本轮目标，再逐行找相同符号。点亮想选的格子，也可以再点一次取消；换轮时记得重新看目标。",
      "summary": {
        "template": "这一次，你逮住了 {hitRate} 的目标；误报比例 {falseAlarmRate}。",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次简短体验中，你逮住了 {hitRate} 的目标；体验版仅 1 轮，仅供体验。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "hitRate"
          ]
        }
      },
      "studentMetricKeys": [
        "hitRate",
        "falseAlarmRate",
        "missCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "excessiveFalseAlarms"
      ],
      "metricGates": {},
      "nextStep": "先认准目标，再按行或按列寻找。注意别为了多点而忽略相似符号；新一轮开始时重新确认目标。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "一屏80格，包含16个目标和64个相似干扰项。找到了多少目标、点亮的格子中有多少不是目标，是两个不同问题。",
        "takeaway": "找到的目标比例以有效轮次目标总数为分母；误选比例以点亮格子总数为分母。一个都没点时，误选比例缺失，不是0误选率。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "在书架上找同一系列的书时，既可能漏看，也可能把相似封面认错。这是搜索过程的例子，不是现实注意力或阅读困难诊断。",
        "scene": "signal",
        "frames": [
          {
            "title": "认准本轮目标",
            "text": "每轮先看清目标字母。"
          },
          {
            "title": "有顺序地找",
            "text": "可以按行或按列寻找，留意相似字母。"
          },
          {
            "title": "核对选中格",
            "text": "选中后还可取消，别把相似字母当作目标。"
          }
        ],
        "boundary": "体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。",
        "metricHelp": {
          "hitRate": {
            "label": "目标找到的比例",
            "explanation": "目标符号中被成功点亮的比例。"
          },
          "falseAlarmRate": {
            "label": "点亮格子中的误选比例",
            "explanation": "点亮的格子里不是目标的占比。"
          },
          "missCount": {
            "label": "没选中的目标数",
            "explanation": "没被点亮的目标符号个数。"
          },
          "hitCount": {
            "label": "找到的目标数",
            "explanation": "找到的目标数"
          },
          "falseAlarmCount": {
            "label": "误选格子数",
            "explanation": "误选格子数"
          }
        }
      },
      "professional": {
        "construct": "视觉搜索/划消（选择性注意）",
        "procedure": "每轮网格由服务端按 seed+scanIndex 重建（目标符号占 CANCELLATION_TARGET_COUNT 格，其余为形状相近干扰项）；参与者限时点亮目标，服务端将最终选中集与目标集求交并计算命中/漏报/误报。 方法与文献核对：研究档4轮，每轮10×8网格、16目标/64干扰、最多45秒且可提前结束；轮前500毫秒，练习1轮独立种子且无达标门槛，目标按Q/R/F/P逐轮变化。Hogrefe官方d2-R电子版为14屏、每屏60个d/p带短划符号、20秒/屏；本项目材料、目标、轮数和时长均不同，是项目视觉搜索变式，不转用d2-R常模或可靠性数值。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。",
        "confounders": [
          "触控/鼠标点击精度影响误报计数。",
          "剩余时间压力因人而异。",
          "本报告不提供经过验证的人口常模、诊断、注意力等级或临床结论。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "hitRate": {
            "definition": "命中目标数 / 目标总数（跨有效轮次累计）。",
            "readingHint": "与误报率同读。"
          },
          "falseAlarmRate": {
            "definition": "误报数 / 选中总数；未选中任何格子时为 null。",
            "readingHint": "达到 0.3 触发误报过多标记。"
          },
          "hitCount": {
            "definition": "选中且为目标格的次数累计。",
            "readingHint": "受轮次数影响。"
          },
          "missCount": {
            "definition": "目标总数 − 命中数。",
            "readingHint": "与命中率互补。"
          },
          "falseAlarmCount": {
            "definition": "选中且非目标格的次数累计。",
            "readingHint": "与误报率互补。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式题数/轮数"
          },
          {
            "key": "durationMs",
            "label": "每轮最长时长（毫秒）"
          },
          {
            "key": "stimulusSetVersion",
            "label": "刺激集版本"
          }
        ]
      }
    }
  }
]
