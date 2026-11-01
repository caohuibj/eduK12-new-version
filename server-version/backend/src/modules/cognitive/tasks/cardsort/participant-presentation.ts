import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "cardsort",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "规则卡片分类",
    "metrics": {
      "switchCostRtMs": {
        "label": "规则转换 RT 代价",
        "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。",
        "singleExplanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
      },
      "switchCostAccuracy": {
        "label": "规则转换准确率代价",
        "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。",
        "singleExplanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
      },
      "perseverativeErrorRate": {
        "label": "持续性错误率",
        "explanation": "规则转换后仍按上一规则作答的比例。",
        "singleExplanation": "规则转换后仍按上一规则作答的比例。"
      },
      "postSwitchRecovery": {
        "label": "转换后恢复",
        "explanation": "转换后的重复试次正确率减去转换试次正确率。",
        "singleExplanation": "转换后的重复试次正确率减去转换试次正确率。"
      },
      "accuracySwitch": {
        "label": "转换条件正确率",
        "explanation": "规则发生转换时正确作答的比例。",
        "singleExplanation": "规则发生转换时正确作答的比例。"
      },
      "accuracyRepeat": {
        "label": "重复条件正确率",
        "explanation": "规则重复且两种规则答案冲突时正确作答的比例。",
        "singleExplanation": "规则重复且两种规则答案冲突时正确作答的比例。"
      },
      "medianRtSwitch": {
        "label": "转换条件典型反应时间",
        "explanation": "规则转换试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则转换试次中正确有效反应时间的中位数。"
      },
      "medianRtRepeat": {
        "label": "重复条件典型反应时间",
        "explanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。"
      },
      "overallAccuracy": {
        "label": "总体准确率",
        "explanation": "所有正式试次中正确且反应时间有效的比例。",
        "singleExplanation": "所有正式试次中正确且反应时间有效的比例。"
      },
      "omissionRate": {
        "label": "未反应比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数",
        "explanation": "规则转换后仍按上一规则选择的次数。",
        "singleExplanation": "规则转换后仍按上一规则选择的次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在规则卡片分类中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 次、2 组。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在规则卡片分类中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用72 次、3 组。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在规则卡片分类中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用144 次、6 组。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "持续性错误由冻结规则和实际响应推导，不等同于临床执行功能判断。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次双规则分类任务表现，不是商业卡片分类测验、临床诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "规则变了，你怎样重新分类？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次换分类规则后的正确比例是 {accuracySwitch}；换规则与沿用规则时，通常用时相差 {switchCostRtMs}。",
        "metricKeys": [
          "switchCostRtMs",
          "accuracySwitch"
        ]
      },
      "studentMetricKeys": [
        "switchCostRtMs",
        "accuracySwitch",
        "accuracyRepeat"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientSwitchTrials",
        "insufficientRepeatTrials"
      ],
      "metricGates": {},
      "nextStep": "先看规则变化后的作答记录，不据此判断一般认知灵活性。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracySwitch",
          "accuracyRepeat"
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
        "concept": "分类依据可能从颜色变成形状。任务观察你能否跟着当前规则调整；沿用旧规则的错误，需要和其他错误分开看。",
        "takeaway": "分类靠规则，调整靠发现变化。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "按不同标准整理档案、在新检验规则下重新分类材料，都需要调整策略。本任务不等同于临床卡片分类测验或岗位考核。",
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
          "switchCostRtMs": {
            "label": "换规则时，用时差了多少",
            "explanation": "换规则和沿用规则时的典型用时差；快慢要连同正确率看。"
          },
          "switchCostAccuracy": {
            "label": "换规则时，正确比例的变化",
            "explanation": "沿用规则的正确比例减去换规则的正确比例。"
          },
          "accuracySwitch": {
            "label": "换规则后判断正确多少",
            "explanation": "只看需要换一条规则的那些尝试。"
          },
          "accuracyRepeat": {
            "label": "沿用规则时判断正确多少",
            "explanation": "只看继续使用同一条规则的那些尝试。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "perseverativeErrorCount": {
            "label": "继续沿用旧规则的记录",
            "explanation": "按任务规则统计的这类错误次数，不能据此判断性格。"
          }
        }
      },
      "professional": {
        "construct": "规则分类转换与持续性错误",
        "procedure": "按当前冻结规则校验分类，分别统计转换/重复表现、持续性错误和转换后恢复。",
        "interpretation": "区分规则理解、持续性错误和其他错误。联合阅读转换代价与正确率，不据单一差值生成认知灵活性等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "switchCostRtMs": {
            "definition": "切换条件的正确反应中位 RT 减去重复条件的正确反应中位 RT。",
            "readingHint": "同时审阅条件准确率与试次覆盖；负差值保留，不转化为能力等级。"
          },
          "switchCostAccuracy": {
            "definition": "重复条件正确率减去切换条件正确率。",
            "readingHint": "是条件比例差值，不能忽略分母及速度—准确率权衡。"
          },
          "perseverativeErrorRate": {
            "definition": "规则转换后仍按上一规则作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "postSwitchRecovery": {
            "definition": "转换后的重复试次正确率减去转换试次正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracySwitch": {
            "definition": "规则发生转换时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyRepeat": {
            "definition": "规则重复且两种规则答案冲突时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtSwitch": {
            "definition": "规则转换试次中正确有效反应时间的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtRepeat": {
            "definition": "规则重复且答案冲突的试次中正确有效反应时间的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "overallAccuracy": {
            "definition": "所有正式试次中正确且反应时间有效的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "perseverativeErrorCount": {
            "definition": "规则转换后仍按上一规则选择的次数。",
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
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "cardsort",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "跟着提示分卡片",
    "metrics": {
      "switchCostRtMs": {
        "label": "换规则比沿用规则多用的时间",
        "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。",
        "singleExplanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
      },
      "switchCostAccuracy": {
        "label": "规则转换准确率代价",
        "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。",
        "singleExplanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
      },
      "perseverativeErrorRate": {
        "label": "仍按旧规则作答的比例",
        "explanation": "规则转换后仍按上一规则作答的比例。",
        "singleExplanation": "规则转换后仍按上一规则作答的比例。"
      },
      "postSwitchRecovery": {
        "label": "换规则后的恢复记录",
        "explanation": "转换后的重复试次正确率减去转换试次正确率。",
        "singleExplanation": "转换后的重复试次正确率减去转换试次正确率。"
      },
      "accuracySwitch": {
        "label": "换规则时答对比例",
        "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。",
        "singleExplanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
      },
      "accuracyRepeat": {
        "label": "沿用规则且卡片有冲突时答对比例",
        "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。",
        "singleExplanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
      },
      "medianRtSwitch": {
        "label": "转换条件典型反应时间",
        "explanation": "规则转换试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则转换试次中正确有效反应时间的中位数。"
      },
      "medianRtRepeat": {
        "label": "重复条件典型反应时间",
        "explanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。",
        "singleExplanation": "规则重复且答案冲突的试次中正确有效反应时间的中位数。"
      },
      "overallAccuracy": {
        "label": "总体准确率",
        "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。",
        "singleExplanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
      },
      "omissionRate": {
        "label": "未反应比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数",
        "explanation": "规则转换后仍按上一规则选择的次数。",
        "singleExplanation": "规则转换后仍按上一规则选择的次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次跟着提示分卡片的作答记录。",
        "reportCaveats": [
          "24题/2组，4题练习；含说明与组间自定休息约2–3分钟（配置估计，未实测）。8次切换不足以据单次差值判断稳定灵活性。",
          "体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次跟着提示分卡片的作答记录。",
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次跟着提示分卡片的作答记录。",
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "每题先读“颜色/形状”，再看卡片。发现错了，就回到当前提示；不必凭记忆猜接下来是什么规则。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "这一次，按颜色还是按形状？",
      "introduction": "同一张卡片，换个规则就可能要去另一边。先读本题提示，再把它送到合适的位置。",
      "summary": {
        "template": "这次换分类规则后的正确比例是 {accuracySwitch}；换规则与沿用规则时，通常用时相差 {switchCostRtMs}。",
        "metricKeys": [
          "switchCostRtMs",
          "accuracySwitch"
        ]
      },
      "studentMetricKeys": [
        "switchCostRtMs",
        "accuracySwitch",
        "accuracyRepeat"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientSwitchTrials",
        "insufficientRepeatTrials"
      ],
      "metricGates": {},
      "nextStep": "每题先读“颜色/形状”，再看卡片。发现错了，就回到当前提示；不必凭记忆猜接下来是什么规则。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracySwitch",
          "accuracyRepeat"
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
        "concept": "屏幕会明确提示按颜色或形状分类。比较规则刚改变与沿用上一题规则时的记录，看看这次切换规则的过程；不是让你猜一个隐藏规则。",
        "takeaway": "换规则时出错，不等于不灵活。用时差、正确比例和是否沿用旧规则，需放在本次题量与具体题面中一起看。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "整理玩具时，先按颜色放，再改成按形状放，需要重新留意分类依据。这是规则切换的例子，不能据此评定现实中的适应力。",
        "scene": "rules",
        "frames": [
          {
            "title": "先看提示",
            "text": "这题按颜色，还是按形状？"
          },
          {
            "title": "再分卡片",
            "text": "按本题规则选左边或右边。"
          },
          {
            "title": "换了就重看",
            "text": "下一题规则可能改变，不沿用上一题答案。"
          }
        ],
        "boundary": "体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。",
        "metricHelp": {
          "switchCostRtMs": {
            "label": "换规则比沿用规则多用的时间",
            "explanation": "换规则和沿用规则时的典型用时差；快慢要连同正确率看。"
          },
          "switchCostAccuracy": {
            "label": "换规则时，正确比例的变化",
            "explanation": "沿用规则的正确比例减去换规则的正确比例。"
          },
          "accuracySwitch": {
            "label": "换规则时答对比例",
            "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
          },
          "accuracyRepeat": {
            "label": "沿用规则且卡片有冲突时答对比例",
            "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。 对照只含两种规则答案相冲突的重复题。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "perseverativeErrorCount": {
            "label": "继续沿用旧规则的记录",
            "explanation": "按任务规则统计的这类错误次数，不能据此判断性格。"
          },
          "overallAccuracy": {
            "label": "总体准确率",
            "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
          },
          "perseverativeErrorRate": {
            "label": "仍按旧规则作答的比例",
            "explanation": "规则转换后仍按上一规则作答的比例。"
          },
          "postSwitchRecovery": {
            "label": "换规则后的恢复记录",
            "explanation": "转换后的重复试次正确率减去转换试次正确率。"
          }
        }
      },
      "professional": {
        "construct": "规则分类转换与持续性错误",
        "procedure": "按当前冻结规则校验分类，分别统计转换/重复表现、持续性错误和转换后恢复。 方法与文献核对：研究档144题/6组，每组24题；每组round(23×0.33)=8次切换，共48切换/90重复/6起始题。题间350毫秒、提示500毫秒、响应窗2000毫秒。4题练习至少对3题。Zelazo(2006), DOI 10.1038/nprot.2006.46，原DCCS是先按一维后改另一维，本项目为逐题提示并多次切换；切换题限定冲突卡，对照只纳入冲突重复题，属于项目研究变式，不是标准DCCS或威斯康星卡片分类。只取得原摘要，未核全文练习/精确题量。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "switchCostRtMs": {
            "definition": "切换条件的正确反应中位 RT 减去重复条件的正确反应中位 RT。",
            "readingHint": "同时审阅条件准确率与试次覆盖；负差值保留，不转化为能力等级。"
          },
          "switchCostAccuracy": {
            "definition": "重复条件正确率减去切换条件正确率。",
            "readingHint": "是条件比例差值，不能忽略分母及速度—准确率权衡。"
          },
          "perseverativeErrorRate": {
            "definition": "规则转换后仍按上一规则作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "postSwitchRecovery": {
            "definition": "转换后的重复试次正确率减去转换试次正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracySwitch": {
            "definition": "规则发生转换时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyRepeat": {
            "definition": "规则重复且两种规则答案冲突时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtSwitch": {
            "definition": "规则转换试次中正确有效反应时间的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtRepeat": {
            "definition": "规则重复且答案冲突的试次中正确有效反应时间的中位数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "overallAccuracy": {
            "definition": "所有正式试次中正确且反应时间有效的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "perseverativeErrorCount": {
            "definition": "规则转换后仍按上一规则选择的次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式题数/轮数"
          },
          {
            "key": "blockCount",
            "label": "分组数"
          },
          {
            "key": "switchRatio",
            "label": "每组后续题的计划切换比例"
          },
          {
            "key": "cueMs",
            "label": "规则提示时长（毫秒）"
          },
          {
            "key": "stimulusMs",
            "label": "呈现或响应窗（毫秒，以任务说明为准）"
          },
          {
            "key": "isiMs",
            "label": "题间间隔（毫秒）"
          }
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次换分类规则后的正确比例是 {accuracySwitch}；换规则与沿用规则时，通常用时相差 {switchCostRtMs}。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "switchCostRtMs",
            "accuracySwitch"
          ]
        }
      }
    }
  }
]
