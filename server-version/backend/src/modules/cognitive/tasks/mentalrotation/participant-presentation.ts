import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "mentalrotation",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "心理旋转",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "angleCost": {
        "label": "大角度反应时代价",
        "explanation": "大角度条件减去小角度条件的正确反应中位时间。",
        "singleExplanation": "大角度条件减去小角度条件的正确反应中位时间。"
      },
      "medianCorrectRtMs": {
        "label": "典型正确反应时间",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "mirrorErrorRate": {
        "label": "镜像项目错误率",
        "explanation": "镜像项目中判断错误的比例。",
        "singleExplanation": "镜像项目中判断错误的比例。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在心理旋转中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用12 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在心理旋转中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用40 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在心理旋转中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用80 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "角度代价只在大小角度都有足够正确反应时解释，并与正确率同屏阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部几何旋转任务表现，不是完整空间智力、诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "转个角度，还是同一个图形吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "旋转判断中，你这次答对了 {accuracy}；答对时通常一次用了 {medianCorrectRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianCorrectRtMs"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "medianCorrectRtMs",
        "mirrorErrorRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAngleCoverage"
      ],
      "metricGates": {},
      "nextStep": "不同角度与设备可能影响作答；不以单一正确率概括空间能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy",
          "mirrorErrorRate"
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
        "concept": "当图形换了方向，我们有时会在脑中把它转回来。任务观察不同旋转条件下的判断和用时。",
        "takeaway": "换个角度，再确认一次。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "读装配图、想象零件转向后的样子，需要空间变换。真实设计与操作还涉及知识和经验，本任务不用于判断职业适合度。",
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
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "medianCorrectRtMs": {
            "label": "答对时，通常一次用了多久",
            "explanation": "正确作答用时排序后的中间值，不会只挑最快一次。"
          },
          "mirrorErrorRate": {
            "label": "镜像判断中的错误比例",
            "explanation": "只描述本版图形材料中的镜像判断记录。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "二维图形心理旋转条件下的匹配",
        "procedure": "按冻结旋转角度与匹配条件核查判断，统计正确率、反应用时及旋转相关差异。",
        "interpretation": "旋转差值须连同正确率与角度覆盖解释；不直接推断一般空间能力或工程技能。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "angleCost": {
            "definition": "大角度条件减去小角度条件的正确反应中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianCorrectRtMs": {
            "definition": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "mirrorErrorRate": {
            "definition": "镜像项目中判断错误的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
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
    "testType": "mentalrotation",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "心理旋转",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "angleCost": {
        "label": "大角度比小角度多用的时间",
        "explanation": "本次大角度与小角度正确判断的典型用时之差；负值仍保留，不是转动速度或能力等级。",
        "singleExplanation": "大角度条件减去小角度条件的正确反应中位时间。"
      },
      "medianCorrectRtMs": {
        "label": "答对时的典型用时（中位数）",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "mirrorErrorRate": {
        "label": "镜像项目错误率",
        "explanation": "镜像项目中判断错误的比例。",
        "singleExplanation": "镜像项目中判断错误的比例。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "回看这次完成的12题；只描述本次表现。",
        "reportCaveats": [
          "体验约2–4分钟；研究原估计11–16分钟。正式12/80次按5秒呈现+0.4秒间隔的上界约1.1/7.2分钟，另计说明与练习；研究估计偏宽，非实测。",
          "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "标准任务",
        "participantConclusion": "回看这次完成的40题；只描述本次表现。",
        "reportCaveats": [
          "体验约2–4分钟；研究原估计11–16分钟。正式12/80次按5秒呈现+0.4秒间隔的上界约1.1/7.2分钟，另计说明与练习；研究估计偏宽，非实测。",
          "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "Shepard与Metzler（1971）用三维物体透视图比较方向差与识别时间；本项目为平面形状与镜像二选一，角度组中位差不等于原文旋转速度或线性斜率。",
        "reportCaveats": [
          "体验约2–4分钟；研究原估计11–16分钟。正式12/80次按5秒呈现+0.4秒间隔的上界约1.1/7.2分钟，另计说明与练习；研究估计偏宽，非实测。",
          "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "先找一个不对称的小特征，再想象整体转动。正确率和用时一起看，不单追求快。",
      "把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。 只描述本次记录，不换算IQ、同龄排名或诊断。 练习与正式使用同一内部素材池，可能再次遇到相同素材；熟悉效应需一起考虑。",
    "reportReading": {
      "version": "3.0.0",
      "title": "把图形在脑中转一转",
      "introduction": "两个图形可能只是转了方向，也可能像照镜子一样翻了面。你要分清这两种变化；报告只回看这一次判断。",
      "summary": {
        "template": "旋转判断中，你这次答对了 {accuracy}；答对时通常一次用了 {medianCorrectRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianCorrectRtMs"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "medianCorrectRtMs",
        "mirrorErrorRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAngleCoverage"
      ],
      "metricGates": {},
      "nextStep": "先找一个不对称的小特征，再想象整体转动。正确率和用时一起看，不单追求快。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy",
          "mirrorErrorRate"
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
        "concept": "两个图形可能只是转了方向，也可能像照镜子一样翻了面。你要分清这两种变化；报告只回看这一次判断。",
        "takeaway": "先找一个不对称的小特征，再想象整体转动。正确率和用时一起看，不单追求快。",
        "exampleTitle": "生活里，也会用到这样的思路",
        "example": "拼一块拼图前，试着在脑中转动它，看看凸角能否对上缺口；镜面翻转则不一定能靠转动重合。",
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
        "boundary": "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
        "metricHelp": {
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "medianCorrectRtMs": {
            "label": "答对时，通常一次用了多久",
            "explanation": "正确作答用时排序后的中间值，不会只挑最快一次。"
          },
          "mirrorErrorRate": {
            "label": "镜像判断中的错误比例",
            "explanation": "只描述本版图形材料中的镜像判断记录。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "二维图形心理旋转条件下的匹配",
        "procedure": "平面形状，0/45/90/135/180度×同形/镜像10条件，12/40/80次，seed分层后打乱；12次中0度两条件各2次、其余各1次。呈现5秒、间隔400ms；正确率分母是全部正式试次。角度差为≥135度与≤45度正确RT中位数之差，不是拟合斜率。 Shepard & Metzler, Mental Rotation of Three-Dimensional Objects (1971), DOI 10.1126/science.171.3972.701: https://pubmed.ncbi.nlm.nih.gov/5540314/ 当前练习从同一内部池取4题；研究档覆盖全池，存在练习刺激重现。练习记录不进入正式分母，但熟悉效应仍会影响后续表现。",
        "interpretation": "Shepard与Metzler（1971）用三维物体透视图比较方向差与识别时间；本项目为平面形状与镜像二选一，角度组中位差不等于原文旋转速度或线性斜率。",
        "confounders": [
          "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
          "体验约2–4分钟；研究原估计11–16分钟。正式12/80次按5秒呈现+0.4秒间隔的上界约1.1/7.2分钟，另计说明与练习；研究估计偏宽，非实测。",
          "模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "angleCost": {
            "definition": "大角度条件减去小角度条件的正确反应中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianCorrectRtMs": {
            "definition": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "mirrorErrorRate": {
            "definition": "镜像项目中判断错误的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
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
          "template": "这次简短体验中，答对比例是 {accuracy}。题目较少，只描述这一次选择，不推断稳定能力。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "hiddenByProfile": {
        "experience": [
          "angleCost",
          "mirrorErrorRate"
        ]
      }
    }
  }
]
