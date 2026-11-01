import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Materialized declaration: existing exported values are preserved.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.0",
    "testType": "icarmatrix",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形矩阵推理",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对矩阵规律的比例。",
        "singleExplanation": "总体正确率：正式作答中选对矩阵规律的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：答对的题目中，从题目出现到选择的典型时间。",
        "singleExplanation": "正确作答中位用时：答对的题目中，从题目出现到选择的典型时间。"
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
      "先横着看每行缺什么，再竖着验证规律。",
      "属性可能同时变化：形状、填充、数量分开来看。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价，也不是年龄常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "图形的规律，你能找出来吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的矩阵推理正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的矩阵推理正确率是 {accuracy}；体验版只含固定题库，仅供体验。",
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
      "nextStep": "先看正确率，再读用时；不换算 IQ，只描述这一次的推理过程。",
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "一个 3×3 的图形方格，右下角空着。每一行、每一列都藏着规律——形状在变、填充在变、个数也在变。你要从六个选项里找出属于空格的那一个。这个任务看的是从多个变化中归纳出规则的能力。",
        "takeaway": "横着找一行，竖着验一遍。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "看出数列的规律、预测趋势、排查机器故障的变化模式，都是同一类归纳推理。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        "scene": "rules",
        "frames": [
          {
            "title": "看整体",
            "text": "九宫格里不止一个规律在变。"
          },
          {
            "title": "分属性",
            "text": "形状、填充、个数分开检查。"
          },
          {
            "title": "选答案",
            "text": "六个选项里只有一个是两条规律的交点。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对规律的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "选择错误规律选项的次数；与用时一起看。"
          }
        }
      },
      "professional": {
        "construct": "图形矩阵推理（规则归纳）",
        "procedure": "每题呈现 3×3 图形矩阵（右下角为空）与六个选项；前 8 题来自冻结手写题库（跨 seed 稳定），其余由 session seed 按冻结生成器重建；属性（形状/填充/数量）分别服从恒定、行内推进或行内分配规则；服务端按 seed+index 重建题目并推导正确性。",
        "interpretation": "正确率与用时同读；生成题难度随规则组合波动，未做逐题难度标定；不换算 IQ。",
        "confounders": [
          "策略差异（先行后列 vs 先列后行）影响用时。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、IQ 或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中选对的比例。",
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
            "key": "stimulusSetVersion",
            "label": "生成器版本"
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
    "presentationVersion": "1.0.0",
    "testType": "icarmatrix",
    "engineVersion": "2.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形矩阵推理 · 规则题库版",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：答对的图形矩阵题占全部题目的比例。",
        "singleExplanation": "总体正确率：你答对的比例。"
      },
      "medianRtMs": {
        "label": "作答中位用时"
      },
      "correctCount": {
        "label": "答对题数"
      },
      "accuracyByRuleTag": {
        "label": "规则维度正确率"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [
      "accuracyByRuleTag"
    ],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先横着看每行变了什么，再竖着验证。",
      "规则可能组合：位置、旋转、填充、大小分开看。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价，也不是年龄常模判断。",
    "reportReading": {
      "version": "1.0.0",
      "title": "图形里的规律，你能找到几条？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你答对了 {accuracy} 的图形矩阵题。",
        "metricKeys": [
          "accuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你答对了 {accuracy}；体验版仅供体验。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "correctCount"
      ],
      "processMetricKeys": [
        "medianRtMs"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "excessiveTimeouts",
        "rapidGuessing"
      ],
      "metricGates": {},
      "nextStep": "找规律的能力可以通过图形游戏、折纸、拼图这类活动自然练习。",
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
        "concept": "每个题目都是一张 3×3（或 2×2）的图形表格，右下角缺了一块。图形在行和列上按规律变化——形状在换、方向在转、颜色深浅在变。你要做的，就是找出规律，从选项里挑出缺失的那一块。",
        "takeaway": "先看行、再看列；一次只追一种变化，规则是可以叠起来的。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "发现两串脚步声的间隔规律、看出日历数字的排列规律、理解表格数据的行列关系，用的都是同一种「找规律」的思维。它只是推理能力的一个侧面。",
        "scene": "rules",
        "frames": [
          {
            "title": "看行",
            "text": "从左到右，什么在变？"
          },
          {
            "title": "看列",
            "text": "从上到下，规律还成立吗？"
          },
          {
            "title": "选出缺失块",
            "text": "用你发现的规律挑出右下角缺的图。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "答对的比例",
            "explanation": "答对的图形矩阵题占全部题目的比例。"
          },
          "medianRtMs": {
            "label": "用了多久",
            "explanation": "每道题作答时间的代表值；想得久不等于能力弱。"
          }
        }
      },
      "professional": {
        "construct": "流体推理（图形规则归纳）",
        "procedure": "题目取自 matRiks（MIT）离线生成的冻结题库（stimulusSetVersion matgen-bank-v1.0.0）；按 seed 确定性选题并生成选项呈现排序（必含正确项）；matrixType 区分 2x2（儿童轨）与 3x3（青少年/成人轨）；每题限时 timeoutMs。正确性由服务端按题库推导，客户端仅上报呈现序选项与用时。",
        "interpretation": "accuracy 为主要指标；medianRtMs 作描述性参考。规则维度正确率（accuracyByRuleTag）仅用于科研画像，不进入被试报告。注意：相似图形结构的题目难度未必相同（见 MaRs-IB 后续 IRT 研究），规则数不作为难度证据。",
        "confounders": [
          "图形结构相似的题目难度并不必然相同，逐题难度未做本地标定。",
          "屏幕尺寸与触控/鼠标影响作答用时，用时指标跨设备不可直接比较。",
          "本报告不提供经过验证的人口常模，不换算 IQ，不与 Raven/韦氏等价。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "correctCount / totalTrials。",
            "readingHint": "主要指标；儿童轨（2x2）与标准轨（3x3）难度不同，不可混比。"
          },
          "medianRtMs": {
            "definition": "非超时试次作答时间中位数。",
            "readingHint": "描述性参考，不进入主结论。"
          },
          "correctCount": {
            "definition": "服务端判定的正确试次数。",
            "readingHint": "受总题数影响，跨 profile 不可比。"
          },
          "accuracyByRuleTag": {
            "definition": "按题库规则标签（shape/rotate/shade/size/identity）分维度的正确率。",
            "readingHint": "科研画像用；样本不足时波动大。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "matrixType",
            "label": "矩阵规格（2x2/3x3）"
          },
          {
            "key": "stimulusSetVersion",
            "label": "题库版本"
          },
          {
            "key": "timeoutMs",
            "label": "每题限时（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "icarmatrix",
    "engineVersion": "2.1.0",
    "scoringVersion": "1.1.0",
    "title": "项目矩阵推理试测版（七题范围）",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：答对的图形矩阵题占全部题目的比例。",
        "singleExplanation": "总体正确率：你答对的比例。"
      },
      "medianRtMs": {
        "label": "有效作答中位用时",
        "explanation": "排除低于用时下限及中断的已作答题；含正确和错误答案。用时长短不等于能力高低。"
      },
      "correctCount": {
        "label": "答对题数"
      },
      "accuracyByRuleTag": {
        "label": "规则维度正确率"
      },
      "answeredCount": {
        "label": "已作答题数",
        "explanation": "实际选择过选项的题数。"
      },
      "timeoutCount": {
        "label": "未作答题数",
        "explanation": "限时内未选择选项的题数，不等于错误选择。"
      },
      "validRtCount": {
        "label": "有效用时题数",
        "explanation": "进入用时统计的未中断、达到用时下限的作答题数。"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [
      "accuracyByRuleTag"
    ],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先横着看每行变了什么，再竖着验证。",
      "规则可能组合：位置、旋转、填充、大小分开看。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次七题试测范围内的表现。不是原版 ICAR 全套；无年龄常模、IQ、百分位或能力等级。",
    "reportReading": {
      "version": "1.1.0",
      "title": "图形里的规律，你能找到几条？",
      "introduction": "一起看看这次已作答、答对和未作答的情况；这些数字不代表固定能力。",
      "summary": {
        "template": "这一次，你作答了 {answeredCount} 题，答对 {correctCount} 题，另有 {timeoutCount} 题未作答。",
        "metricKeys": [
          "answeredCount",
          "correctCount",
          "timeoutCount"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次四题简短体验中，作答 {answeredCount} 题，答对 {correctCount} 题。短版结果容易波动。",
          "metricKeys": [
            "answeredCount",
            "correctCount"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "correctCount",
        "answeredCount",
        "timeoutCount"
      ],
      "processMetricKeys": [
        "medianRtMs",
        "validRtCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "interrupted",
        "excessiveTimeouts",
        "rapidGuessing"
      ],
      "metricGates": {},
      "nextStep": "可以用拼图、折纸或图形游戏继续练习观察规律。若本次有中断或未作答，先了解当时的操作与环境。",
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
        "concept": "本版每题仅使用3×3图形表格，右下角缺一块。观察形状、方向或填充深浅在行列中的变化，从六个选项中选出缺失图形。它只是一组项目试测题。",
        "takeaway": "先看行、再看列；一次只追一种变化，规则是可以叠起来的。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "发现两串脚步声的间隔规律、看出日历数字的排列规律、理解表格数据的行列关系，用的都是同一种「找规律」的思维。它只是推理能力的一个侧面。",
        "scene": "rules",
        "frames": [
          {
            "title": "看行",
            "text": "从左到右，什么在变？"
          },
          {
            "title": "看列",
            "text": "从上到下，规律还成立吗？"
          },
          {
            "title": "选出缺失块",
            "text": "用你发现的规律挑出右下角缺的图。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "答对的比例",
            "explanation": "答对的图形矩阵题占全部题目的比例。"
          },
          "medianRtMs": {
            "label": "用了多久",
            "explanation": "每道题作答时间的代表值；想得久不等于能力弱。"
          }
        }
      },
      "professional": {
        "construct": "流体推理（图形规则归纳）",
        "procedure": "七道冻结3×3试测题；按seed确定性分层选择4/6/7题，每版均含形状、旋转与填充变化。六个呈现选项的顺序也按seed固定。独立练习通过后才开始正式试次。",
        "interpretation": "准确率分母为实际完整呈现的计划题数，含未作答。未作答与错误选择分别保存；有效用时排除低于本次用时下限及有中断的题目。仅涉及形状、旋转、填充三类简单规则，009必出，不是平行等值形式，不能据规则标签正确率推断稳定子能力。",
        "confounders": [
          "图形结构相似的题目难度并不必然相同，逐题难度未做本地标定。",
          "屏幕尺寸与触控/鼠标影响作答用时，用时指标跨设备不可直接比较。",
          "本报告不提供经过验证的人口常模，不换算 IQ，不与 Raven/韦氏等价。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "答对题数 / 本次计划正式题数。未作答计入分母，练习不计入。",
            "readingHint": "只描述本次题目；不同配置不视为等值或年龄常模。"
          },
          "medianRtMs": {
            "definition": "所有未中断、validRtFloorMs≤rtMs≤timeoutMs的已作答题用时中位数（含错答）；无有效用时为null。",
            "readingHint": "结合有效用时题数阅读；不判断能力高低。"
          },
          "correctCount": {
            "definition": "服务端判定的正确试次数。",
            "readingHint": "受总题数影响，跨 profile 不可比。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "matrixType",
            "label": "矩阵规格（本版仅3×3）"
          },
          {
            "key": "stimulusSetVersion",
            "label": "题库版本"
          },
          {
            "key": "timeoutMs",
            "label": "每题限时（毫秒）"
          }
        ]
      },
      "qualityLabels": {
        "rapidGuessing": "低于用时下限的作答较多",
        "excessiveTimeouts": "未作答较多"
      }
    }
  }
]
