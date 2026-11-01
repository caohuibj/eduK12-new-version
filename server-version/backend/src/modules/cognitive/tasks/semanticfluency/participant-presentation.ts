import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "semanticfluency",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "语义流畅性",
    "metrics": {
      "uniqueValidPerTrial": {
        "label": "每轮有效词数",
        "explanation": "每轮有效词数：未中断轮次中，经归一化、轮内去重并匹配冻结词库的词数，除以计划轮数；词库可能漏收真实类别成员。",
        "singleExplanation": "每轮有效词数：未中断轮次中归一化、轮内去重后的词库匹配总数，除以计划轮数。"
      },
      "intrusionRate": {
        "label": "未匹配词比例",
        "explanation": "未匹配词比例：去除空白等无效输入后，首次出现但未匹配该类别冻结词库的词数，占全部可计数输入的比例。词库外的真实成员也会计入，不能直接理解成跑题。",
        "singleExplanation": "未匹配词比例：输入中首次出现但未匹配冻结词库的词数，占全部可计数输入的比例；真实类别成员也可能因词库遗漏而未匹配。"
      },
      "duplicateRate": {
        "label": "重复比例",
        "explanation": "重复比例：同一轮内重复输入同一个词的占比。",
        "singleExplanation": "重复比例：同一轮内重复输入的占比。"
      },
      "uniqueValidCount": {
        "label": "有效词总数"
      },
      "emptyTrialCount": {
        "label": "空轮次数"
      }
    },
    "experienceHeadline": "uniqueValidPerTrial",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先想子类（家畜、鸟类、昆虫……），一类一类往外冒。",
      "想不起来时换个子类，别卡在一个词上。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次类别流畅性表现，不是语言能力诊断或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "你的词库，打开得有多快？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你平均每轮想起 {uniqueValidPerTrial} 个有效词；未匹配词比例 {intrusionRate}。",
        "metricKeys": [
          "uniqueValidPerTrial",
          "intrusionRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你平均每轮想起 {uniqueValidPerTrial} 个有效词；体验版轮次少，仅供体验。",
          "metricKeys": [
            "uniqueValidPerTrial"
          ]
        }
      },
      "studentMetricKeys": [
        "uniqueValidPerTrial",
        "intrusionRate",
        "duplicateRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientResponses",
        "excessiveIntrusions"
      ],
      "metricGates": {
        "intrusionRate": [
          "insufficientResponses"
        ]
      },
      "nextStep": "先看每轮产词量，再看未匹配词比例；未匹配可能来自词库遗漏、别称或输入错误，不能据此判断语言能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "uniqueValidPerTrial"
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
        "concept": "给你一个类别（比如“动物”），限时内把能想到的都打出来。本次记录同时受类别熟悉程度、打字速度和冻结词库覆盖影响，不能当成纯粹的词语提取速度。",
        "takeaway": "按子类搜索，比东一个西一个更高效。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "写作文找词、聊天接话、头脑风暴想点子，都是快速从记忆里取词。它只是语言能力的一小部分，不代表你的表达或智力水平。",
        "scene": "signal",
        "frames": [
          {
            "title": "看类别",
            "text": "比如“动物”。"
          },
          {
            "title": "限时输入",
            "text": "想到就打，别管顺序。"
          },
          {
            "title": "看产出",
            "text": "有效词数与跑题比例就是记录。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "uniqueValidPerTrial": {
            "label": "每轮想起多少",
            "explanation": "平均每轮的不重复有效词数。"
          },
          "intrusionRate": {
            "label": "有多少词未匹配词库",
            "explanation": "首次出现但未匹配冻结词库的词数，占全部可计数输入的比例；真实类别成员也可能因词库遗漏而未匹配。"
          },
          "duplicateRate": {
            "label": "重复了多少",
            "explanation": "同一轮里重复输入同一个词的占比。"
          }
        }
      },
      "professional": {
        "construct": "类别语义流畅性（语义提取）",
        "procedure": "每轮呈现一个冻结类别（animals/fruits），限时 durationMs 自由输入；输入经 NFKC/小写/去标点归一化后与冻结词库匹配；去重后词库命中计为有效，未命中计为侵入。",
        "interpretation": "每轮有效词数为主指标；侵入率受词库覆盖度限制（词库外真实类别成员会被计为侵入），须与产词量同读。",
        "confounders": [
          "词库覆盖有限，稀有或口语化词目可能被计为侵入。",
          "打字速度与输入法影响产出量。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        "metricNotes": {
          "uniqueValidPerTrial": {
            "definition": "有效词总数 / 计划轮次数。",
            "readingHint": "与侵入率同读；词库覆盖度是已知限制。"
          },
          "intrusionRate": {
            "definition": "未命中词库的输入占总输入比例。",
            "readingHint": "达到 0.5 触发侵入过多标记；词库覆盖有限是重要边界。"
          },
          "duplicateRate": {
            "definition": "同一轮内重复输入占总输入比例。",
            "readingHint": "重复可能受输入习惯、记忆和策略影响，不能单独推断检索监控或词汇量。"
          },
          "uniqueValidCount": {
            "definition": "去重后的词库命中总数。",
            "readingHint": "受轮次数影响，跨 profile 不可比。"
          },
          "emptyTrialCount": {
            "definition": "没有任何输入的轮次数。",
            "readingHint": "与质量标记同读。"
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
            "label": "词库版本"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "semanticfluency",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "分类找词",
    "metrics": {
      "uniqueValidPerTrial": {
        "label": "按计划轮数平均的词表匹配数",
        "explanation": "各轮去重后匹配数相加再除以计划轮数；中断轮不贡献词数，但仍在分母。",
        "singleExplanation": "各轮去重后匹配数相加再除以计划轮数；中断轮不贡献词数，但仍在分母。",
        "valueUnit": "count"
      },
      "intrusionRate": {
        "label": "本词表未匹配比例",
        "explanation": "未匹配可能来自词表不足、同义词或输入差异，不等同于类别错误。",
        "singleExplanation": "未匹配可能来自词表不足、同义词或输入差异，不等同于类别错误。"
      },
      "duplicateRate": {
        "label": "轮内重复输入比例",
        "explanation": "重复按每一轮单独计算，保留输入方式的影响。",
        "singleExplanation": "重复按每一轮单独计算，保留输入方式的影响。"
      },
      "uniqueValidCount": {
        "label": "累计词表匹配数",
        "explanation": "每轮内去重，轮间相同词可再次计入；并非整场全局不同词数。",
        "singleExplanation": "每轮内去重，轮间相同词可再次计入；并非整场全局不同词数。"
      },
      "emptyTrialCount": {
        "label": "空轮次数"
      }
    },
    "experienceHeadline": "uniqueValidCount",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "看到类别后输入词语并确认。报告统计本项目词表能匹配到的不同词，也保留重复和未匹配的记录。",
        "reportCaveats": [
          "本次正式任务共2轮找词，每轮45秒。另有动物类练习，最多45秒，可提前结束。",
          "体验约2.5–3分钟；研究约7–9分钟（流程估计，非实测）。",
          "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
          "Shao 等2014使用荷兰语口述60秒动物、食物饮料及字母M/S任务；本版中文键入45秒、动物与水果反复出现，以有限词表自动匹配，没有口述起始时序或人工类别判定，不能使用该研究的老年样本比较值。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "看到类别后输入词语并确认。报告统计本项目词表能匹配到的不同词，也保留重复和未匹配的记录。",
        "reportCaveats": [
          "本次正式任务共4轮找词，每轮45秒。另有动物类练习，最多45秒，可提前结束。",
          "体验约2.5–3分钟；研究约7–9分钟（流程估计，非实测）。",
          "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
          "Shao 等2014使用荷兰语口述60秒动物、食物饮料及字母M/S任务；本版中文键入45秒、动物与水果反复出现，以有限词表自动匹配，没有口述起始时序或人工类别判定，不能使用该研究的老年样本比较值。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "看到类别后输入词语并确认。报告统计本项目词表能匹配到的不同词，也保留重复和未匹配的记录。",
        "reportCaveats": [
          "本次正式任务共8轮找词，每轮45秒。另有动物类练习，最多45秒，可提前结束。",
          "体验约2.5–3分钟；研究约7–9分钟（流程估计，非实测）。",
          "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
          "Shao 等2014使用荷兰语口述60秒动物、食物饮料及字母M/S任务；本版中文键入45秒、动物与水果反复出现，以有限词表自动匹配，没有口述起始时序或人工类别判定，不能使用该研究的老年样本比较值。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "可以尝试按小类别寻找词语；若某个词没有被匹配，先核对是否为同义名称、输入问题或词表缺漏。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
    "reportReading": {
      "version": "3.0.0",
      "title": "45秒里，你能想到哪些动物或水果？",
      "introduction": "看到类别后输入词语并确认。报告统计本项目词表能匹配到的不同词，也保留重复和未匹配的记录。",
      "summary": {
        "template": "本词表匹配到的词条累计（各轮内去重、轮间可重复） {uniqueValidCount} 个，按计划轮数平均 {uniqueValidPerTrial} 个；空轮 {emptyTrialCount} 轮。",
        "metricKeys": [
          "uniqueValidCount",
          "uniqueValidPerTrial",
          "emptyTrialCount"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "本词表匹配到的词条累计（各轮内去重、轮间可重复） {uniqueValidCount} 个，按计划轮数平均 {uniqueValidPerTrial} 个；空轮 {emptyTrialCount} 轮。",
          "metricKeys": [
            "uniqueValidCount",
            "uniqueValidPerTrial",
            "emptyTrialCount"
          ]
        }
      },
      "studentMetricKeys": [
        "uniqueValidCount",
        "uniqueValidPerTrial",
        "emptyTrialCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientResponses",
        "excessiveIntrusions"
      ],
      "metricGates": {
        "intrusionRate": [
          "insufficientResponses"
        ]
      },
      "nextStep": "可以尝试按小类别寻找词语；若某个词没有被匹配，先核对是否为同义名称、输入问题或词表缺漏。",
      "chart": {
        "kind": "metrics",
        "metricKeys": []
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
        "concept": "看到类别后输入词语并确认。报告统计本项目词表能匹配到的不同词，也保留重复和未匹配的记录。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "和朋友轮流说动物名字时，想到“猫、狗”后也许会转向鸟类或海洋动物。换个小类别是帮助继续检索的一种办法。",
        "scene": "signal",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "2 / 4 / 8轮，每轮45秒，动物和水果各半；另有动物类练习，最多45秒，可提前结束。"
          },
          {
            "title": "大概需要多久",
            "text": "体验约2.5–3分钟；研究约7–9分钟。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "可以尝试按小类别寻找词语；若某个词没有被匹配，先核对是否为同义名称、输入问题或词表缺漏。"
          }
        ],
        "boundary": "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
        "metricHelp": {
          "uniqueValidCount": {
            "label": "累计词表匹配数",
            "explanation": "每轮内去重，轮间相同词可再次计入；并非整场全局不同词数。"
          },
          "uniqueValidPerTrial": {
            "label": "按计划轮数平均的词表匹配数",
            "explanation": "各轮去重后匹配数相加再除以计划轮数；中断轮不贡献词数，但仍在分母。"
          },
          "emptyTrialCount": {
            "label": "空轮次数",
            "explanation": "只描述本次记录。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "2 / 4 / 8轮，每轮45秒，动物和水果各半；另有动物类练习，最多45秒，可提前结束。 Shao 等2014使用荷兰语口述60秒动物、食物饮料及字母M/S任务；本版中文键入45秒、动物与水果反复出现，以有限词表自动匹配，没有口述起始时序或人工类别判定，不能使用该研究的老年样本比较值。",
        "interpretation": "词表有限：未匹配不等于你说错。输入速度、语言经验和重复类别的记忆都会影响数量，不能用它推断词汇总量、认知年龄或临床状态。",
        "confounders": [
          "词库覆盖有限，稀有或口语化词目可能被计为侵入。",
          "打字速度与输入法影响产出量。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "uniqueValidPerTrial": {
            "definition": "各轮去重后匹配数相加再除以计划轮数；中断轮不贡献词数，但仍在分母。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "intrusionRate": {
            "definition": "未匹配可能来自词表不足、同义词或输入差异，不等同于类别错误。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "duplicateRate": {
            "definition": "重复按每一轮单独计算，保留输入方式的影响。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "uniqueValidCount": {
            "definition": "每轮内去重，轮间相同词可再次计入；并非整场全局不同词数。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "emptyTrialCount": {
            "definition": "没有任何输入的轮次数。",
            "readingHint": "与质量标记同读。"
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
            "label": "词库版本"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": []
      },
      "qualityLabels": {
        "excessiveIntrusions": "本词表未匹配的输入较多",
        "insufficientResponses": "输入词条较少"
      }
    }
  }
]
