import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "lineangle",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "线条方向判断",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选中与目标方向一致选项的比例。",
        "singleExplanation": "总体正确率：正式作答中选中与目标方向一致选项的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确的试次中，从出现线段到选择的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确的试次中，从出现线段到选择的典型时间。"
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
    practicalTips: ["先看目标线段斜向哪边，再逐个对比选项。", "角度很接近时，注意线段与水平方向的夹角大小。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次线段方向匹配的表现，不是空间能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "这两条线，方向一样吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你选中正确方向的比例是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你选中正确方向的比例是 {accuracy}；正式版会给出更稳的用时记录。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "errorCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；这是知觉匹配任务，与空间想象是不同的本领。",
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
        concept: "上面有一条目标线段，下面有几条朝向不同的选项线段。你要挑出和目标完全平行的那一条。这里看的是眼睛分辨方向差异的本领——一种基础的视空间知觉。",
        takeaway: "先定斜向，再比角度。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "看地图上的道路走向、对齐家具摆放、辨认图表里的趋势线，都用到了方向分辨。它只是空间能力的一小部分，不代表你的数学或绘画能力。",
        scene: "signal",
        frames: [
          {
            "title": "看目标",
            "text": "注意目标线段斜向哪边、角度多大。"
          },
          {
            "title": "比选项",
            "text": "逐个对比选项与目标是否平行。"
          },
          {
            "title": "做选择",
            "text": "选出方向完全一致的那条。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "选对了多少",
            "explanation": "正式作答中选中与目标一致选项的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确的试次中从出现线段到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "选中其他方向的次数；与用时一起看。"
          }
        }
      },
      professional: {
        construct: "线段朝向的知觉匹配",
        procedure: "逐试次呈现目标线段与 optionCount 条朝向不同的选项线段（角度池为 angleStepDeg 步进的 0..180°）；服务端校验目标在选项中恰好出现一次且选项互异；正确性由目标角度推导；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "正确率与用时同读；角度步长与选项数由 frozen config 决定，跨 config 不可比。本任务为知觉匹配，不测空间想象或心理旋转。",
        confounders: [
          "设备屏幕比例、线段渲染宽度影响角度感知。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        metricNotes: {
          "accuracy": {
            "definition": "正确率：正式作答中选中目标角度的比例。",
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
            "key": "angleStepDeg",
            "label": "角度步长（度）"
          },
          {
            "key": "optionCount",
            "label": "选项数量"
          }
        ]
      }
    }
  },
]
