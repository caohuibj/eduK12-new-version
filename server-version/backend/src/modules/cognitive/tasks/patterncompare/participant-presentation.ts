import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "patterncompare",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形模式比较",
    "metrics": {
      "correctPerMinute": {
        "label": "每分钟正确比较数",
        "explanation": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。",
        "singleExplanation": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。"
      },
      "accuracy": {
        "label": "准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "medianCorrectRtMs": {
        "label": "典型正确反应时间",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "lapseRate": {
        "label": "未作答比例",
        "explanation": "未作答比例：正式试次中未在有效时间内作答的比例。",
        "singleExplanation": "未作答比例：正式试次中未在有效时间内作答的比例。"
      },
      "correctCount": {
        "label": "正确比较次数",
        "explanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。",
        "singleExplanation": "正确比较次数：本次正式计时内完成并判断正确的试次数。"
      },
      "completedTrialCount": {
        "label": "完成比较次数",
        "explanation": "完成比较次数：本次正式计时内进入评分的试次数。",
        "singleExplanation": "完成比较次数：本次正式计时内进入评分的试次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图形模式比较中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用30 秒。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图形模式比较中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用60 秒。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图形模式比较中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用90 秒。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "速度指标必须与准确率同屏阅读，避免把快速猜测当作加工速度。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果来自内部自制几何刺激，只反映本次任务表现，不是 NIH Toolbox 分数、临床诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "相似的细节，你看出了多少？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次图形比较，你每分钟正确判断 {correctPerMinute} 个，正确比例是 {accuracy}。",
        "metricKeys": [
          "correctPerMinute",
          "accuracy"
        ]
      },
      "studentMetricKeys": [
        "correctPerMinute",
        "accuracy",
        "completedTrialCount"
      ],
      "processMetricKeys": [
        "completedTrialCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedTrials"
      ],
      "metricGates": {},
      "nextStep": "速度与正确率需要一起看，不需要为了速度反复刷分。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
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
        "concept": "两幅图形乍看接近，差别可能藏在细节里。任务观察你这次辨别相同或不同的记录，既看判断，也看用时。",
        "takeaway": "看得快，也要看得准。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "校对版式、检查图案印刷或辨别产品外观差异，都涉及视觉比较。但真实任务的材料、训练与决策要求不同。",
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
          "correctPerMinute": {
            "label": "每分钟正确判断多少",
            "explanation": "把本次正确判断数量和实际用时一起看。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "medianCorrectRtMs": {
            "label": "答对时，通常一次用了多久",
            "explanation": "正确作答用时排序后的中间值，不会只挑最快一次。"
          },
          "completedTrialCount": {
            "label": "完成的尝试",
            "explanation": "本次实际完成的正式记录数量。"
          }
        }
      },
      "professional": {
        "construct": "视觉图形比较中的辨别速度与准确性",
        "procedure": "比较冻结图形刺激的同异判断；分条件统计准确率与有效正确反应时。",
        "interpretation": "速度与准确率须并读，避免将短用时等同于优良辨别表现；材料覆盖和输入方式影响可比性。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "correctPerMinute": {
            "definition": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianCorrectRtMs": {
            "definition": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "lapseRate": {
            "definition": "未作答比例：正式试次中未在有效时间内作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "correctCount": {
            "definition": "正确比较次数：本次正式计时内完成并判断正确的试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "completedTrialCount": {
            "definition": "完成比较次数：本次正式计时内进入评分的试次数。",
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
    "testType": "patterncompare",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形找不同",
    "metrics": {
      "correctPerMinute": {
        "label": "折算每分钟答对数",
        "explanation": "正确有效次数除以冻结配置durationSec，再乘60；按配置时长折算，不是按实测完成时长，也不是同龄人排名。",
        "singleExplanation": "按本次配置的正式秒数折算为每分钟答对数，不是实测一分钟的结果。"
      },
      "accuracy": {
        "label": "准确率",
        "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。",
        "singleExplanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
      },
      "medianCorrectRtMs": {
        "label": "答对时通常用多久",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "lapseRate": {
        "label": "未回应比例",
        "explanation": "未作答比例：正式试次中未在有效时间内作答的比例。",
        "singleExplanation": "未作答比例：正式试次中未在有效时间内作答的比例。"
      },
      "correctCount": {
        "label": "正确比较次数",
        "explanation": "选对且反应用时达到本次有效下限的正式次数；选对但过快的不计入。",
        "singleExplanation": "选对且反应用时达到本次有效下限的次数。"
      },
      "completedTrialCount": {
        "label": "完成比较次数",
        "explanation": "完成比较次数：本次正式计时内进入评分的试次数。",
        "singleExplanation": "完成比较次数：本次正式计时内进入评分的试次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次图形找不同的作答记录。",
        "reportCaveats": [
          "正式30秒，4题练习；通常含说明约1–2分钟（配置估计，未实测）。题数不固定，只描述这30秒的完成量和正确比例。",
          "体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次图形找不同的作答记录。",
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次图形找不同的作答记录。",
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "试试先扫轮廓，再核对填充、方向和标记。下次若要比较自己的记录，尽量使用相同设备和相同正式时长。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "先看清，再判断是不是同一个图形",
      "introduction": "两个图形乍看很像？再看一眼形状、填充和小标记。这个小游戏记录你在限时内比较细节的速度与准确程度。",
      "summary": {
        "template": "这次图形比较，你每分钟正确判断 {correctPerMinute} 个，正确比例是 {accuracy}。",
        "metricKeys": [
          "correctPerMinute",
          "accuracy"
        ]
      },
      "studentMetricKeys": [
        "correctPerMinute",
        "accuracy",
        "completedTrialCount"
      ],
      "processMetricKeys": [
        "completedTrialCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedTrials"
      ],
      "metricGates": {},
      "nextStep": "试试先扫轮廓，再核对填充、方向和标记。下次若要比较自己的记录，尽量使用相同设备和相同正式时长。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
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
        "concept": "每题比较两个图形是否完全相同。它观察的是这次看细节、作判断和按键的配合，不是单独测出一种固定能力。",
        "takeaway": "先看正确比例，再看完成量；同样快的两次作答，也可能有不同的出错情况。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "找两把外形相近的钥匙时，你可能会先看轮廓，再看齿纹。这里只用这个场景帮助理解，成绩不能预测你现实中找钥匙的快慢。",
        "scene": "rules",
        "frames": [
          {
            "title": "扫一眼轮廓",
            "text": "先比较左右形状。"
          },
          {
            "title": "再看小细节",
            "text": "填充、标记或方向有一处不同，也要选“不同”。"
          },
          {
            "title": "看准再按",
            "text": "正确比例和完成量一起读。"
          }
        ],
        "boundary": "体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。",
        "metricHelp": {
          "correctPerMinute": {
            "label": "折算每分钟答对数",
            "explanation": "正确有效次数除以配置durationSec，再乘60；体验档按配置30秒折算，不是按实测时长计算。"
          },
          "accuracy": {
            "label": "准确率",
            "explanation": "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。"
          },
          "medianCorrectRtMs": {
            "label": "答对时通常用多久",
            "explanation": "正确作答用时排序后的中间值，不会只挑最快一次。"
          },
          "completedTrialCount": {
            "label": "完成的尝试",
            "explanation": "本次实际完成的正式记录数量。"
          },
          "correctCount": {
            "label": "正确有效次数",
            "explanation": "选对且反应用时达到本次有效下限的正式次数；过快选对不计入。"
          },
          "lapseRate": {
            "label": "未回应比例",
            "explanation": "未作答比例：正式试次中未在有效时间内作答的比例。"
          }
        }
      },
      "professional": {
        "construct": "视觉图形比较中的辨别速度与准确性",
        "procedure": "比较冻结图形刺激的同异判断；分条件统计准确率与有效正确反应时。 方法与文献核对：研究档正式90秒，单题最多2500毫秒，题间250毫秒；种子逐题生成自编几何图形，并非固定等量的相同/不同题。4题练习至少对3题。NIH Toolbox官方同异判断说明支持范式参照，但当前官方页面的总施测约4分钟不等于本项目正式计时；未取得完整原始试次/时序协议，不称Toolbox复刻，不采用其常模。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "correctPerMinute": {
            "definition": "单位时间内正确完成图形比较的数量，应与准确率一起阅读，避免把快速猜测理解为更快的加工速度。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianCorrectRtMs": {
            "definition": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "lapseRate": {
            "definition": "未作答比例：正式试次中未在有效时间内作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "correctCount": {
            "definition": "正式题中选对且rtMs不缺失、达到冻结validRtFloorMs下限的次数。",
            "readingHint": "过快选对不纳入正确次数，但保留在比例分母中。"
          },
          "completedTrialCount": {
            "definition": "完成比较次数：本次正式计时内进入评分的试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "durationSec",
            "label": "正式时长（秒）"
          },
          {
            "key": "trialTimeoutMs",
            "label": "每题响应上限（毫秒）"
          },
          {
            "key": "isiMs",
            "label": "题间间隔（毫秒）"
          },
          {
            "key": "validRtFloorMs",
            "label": "纳入用时统计的最短时间（毫秒）"
          }
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次图形比较，你每分钟正确判断 {correctPerMinute} 个，正确比例是 {accuracy}。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "correctPerMinute",
            "accuracy"
          ]
        }
      }
    }
  }
]
