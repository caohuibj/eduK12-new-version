import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "icarmatrix",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "图形矩阵推理",
    metrics: {
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
    experienceHeadline: "accuracy",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["先横着看每行缺什么，再竖着验证规律。", "属性可能同时变化：形状、填充、数量分开来看。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次图形矩阵推理的表现，正确率不换算 IQ、不与 Raven 等价，也不是年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "图形的规律，你能找出来吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的矩阵推理正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的矩阵推理正确率是 {accuracy}；体验版只含固定题库，仅供体验。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "errorCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；不换算 IQ，只描述这一次的推理过程。",
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
        concept: "一个 3×3 的图形方格，右下角空着。每一行、每一列都藏着规律——形状在变、填充在变、个数也在变。你要从六个选项里找出属于空格的那一个。这个任务看的是从多个变化中归纳出规则的能力。",
        takeaway: "横着找一行，竖着验一遍。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "看出数列的规律、预测趋势、排查机器故障的变化模式，都是同一类归纳推理。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        scene: "rules",
        frames: [
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
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
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
      professional: {
        construct: "图形矩阵推理（规则归纳）",
        procedure: "每题呈现 3×3 图形矩阵（右下角为空）与六个选项；前 8 题来自冻结手写题库（跨 seed 稳定），其余由 session seed 按冻结生成器重建；属性（形状/填充/数量）分别服从恒定、行内推进或行内分配规则；服务端按 seed+index 重建题目并推导正确性。",
        interpretation: "正确率与用时同读；生成题难度随规则组合波动，未做逐题难度标定；不换算 IQ。",
        confounders: [
          "策略差异（先行后列 vs 先列后行）影响用时。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、IQ 或智力等级结论。"
        ],
        metricNotes: {
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
        configFields: [
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
]
