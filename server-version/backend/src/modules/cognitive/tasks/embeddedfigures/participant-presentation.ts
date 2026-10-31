import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "embeddedfigures",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "嵌入图形",
    metrics: {
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
    experienceHeadline: "accuracy",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["先记住目标的形状和大小，再在复杂图形里排除明显不像的。", "顶点数量是关键：目标永远是三角形。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次隐藏图形查找表现，不是空间能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "复杂图形里，藏着你的目标",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的查找正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的查找正确率是 {accuracy}；体验版仅供体验。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "errorCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；干扰越多越慢是正常现象，不代表能力低。",
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
      illustration: "signal",
      popular: {
        conceptTitle: "先弄懂，这个任务在看什么",
        concept: "先给你看一个简单的三角形，然后它“藏”进了一堆复杂的图形里。你的任务是把它点出来——不管它被多少干扰包围。这个任务看的是你的知觉系统在干扰里保持简单形状的本领。",
        takeaway: "心里装着目标，干扰就只是背景。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "在人堆里找朋友、在草稿纸的涂改里找回原来那行字、在杂乱图表里找一条曲线，都是“在复杂场里保持目标形状”。它只是知觉能力的一小部分，不代表你的智力或观察力全貌。",
        scene: "signal",
        frames: [
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
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
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
      professional: {
        construct: "嵌入图形知觉（场独立性）",
        procedure: "每题先呈现目标三角形 showTargetMs，随后呈现含 7 个多边形（1 三角目标 + 四/五边形干扰）的复杂场；参与者点击目标；服务端按 seed+index 重建几何并推导正确性；题源双轨：前 4 题冻结题库，其余 seed 生成。",
        interpretation: "正确率与用时同读；点击命中为顶层面板，重叠区域可能命中干扰项；生成题干扰相似度未逐题标定。",
        confounders: [
          "显示尺寸与指针精度影响命中判定。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        metricNotes: {
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
        configFields: [
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
]
