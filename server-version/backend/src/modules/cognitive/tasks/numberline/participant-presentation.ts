import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "numberline",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "数字线估计",
    metrics: {
      "paePercent": {
        "label": "平均绝对误差",
        "explanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示，越小越贴近目标。",
        "singleExplanation": "平均绝对误差：你点的位置和正确位置平均差多远，用整条线段长度的比例表示。"
      },
      "biasPercent": {
        "label": "方向偏差",
        "explanation": "方向偏差：整体上你倾向于把数点得偏大还是偏小；正值代表普遍偏右（偏大），负值代表普遍偏左（偏小），接近 0 表示整体不偏不倚。",
        "singleExplanation": "方向偏差：整体上你倾向于把数点得偏大还是偏小。"
      },
      "withinTenRate": {
        "label": "十格命中率",
        "explanation": "十格命中率：你的作答落在目标数附近十分之一线段范围内的比例。",
        "singleExplanation": "十格命中率：你的作答落在目标数附近十分之一线段范围内的比例。"
      },
      "medianRtMs": {
        "label": "作答用时中位数",
        "explanation": "作答用时中位数：有效作答中，从出现数字到点击线段所用的典型时间。",
        "singleExplanation": "作答用时中位数：从出现数字到点击线段所用的典型时间。"
      },
      "validTrialCount": {
        "label": "有效试次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      }
    },
    experienceHeadline: "paePercent",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["估计位置时，先想清楚这个数和 0、中点、最大值的关系，再作答。", "数字越大不代表越难，试着把线段均匀分段来定位。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次数字线上的估计表现，不是数学能力、计算水平或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "你眼中的数轴，数住在哪里？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的点平均偏离目标 {paePercent}；整体方向偏差为 {biasPercent}。",
        metricKeys: ["paePercent", "biasPercent"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的点平均偏离目标 {paePercent}；正式版会给出更稳的方向偏差。",
          metricKeys: ["paePercent"]
        }
      },
      studentMetricKeys: ["paePercent", "withinTenRate", "biasPercent"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidTrials", "excessiveTimeouts"],
      metricGates: {
        "biasPercent": ["insufficientValidTrials"]
      },
      nextStep: "先看平均误差，再看是整体偏大还是偏小；方向偏差只是一个整体趋势，不代表每次都偏。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["paePercent", "biasPercent"]
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
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      illustration: "sequence",
      popular: {
        conceptTitle: "先弄懂，这个任务在看什么",
        concept: "每个数在数轴上都有自己的家。比如 37 应该住在从 0 出发大约三分之一多一点的地方。这个任务想看看，你把数送回家时，有多准、有多稳。",
        takeaway: "把线段均匀分段，是估计高手的常用妙招。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "看地图估距离、分蛋糕估大小、看温度计猜刻度，都用到同样的本领：把一段长度和数量对应起来。这只是数学本领的一小部分，不代表你的全部数学能力。",
        scene: "sequence",
        frames: [
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
        boundary: "这是理解概念的场景示例，不是考试排名、升学依据或同龄人比较。",
        metricHelp: {
          "paePercent": {
            "label": "平均差多远",
            "explanation": "所有作答离正确位置的平均距离，越小越准。"
          },
          "biasPercent": {
            "label": "整体偏哪边",
            "explanation": "整体上偏大还是偏小；接近 0 说明整体不偏。"
          },
          "withinTenRate": {
            "label": "十格命中率",
            "explanation": "作答落在目标附近十分之一线段内的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "从出现数字到点击线段的典型用时；想清楚再点比抢快更重要。"
          }
        }
      },
      professional: {
        construct: "0-N 数字线上的数值位置估计",
        procedure: "每试次呈现目标数与 0..lineMax 数字线，记录点击位置比例并换算为估计值；PAE 为绝对误差占线段总长的平均比例，方向偏差为有符号误差的平均比例。",
        interpretation: "PAE 越低表示估计越贴近目标；方向偏差需连同 PAE 阅读，正值代表整体右偏。样本内跨试次差异与点击精度影响解释边界，本报告不提供常模或诊断。",
        confounders: [
          "设备屏幕宽度、触控或鼠标点击精度会影响位置记录。",
          "作答中断、超时和有效试次数影响误差估计的稳定性。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或学业成绩预测。"
        ],
        metricNotes: {
          "paePercent": {
            "definition": "平均绝对误差：|估计值 − 目标数| 占线段总长比例的均值，估计值 = 点击位置比例 × lineMax。",
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
        configFields: [
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
]
