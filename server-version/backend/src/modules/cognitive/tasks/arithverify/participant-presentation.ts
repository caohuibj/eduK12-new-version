import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "arithverify",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "算术验证",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确的试次中，从算式出现到按下对/错的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确的试次中，从算式出现到按下对/错的典型时间。"
      },
      "problemSizeSlopeMs": {
        "label": "问题规模斜率",
        "explanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化；正值代表大数目的算式更费时。",
        "singleExplanation": "问题规模斜率：两数之和每增大 1，正确作答用时的平均变化。"
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
    experienceHeadline: "accuracy",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["先算结果，再和给出的数比较；保持稳定节奏比抢快更重要。", "个位加法越熟练，判断越快；多练习能缩短反应时间。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次加法等式验证的表现，不是数学能力、计算水平或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "这些算式，你判得又准又快吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你判断对了 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你判断对了 {accuracy}；正式版会给出用时与规模效应的完整记录。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "problemSizeSlopeMs"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"],
        "problemSizeSlopeMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；正确率过低时，用时指标需要谨慎解释。",
      chart: {
        "kind": "reaction_trials",
        "metricKeys": ["medianRtMs"]
      },
      caveatTerms: {
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
      illustration: "rules",
      popular: {
        conceptTitle: "先弄懂，这个任务在看什么",
        concept: "心算像一条小流水线：读式子、算结果、比对给出的数、再出手。这个任务记录每个环节合起来有多准、多快，还能看到算式变大时用时怎么变。",
        takeaway: "熟练来自准确优先：先求对，再求快。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "核对小票金额、检查考勤天数、估算购物花费，都需要又快又准的加法判断。这只反映计算熟练度的一小部分，不代表数学能力的全貌。",
        scene: "rules",
        frames: [
          {
            "title": "读式子",
            "text": "看清两个加数和给出的结果。"
          },
          {
            "title": "算一算",
            "text": "在心里把两个数相加。"
          },
          {
            "title": "判对错",
            "text": "一致按对，不一致按错。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是考试排名、升学依据或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确的试次中，从算式出现到作答的典型时间。"
          },
          "problemSizeSlopeMs": {
            "label": "数变大时慢多少",
            "explanation": "两数之和每增大 1，用时的平均变化；正值代表大算式更费时。"
          }
        }
      },
      professional: {
        construct: "加法等式验证的计算流畅度",
        procedure: "逐试次呈现 a+b=c，服务端由操作数推导等式真伪；正确率与正确有效 RT（rtMs ≥ validRtFloorMs）为主要指标，问题规模斜率为正确有效 RT 对操作数之和的线性回归斜率。",
        interpretation: "正确率过低时用时指标需谨慎解释；斜率为有符号量，受策略（精算/估算）与试次规模分布影响，不单独作为能力等级。",
        confounders: [
          "设备与输入方式、显示延迟会影响用时记录。",
          "策略差异（直接提取 vs 逐位累加）改变用时结构。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。"
        ],
        metricNotes: {
          "accuracy": {
            "definition": "正确率：正式作答中判断（含真伪两个方向）正确的比例。",
            "readingHint": "配合有效 RT 数与质量标记阅读。"
          },
          "medianRtMs": {
            "definition": "正确有效反应（rtMs ≥ validRtFloorMs）的中位时间。",
            "readingHint": "与正确率同读；速度—准确率权衡会改变解释。"
          },
          "problemSizeSlopeMs": {
            "definition": "正确有效 RT 对 leftOperand+rightOperand 的 OLS 斜率；有效点或不同规模不足时为 null。",
            "readingHint": "有符号量；仅描述本次任务内用时随规模的变化趋势。"
          },
          "errorCount": {
            "definition": "按本次冻结任务定义记录“错误次数”。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时正确率解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "operandMax",
            "label": "操作数上限"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  },
]
