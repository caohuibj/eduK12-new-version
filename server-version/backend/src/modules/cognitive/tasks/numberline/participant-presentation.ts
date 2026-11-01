import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "numberline",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "数字线估计",
    "metrics": {
      "paePercent": {
        "label": "平均绝对误差",
        "explanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示，越小越贴近目标。",
        "singleExplanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示。"
      },
      "biasPercent": {
        "label": "方向偏差",
        "explanation": "方向偏差：本次有位置回应的试次中，正值表示平均偏右（偏大），负值表示平均偏左（偏小）；接近 0 也可能是左右偏差互相抵消，要和平均绝对误差一起看。",
        "singleExplanation": "方向偏差：整体上你倾向于把数点得偏大还是偏小。"
      },
      "withinTenRate": {
        "label": "十格命中率",
        "explanation": "十格命中率：有位置回应的试次中，位置误差不超过整条线段长度10%的比例，边界也计入。",
        "singleExplanation": "十格命中率：有位置回应的试次中，位置误差不超过整条线段长度10%的比例，边界也计入。"
      },
      "medianRtMs": {
        "label": "作答用时中位数",
        "explanation": "作答用时中位数：纳入用时统计的回应中，从出现数字到选定位置所用的典型时间。",
        "singleExplanation": "作答用时中位数：纳入统计的回应中，从出现数字到选定位置的典型时间。"
      },
      "validTrialCount": {
        "label": "有效试次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      }
    },
    "experienceHeadline": "paePercent",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "估计位置时，先想清楚这个数和 0、中点、最大值的关系，再作答。",
      "数字越大不代表越难，试着把线段均匀分段来定位。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次数字线上的估计表现，不是数学能力、计算水平或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "你眼中的数轴，数住在哪里？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的点平均偏离目标 {paePercent}；整体方向偏差为 {biasPercent}。",
        "metricKeys": [
          "paePercent",
          "biasPercent"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，有位置回应的试次平均偏离目标 {paePercent}；试次较少，先把它作为本次记录。",
          "metricKeys": [
            "paePercent"
          ]
        }
      },
      "studentMetricKeys": [
        "paePercent",
        "withinTenRate",
        "biasPercent"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials",
        "excessiveTimeouts"
      ],
      "metricGates": {
        "biasPercent": [
          "insufficientValidTrials"
        ]
      },
      "nextStep": "先看平均误差，再看方向偏差；想一想，你是否借助了端点、中点或四分之一位置？下次可先选一个参照点，再判断目标离它多远。方向偏差接近0不代表每题都准确。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "paePercent",
          "biasPercent"
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
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "每个数在数轴上都有对应的位置。比如在0到100的数轴上，37位于三分之一再往右一点。这个任务记录你这次把数字放在什么位置，以及与目标相差多远。",
        "takeaway": "可以试着用端点、中点和四分之一位置作参照，检查自己的估计。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "看地图估距离、分蛋糕估大小、看温度计猜刻度，都用到同样的本领：把一段长度和数量对应起来。这只是数学本领的一小部分，不代表你的全部数学能力。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看数字",
            "text": "先读清要找的目标数。"
          },
          {
            "title": "想位置",
            "text": "想想它离 0、离中点、离最大值有多远。"
          },
          {
            "title": "点位置",
            "text": "在线上点出你的答案。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是考试排名、升学依据或同龄人比较。",
        "metricHelp": {
          "paePercent": {
            "label": "平均差多远",
            "explanation": "有位置回应的试次离正确位置的平均距离，占整条线段的比例；越小越贴近目标，超时未回应不计入这个均值。"
          },
          "biasPercent": {
            "label": "整体偏哪边",
            "explanation": "本次平均偏大还是偏小；左右偏差可能互相抵消，接近0也要结合平均误差阅读。"
          },
          "withinTenRate": {
            "label": "十格命中率",
            "explanation": "有位置回应的试次中，误差不超过整条线段10%的比例；不是及格率。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "纳入统计的回应中，从出现数字到选定位置的典型用时；请与位置误差一起看。"
          }
        }
      },
      "professional": {
        "construct": "0-N 数字线上的数值位置估计",
        "procedure": "每试次呈现目标数与 0..lineMax 数字线，记录点击位置比例并换算为估计值；PAE 为绝对误差占线段总长的平均比例，方向偏差为有符号误差的平均比例。",
        "interpretation": "PAE 越低表示估计越贴近目标；方向偏差需连同 PAE 阅读，正值代表整体右偏。样本内跨试次差异与点击精度影响解释边界，本报告不提供常模或诊断。",
        "confounders": [
          "设备屏幕宽度、触控或鼠标点击精度会影响位置记录。",
          "作答中断、超时和有效试次数影响误差估计的稳定性。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。"
        ],
        "metricNotes": {
          "paePercent": {
            "definition": "平均绝对误差：仅对有位置回应的试次，计算|估计值 − 目标数|占线段总长比例的均值；估计值 = 回应位置比例 × lineMax，超时未回应不进入分母。",
            "readingHint": "越低越贴近目标；有效试次不足时谨慎解释。"
          },
          "biasPercent": {
            "definition": "方向偏差：(估计值 − 目标数) 占线段总长比例的均值，正值代表整体右偏。",
            "readingHint": "有符号量，需与 PAE 同读；不代表每个试次都偏。"
          },
          "withinTenRate": {
            "definition": "估计误差不超过线段长度 10% 的试次比例。",
            "readingHint": "描述本次任务内的粗略命中率，不是及格线。"
          },
          "medianRtMs": {
            "definition": "有效作答（rtMs ≥ validRtFloorMs）的反应时中位数。",
            "readingHint": "与 PAE 同读；速度与准确率的权衡会改变解释。"
          },
          "validTrialCount": {
            "definition": "按本次冻结任务定义记录“有效试次数”。",
            "readingHint": "与计划试次总数对照阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时误差指标需谨慎解释。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "lineMax",
            "label": "数字线上限"
          },
          {
            "key": "maxResponseMs",
            "label": "单试次时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "numberline",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "数字在线上哪里",
    "metrics": {
      "paePercent": {
        "label": "平均偏离整条线多远",
        "explanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示，越小越贴近目标。",
        "singleExplanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示。"
      },
      "biasPercent": {
        "label": "整体偏左还是偏右",
        "explanation": "方向偏差：本次有位置回应的试次中，正值表示平均偏右（偏大），负值表示平均偏左（偏小）；接近 0 也可能是左右偏差互相抵消，要和平均绝对误差一起看。",
        "singleExplanation": "方向偏差：整体上你倾向于把数点得偏大还是偏小。"
      },
      "withinTenRate": {
        "label": "落在目标附近的比例",
        "explanation": "十格命中率：有位置回应的试次中，位置误差不超过整条线段长度10%的比例，边界也计入。",
        "singleExplanation": "十格命中率：有位置回应的试次中，位置误差不超过整条线段长度10%的比例，边界也计入。"
      },
      "medianRtMs": {
        "label": "选定位置的通常用时",
        "explanation": "作答用时中位数：纳入用时统计的回应中，从出现数字到选定位置所用的典型时间。",
        "singleExplanation": "作答用时中位数：纳入统计的回应中，从出现数字到选定位置的典型时间。"
      },
      "validTrialCount": {
        "label": "有位置回应的题数"
      },
      "timeoutCount": {
        "label": "超时次数"
      }
    },
    "experienceHeadline": "paePercent",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次数字在线上哪里的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "正式8题、练习1题最多2次，配置估计约2分钟（未实测）；只报告点位误差与回应数量。",
          "体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。"
        ]
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次数字在线上哪里的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次数字在线上哪里的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      }
    },
    "practicalTips": [
      "可用端点、中点或四分之一位置帮助定位。下次比较时保持同一数值范围与屏幕，别把短体验的几次点位当作完整数学评价。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "给数字找一个合适的位置",
      "introduction": "0和100之间，37会住在哪里？先找端点或中点作参照，再点出你估计的位置。这里只记录这次点位离目标有多远。",
      "summary": {
        "template": "这一次，你的点平均偏离目标 {paePercent}；整体方向偏差为 {biasPercent}。",
        "metricKeys": [
          "paePercent",
          "biasPercent"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次简短体验中，有位置回应的试次平均偏离目标 {paePercent}；试次较少，先把它作为本次记录。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "paePercent"
          ]
        }
      },
      "studentMetricKeys": [
        "paePercent",
        "withinTenRate",
        "biasPercent"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials",
        "excessiveTimeouts"
      ],
      "metricGates": {
        "biasPercent": [
          "insufficientValidTrials"
        ]
      },
      "nextStep": "可用端点、中点或四分之一位置帮助定位。下次比较时保持同一数值范围与屏幕，别把短体验的几次点位当作完整数学评价。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "paePercent",
          "biasPercent"
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
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "把数字和线段上的位置对应起来。平均偏离量按整条线长计算；整体偏左/偏右可能互相抵消，方向平均值接近0不代表每一题都准确。",
        "takeaway": "先看有位置回应的题数与平均偏离量，再看偏哪边。超时没点的位置不会被编成0误差。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "看温度计刻度或估地图上一段路的位置时，也会用到参照点。这个例子帮助理解数量与位置，不代表任务已经验证了日常数学能力。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看数字",
            "text": "先读清要找的目标数。"
          },
          {
            "title": "想位置",
            "text": "想想它离 0、离中点、离最大值有多远。"
          },
          {
            "title": "点位置",
            "text": "在线上点出你的答案。"
          }
        ],
        "boundary": "体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。",
        "metricHelp": {
          "paePercent": {
            "label": "平均偏离整条线多远",
            "explanation": "有位置回应的试次离正确位置的平均距离，占整条线段的比例；越小越贴近目标，超时未回应不计入这个均值。"
          },
          "biasPercent": {
            "label": "整体偏左还是偏右",
            "explanation": "本次平均偏大还是偏小；左右偏差可能互相抵消，接近0也要结合平均误差阅读。"
          },
          "withinTenRate": {
            "label": "落在目标附近的比例",
            "explanation": "有位置回应的试次中，误差不超过整条线段10%的比例；不是及格率。"
          },
          "medianRtMs": {
            "label": "选定位置的通常用时",
            "explanation": "纳入统计的回应中，从出现数字到选定位置的典型用时；请与位置误差一起看。"
          },
          "validTrialCount": {
            "label": "有位置回应的题数",
            "explanation": "有位置回应的题数"
          }
        }
      },
      "professional": {
        "construct": "0-N 数字线上的数值位置估计",
        "procedure": "每试次呈现目标数与 0..lineMax 数字线，记录点击位置比例并换算为估计值；PAE 为绝对误差占线段总长的平均比例，方向偏差为有符号误差的平均比例。 方法与文献核对：研究档40题、0–100线段，每题400毫秒准备、最多10秒定位；各区间随机整数后种子洗牌，练习目标37并有反馈。Siegler与Opfer(2003), DOI 10.1111/1467-9280.02438提供数值估计范式；本项目用点击与分层生成、自定题量，不做原研究年龄组/表征模型检验。原文全文链接失效，本轮仅核摘要与作者书目，不宣称原题量/练习/时序一致。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。",
        "confounders": [
          "设备屏幕宽度、触控或鼠标点击精度会影响位置记录。",
          "作答中断、超时和有效试次数影响误差估计的稳定性。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "paePercent": {
            "definition": "平均绝对误差：仅对有位置回应的试次，计算|估计值 − 目标数|占线段总长比例的均值；估计值 = 回应位置比例 × lineMax，超时未回应不进入分母。",
            "readingHint": "越低越贴近目标；有效试次不足时谨慎解释。"
          },
          "biasPercent": {
            "definition": "方向偏差：(估计值 − 目标数) 占线段总长比例的均值，正值代表整体右偏。",
            "readingHint": "有符号量，需与 PAE 同读；不代表每个试次都偏。"
          },
          "withinTenRate": {
            "definition": "估计误差不超过线段长度 10% 的试次比例。",
            "readingHint": "描述本次任务内的粗略命中率，不是及格线。"
          },
          "medianRtMs": {
            "definition": "有效作答（rtMs ≥ validRtFloorMs）的反应时中位数。",
            "readingHint": "与 PAE 同读；速度与准确率的权衡会改变解释。"
          },
          "validTrialCount": {
            "definition": "按本次冻结任务定义记录“有效试次数”。",
            "readingHint": "与计划试次总数对照阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时误差指标需谨慎解释。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式题数/轮数"
          },
          {
            "key": "lineMax",
            "label": "数轴右端数值"
          },
          {
            "key": "maxResponseMs",
            "label": "每题定位上限（毫秒）"
          },
          {
            "key": "validRtFloorMs",
            "label": "纳入用时统计的最短时间（毫秒）"
          }
        ]
      }
    }
  }
]
