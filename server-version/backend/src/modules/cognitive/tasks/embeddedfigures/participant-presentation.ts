import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Frozen legacy and corrected version declarations remain literal data.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "embeddedfigures",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "嵌入图形",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中点中目标三角形（或其边线区域）的比例。",
        "singleExplanation": "总体正确率：正式作答中点中目标的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：找对的题目中，从复杂图形出现到点击的典型时间。",
        "singleExplanation": "正确作答中位用时：找对的题目中，从出现到点击的典型时间。"
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
      "先记住目标的形状和大小，再在复杂图形里排除明显不像的。",
      "顶点数量是关键：目标永远是三角形。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次隐藏图形查找表现，不是空间能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "复杂图形里，藏着你的目标",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的查找正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的查找正确率是 {accuracy}；体验版仅供体验。",
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
      "nextStep": "先看正确率，再读用时；干扰越多越慢是正常现象，不代表能力低。",
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "先给你看一个简单的三角形，然后它“藏”进了一堆复杂的图形里。你的任务是把它点出来——不管它被多少干扰包围。这个任务看的是你的知觉系统在干扰里保持简单形状的本领。",
        "takeaway": "心里装着目标，干扰就只是背景。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "在人堆里找朋友、在草稿纸的涂改里找回原来那行字、在杂乱图表里找一条曲线，都是“在复杂场里保持目标形状”。它只是知觉能力的一小部分，不代表你的智力或观察力全貌。",
        "scene": "signal",
        "frames": [
          {
            "title": "记目标",
            "text": "看清目标三角形的形状。"
          },
          {
            "title": "扫复杂图",
            "text": "在干扰图形里找同样的形状。"
          },
          {
            "title": "点它",
            "text": "找到后直接点击它的位置。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "找对了多少",
            "explanation": "正式作答中点中目标的比例。"
          },
          "medianRtMs": {
            "label": "找了多久",
            "explanation": "答对题目中从出现到点击的典型时间。"
          },
          "errorCount": {
            "label": "点错了几次",
            "explanation": "点到干扰图形的次数；与用时一起看。"
          }
        }
      },
      "professional": {
        "construct": "嵌入图形知觉（场独立性）",
        "procedure": "每题先呈现目标三角形 showTargetMs，随后呈现含 7 个多边形（1 三角目标 + 四/五边形干扰）的复杂场；参与者点击目标；服务端按 seed+index 重建几何并推导正确性；题源双轨：前 4 题冻结题库，其余 seed 生成。",
        "interpretation": "正确率与用时同读；点击命中为顶层面板，重叠区域可能命中干扰项；生成题干扰相似度未逐题标定。",
        "confounders": [
          "显示尺寸与指针精度影响命中判定。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中点中目标的比例。",
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
            "key": "showTargetMs",
            "label": "目标呈现时长（毫秒）"
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
    "testType": "embeddedfigures",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "嵌入图形",
    "metrics": {
      "accuracy": {
        "label": "找对比例",
        "explanation": "已呈现的正式题中，第一次选中含目标轮廓图块的比例；未答题单独记超时。"
      },
      "medianRtMs": {
        "label": "找对时的典型用时",
        "explanation": "只取时限内且达到有效反应下限的正确选择；不足两次时不解释典型用时。中断题仍可能计入，用时包含中断时段，未扣除其影响。"
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
      "先比较一个独特的角，再沿三条边确认轮廓。",
      "把用时和找对比例一起看；再次尝试前可先减少环境干扰。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "自编七选择线条图块匹配，不能用于常模排名、诊断、IQ、职业预测或稳定能力判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "你是怎样从线条中找回目标的",
      "introduction": "这些数字描述的是你这一次的选择，而不是固定能力。",
      "summary": {
        "template": "本次找对比例为 {accuracy}；找对时的典型用时为 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次6题简短体验中，找对比例为 {accuracy}。次数少，偶然失误的影响更大。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "errorCount",
        "timeoutCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {
        "medianRtMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "可以先看找对比例，再结合点错与超时次数；若用时缺失，表示有效正确选择不足，不等于用时为零。",
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "先记住一个轮廓，再从七个复杂线条图块中找出含同样轮廓的那个。轮廓只平移，大小和方向不变。",
        "takeaway": "沿完整的边确认，比凭一个相似的角更稳妥。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "在人堆里找朋友、在草稿纸的涂改里找回原来那行字、在杂乱图表里找一条曲线，都是“在复杂场里保持目标形状”。它只是知觉能力的一小部分，不代表你的智力或观察力全貌。",
        "scene": "signal",
        "frames": [
          {
            "title": "记轮廓",
            "text": "看清形状、大小和方向；目标随后移除。"
          },
          {
            "title": "找完整的边",
            "text": "背景线可能穿过或延续目标边。"
          },
          {
            "title": "选择图块",
            "text": "只记录第一次选择，正式题不显示正确答案。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "找对了多少",
            "explanation": "第一次选中含目标轮廓图块的正式题比例。"
          },
          "medianRtMs": {
            "label": "找了多久",
            "explanation": "答对题目中从出现到点击的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "作出了选择但未选中正确图块的次数；未答另列超时。"
          }
        }
      },
      "professional": {
        "construct": "复杂线条背景中的自编轮廓匹配",
        "procedure": "1.1.0：先呈现居中的目标，随后移除；七个同尺度线条图块中恰有一个含同形、同大小、同方向的目标。记录首次图块选择，服务端按冻结seed/index重建判定。练习使用独立seed，不计分；6/10/16正式题共用规则。",
        "interpretation": "正确率保留有效零值；未答与选错分列。典型用时仅使用有效正确反应，缺失为null而非0。此版本不可与1.0.0的分离多边形刺激直接比较。",
        "confounders": [
          "包含目标保持、视觉查找和首次选择因素；没有测得单一稳定能力。",
          "自编几何未完成题目难度和信效度标定；重复体验有练习效应。",
          "屏幕尺寸、指针操作及超时会影响本次结果；中断仅作标记，未从典型用时中排除该题或扣除中断时段。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "首选正确次数/本次完整正式序列题数。",
            "readingHint": "这是本次任务比例，不是群体百分位。"
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
            "definition": "截止时未作选择的题数；clickedShapeId与rtMs均为null。",
            "readingHint": "不与真实错误选择混同。"
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
            "key": "showTargetMs",
            "label": "目标呈现时长（毫秒）"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  }
]
