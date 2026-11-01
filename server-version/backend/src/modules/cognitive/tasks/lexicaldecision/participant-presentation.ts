import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "lexicaldecision",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "中文词汇判断",
    "metrics": {
      "dPrime": {
        "label": "词汇判断 d-prime",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "lexicalityEffectMs": {
        "label": "真词/伪词反应时差",
        "explanation": "伪词条件减去真词条件的正确反应中位时间。",
        "singleExplanation": "伪词条件减去真词条件的正确反应中位时间。"
      },
      "accuracyReal": {
        "label": "真词正确率",
        "explanation": "真词项目中判断正确的比例。",
        "singleExplanation": "真词项目中判断正确的比例。"
      },
      "accuracyPseudo": {
        "label": "伪词正确率",
        "explanation": "伪词项目中判断正确的比例。",
        "singleExplanation": "伪词项目中判断正确的比例。"
      },
      "medianRtReal": {
        "label": "真词反应时中位数",
        "explanation": "正确判断真词的有效反应时间中位数。",
        "singleExplanation": "正确判断真词的有效反应时间中位数。"
      },
      "medianRtPseudo": {
        "label": "伪词反应时中位数",
        "explanation": "正确判断伪词的有效反应时间中位数。",
        "singleExplanation": "正确判断伪词的有效反应时间中位数。"
      },
      "accuracyByFrequencyBand": {
        "label": "各词频带正确率",
        "explanation": "按内部词频分组列出正确率，不代表语言能力等级。",
        "singleExplanation": "按内部词频分组列出正确率，不代表语言能力等级。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "validResponseCount": {
        "label": "有效响应数",
        "explanation": "本次真词与伪词项目的有效响应次数。",
        "singleExplanation": "本次真词与伪词项目的有效响应次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在中文词汇判断中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用40 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在中文词汇判断中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用100 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在中文词汇判断中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用200 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "结果应结合词长、词频带、反应时下限和遗漏情况阅读；冻结词库与伪词生成器均处于 DRAFT 审查阶段。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次中文真词/伪词判断表现，不是语言能力、阅读能力或临床判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "看到一个词，你怎样判断？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，真实词语中你答对了 {accuracyReal}，非词材料中答对了 {accuracyPseudo}。",
        "metricKeys": [
          "accuracyReal",
          "accuracyPseudo"
        ]
      },
      "studentMetricKeys": [
        "accuracyReal",
        "accuracyPseudo",
        "dPrime"
      ],
      "processMetricKeys": [
        "validResponseCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientRealWords",
        "insufficientPseudoWords"
      ],
      "metricGates": {},
      "nextStep": "区分指标描述当前刺激中的判断，不等于词汇量或阅读等级。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracyReal",
          "accuracyPseudo"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
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
        "concept": "面对一串文字，判断它是不是熟悉的词，需要识别和选择。这个任务观察本版字词材料中的判断与用时。",
        "takeaway": "熟悉的文字，也要按规则判断。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "阅读和校对会涉及快速识别文字，但字词熟悉度与语言背景不同。本任务不是阅读水平、语言障碍或文化程度测验。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "dPrime": {
            "label": "区分目标的记录",
            "explanation": "结合认出目标和误按计算的区分指标；可以为负，不是同龄人排名。"
          },
          "accuracyReal": {
            "label": "真实词语判断正确多少",
            "explanation": "只看本版真实词语材料中的正确比例。"
          },
          "accuracyPseudo": {
            "label": "非词材料判断正确多少",
            "explanation": "只看本版非词材料中的正确比例。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "validResponseCount": {
            "label": "留下了多少有效回应",
            "explanation": "本次按任务要求完成的有效选择数量。"
          }
        }
      },
      "professional": {
        "construct": "内部词汇/非词材料中的词汇判断",
        "procedure": "依据冻结词汇身份及选择响应统计准确率与正确反应 RT；仅解释本版材料条件。",
        "interpretation": "结合词汇熟悉度、语言背景和材料覆盖阅读。不得将频率条件差异外推为语言能力等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "dPrime": {
            "definition": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "lexicalityEffectMs": {
            "definition": "伪词条件减去真词条件的正确反应中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyReal": {
            "definition": "真词项目中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyPseudo": {
            "definition": "伪词项目中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtReal": {
            "definition": "正确判断真词的有效反应时间中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtPseudo": {
            "definition": "正确判断伪词的有效反应时间中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyByFrequencyBand": {
            "definition": "按内部词频分组列出正确率，不代表语言能力等级。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validResponseCount": {
            "definition": "本次真词与伪词项目的有效响应次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          },
          {
            "key": "blockCount",
            "label": "区组数"
          }
        ]
      }
    }
  },
  // Report 3.0.0: selected explicitly by a new draft config; legacy entries above stay unchanged.
{
  "schemaVersion": 1,
  "presentationVersion": "3.0.0",
  "testType": "lexicaldecision",
  "engineVersion": "1.0.0",
  "scoringVersion": "1.0.0",
  "title": "词语快辨",
  "metrics": {
    "dPrime": {
      "label": "区分指标 d′（方法附注）",
      "explanation": "由命中率和误报率计算；不是词汇量、百分位或智力分。",
      "singleExplanation": "由命中率和误报率计算；不是词汇量、百分位或智力分。"
    },
    "lexicalityEffectMs": {
      "label": "真词/伪词反应时差",
      "explanation": "伪词条件减去真词条件的正确反应中位时间。",
      "singleExplanation": "伪词条件减去真词条件的正确反应中位时间。"
    },
    "accuracyReal": {
      "label": "真实词判断正确率",
      "explanation": "分母为实际呈现的真实词试次；未答不是正确作答。",
      "singleExplanation": "分母为实际呈现的真实词试次；未答不是正确作答。"
    },
    "accuracyPseudo": {
      "label": "非词判断正确率",
      "explanation": "分母为实际呈现的非词试次；与真实词正确率分别阅读。",
      "singleExplanation": "分母为实际呈现的非词试次；与真实词正确率分别阅读。"
    },
    "medianRtReal": {
      "label": "真词反应时中位数",
      "explanation": "正确判断真词的有效反应时间中位数。",
      "singleExplanation": "正确判断真词的有效反应时间中位数。"
    },
    "medianRtPseudo": {
      "label": "伪词反应时中位数",
      "explanation": "正确判断伪词的有效反应时间中位数。",
      "singleExplanation": "正确判断伪词的有效反应时间中位数。"
    },
    "accuracyByFrequencyBand": {
      "label": "各词频带正确率",
      "explanation": "按内部词频分组列出正确率，不代表语言能力等级。",
      "singleExplanation": "按内部词频分组列出正确率，不代表语言能力等级。"
    },
    "omissionRate": {
      "label": "遗漏比例",
      "explanation": "遗漏比例：应该响应但没有响应的比例。",
      "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
    },
    "validResponseCount": {
      "label": "有效响应数",
      "explanation": "本次真词与伪词项目的有效响应次数。",
      "singleExplanation": "本次真词与伪词项目的有效响应次数。"
    }
  },
  "hiddenMetrics": [],
  "suppressTips": false,
  "protocols": {
    "experience": {
      "tier": "PILOT",
      "profileLabel": "简短体验",
      "participantConclusion": "你要在真实词语和拼出的非词之间作判断。这里记录你对这批材料分得是否准确，以及按键花了多久。",
      "reportCaveats": [
        "本次正式任务共40次词语判断。另有4次练习。",
        "体验约2–4分钟；研究约6–12分钟（流程估计，非实测）。",
        "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
        "沿用词汇判断范式，但本项目简体词表与生成非词不是 Chinese Lexicon Project 的香港粤语、繁体双字词材料，不能使用其反应时或准确率常模。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    },
    "standard": {
      "tier": "PILOT",
      "profileLabel": "常规任务",
      "participantConclusion": "你要在真实词语和拼出的非词之间作判断。这里记录你对这批材料分得是否准确，以及按键花了多久。",
      "reportCaveats": [
        "本次正式任务共100次词语判断。另有4次练习。",
        "体验约2–4分钟；研究约6–12分钟（流程估计，非实测）。",
        "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
        "沿用词汇判断范式，但本项目简体词表与生成非词不是 Chinese Lexicon Project 的香港粤语、繁体双字词材料，不能使用其反应时或准确率常模。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    },
    "research": {
      "tier": "PILOT",
      "profileLabel": "研究变式",
      "participantConclusion": "你要在真实词语和拼出的非词之间作判断。这里记录你对这批材料分得是否准确，以及按键花了多久。",
      "reportCaveats": [
        "本次正式任务共200次词语判断。另有4次练习。",
        "体验约2–4分钟；研究约6–12分钟（流程估计，非实测）。",
        "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
        "沿用词汇判断范式，但本项目简体词表与生成非词不是 Chinese Lexicon Project 的香港粤语、繁体双字词材料，不能使用其反应时或准确率常模。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    }
  },
  "practicalTips": [
    "先看真实词和非词两边的正确率，再看用时；下次阅读陌生词时，可以停一下核对上下文。"
  ],
  "singleHiddenMetrics": [],
  "disclaimer": "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
  "reportReading": {
    "version": "3.0.0",
    "title": "这两个字，像一个常见词吗？",
    "introduction": "你要在真实词语和拼出的非词之间作判断。这里记录你对这批材料分得是否准确，以及按键花了多久。",
    "summary": {
      "template": "真实词判断正确率 {accuracyReal}，非词判断正确率 {accuracyPseudo}；有效作答 {validResponseCount} 次。",
      "metricKeys": [
        "accuracyReal",
        "accuracyPseudo",
        "validResponseCount"
      ]
    },
    "studentMetricKeys": [
      "accuracyReal",
      "accuracyPseudo",
      "validResponseCount"
    ],
    "processMetricKeys": [
      "validResponseCount"
    ],
    "withholdFlags": [
      "legacyUninterpretable",
      "insufficientRealWords",
      "insufficientPseudoWords"
    ],
    "metricGates": {},
    "nextStep": "先看真实词和非词两边的正确率，再看用时；下次阅读陌生词时，可以停一下核对上下文。",
    "chart": {
      "kind": "metrics",
      "metricKeys": [
        "accuracyReal",
        "accuracyPseudo"
      ]
    },
    "caveatTerms": {
      "正式版": "标准协议",
      "体验版": "短程协议",
      "研究版": "科研协议",
      "科研版": "科研协议",
      "科研档": "科研协议",
      "人口常模": "经过验证的同龄人比较依据",
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
      "concept": "你要在真实词语和拼出的非词之间作判断。这里记录你对这批材料分得是否准确，以及按键花了多久。",
      "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
      "exampleTitle": "生活里也会遇到",
      "example": "读消息时，熟悉的词往往一眼认出；陌生组合会让人多看一眼。这个任务把这种差别放到按钮选择里。",
      "scene": "rules",
      "frames": [
        {
          "title": "任务怎样进行",
          "text": "40 / 100 / 200 次；真实词与非词各半；另有4次练习。"
        },
        {
          "title": "大概需要多久",
          "text": "体验约2–4分钟；研究约6–12分钟。这是按流程估计，尚无本轮实测分布。"
        },
        {
          "title": "怎样读这次记录",
          "text": "先看真实词和非词两边的正确率，再看用时；下次阅读陌生词时，可以停一下核对上下文。"
        }
      ],
      "boundary": "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
      "metricHelp": {
        "accuracyReal": {
          "label": "真实词判断正确率",
          "explanation": "分母为实际呈现的真实词试次；未答不是正确作答。"
        },
        "accuracyPseudo": {
          "label": "非词判断正确率",
          "explanation": "分母为实际呈现的非词试次；与真实词正确率分别阅读。"
        },
        "validResponseCount": {
          "label": "有效响应数",
          "explanation": "本次真词与伪词项目的有效响应次数。"
        }
      }
    },
    "professional": {
      "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
      "procedure": "40 / 100 / 200 次；真实词与非词各半；另有4次练习。 沿用词汇判断范式，但本项目简体词表与生成非词不是 Chinese Lexicon Project 的香港粤语、繁体双字词材料，不能使用其反应时或准确率常模。",
      "interpretation": "用词经验、地区语言和键盘都会影响结果；40 次体验每类约20次，不能给词汇量、阅读年龄或稳定能力下结论。",
      "confounders": [
        "设备与输入方式、显示和响应延迟会影响用时记录。",
        "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
        "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。",
        "设备与输入方式",
        "练习、熟悉和这次有效观察量"
      ],
      "metricNotes": {
        "dPrime": {
          "definition": "由命中率和误报率计算；不是词汇量、百分位或智力分。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "lexicalityEffectMs": {
          "definition": "伪词条件减去真词条件的正确反应中位时间。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        },
        "accuracyReal": {
          "definition": "分母为实际呈现的真实词试次；未答不是正确作答。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "accuracyPseudo": {
          "definition": "分母为实际呈现的非词试次；与真实词正确率分别阅读。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "medianRtReal": {
          "definition": "正确判断真词的有效反应时间中位数。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        },
        "medianRtPseudo": {
          "definition": "正确判断伪词的有效反应时间中位数。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        },
        "accuracyByFrequencyBand": {
          "definition": "按内部词频分组列出正确率，不代表语言能力等级。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        },
        "omissionRate": {
          "definition": "遗漏比例：应该响应但没有响应的比例。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        },
        "validResponseCount": {
          "definition": "本次真词与伪词项目的有效响应次数。",
          "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
        }
      },
      "configFields": [
        {
          "key": "totalTrials",
          "label": "计划正式试次数"
        },
        {
          "key": "timeoutMs",
          "label": "响应时限（毫秒）"
        },
        {
          "key": "blockCount",
          "label": "区组数"
        }
      ]
    },
    "summaryByProfile": {
      "experience": {
        "template": "真实词判断正确率 {accuracyReal}，非词判断正确率 {accuracyPseudo}；有效作答 {validResponseCount} 次。",
        "metricKeys": [
          "accuracyReal",
          "accuracyPseudo",
          "validResponseCount"
        ]
      }
    },
    "hiddenByProfile": {
      "experience": [
        "dPrime",
        "accuracyByFrequencyBand",
        "lexicalityEffectMs"
      ]
    },
    "qualityLabels": {
      "insufficientPseudoWords": "非词的有效作答较少",
      "insufficientRealWords": "真实词的有效作答较少",
      "constantResponse": "多次使用同一按钮",
      "excessiveOmissions": "未答或用时不在范围内的记录较多"
    }
  },
  "experienceHeadline": "accuracyReal"
}
]
