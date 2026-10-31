import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.1",
    testType: "trustgame",
    engineVersion: "1.0.1",
    scoringVersion: "1.0.0",
    title: "信任与公平博弈",
    metrics: {
      "acceptanceRate": {
        "label": "总体接受率",
        "explanation": "总体接受率：有明确接受或拒绝回应的轮次中，选择接受的比例；未回应轮次不进入这个分母。",
        "singleExplanation": "总体接受率：有明确接受或拒绝回应的轮次中，选择接受的比例；未回应轮次不进入这个分母。"
      },
      "unfairAcceptanceRate": {
        "label": "不公平提议接受率",
        "explanation": "不足一半提议接受率：分给自己的份额不足一半的全部计划轮次中，选择接受的比例。这个分母包含未回应轮次，因此数值较低不等于更愿意拒绝。",
        "singleExplanation": "不足一半提议接受率：此类全部计划轮次中接受的比例，包含未回应；不等于拒绝意愿。"
      },
      "rejectedUnfairCount": {
        "label": "拒绝不公平提议数"
      },
      "fairOfferCount": {
        "label": "公平提议轮数"
      },
      "medianDecisionMs": {
        "label": "决策用时中位数"
      }
    },
    experienceHeadline: "unfairAcceptanceRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["没有对错：按你真实的取舍选择即可。", "拒绝意味着双方都拿不到，想一想何时值得。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次响应者决策的选择分布，是偏好描述而非品德、人格或能力判断。",
    reportReading: {
      version: "1.0.1",
      title: "不公平的分法，你会接受吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你接受了 {acceptanceRate} 的提议；面对不公平提议时的接受率是 {unfairAcceptanceRate}。",
        metricKeys: ["acceptanceRate", "unfairAcceptanceRate"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你接受了 {acceptanceRate} 的提议；体验版轮次少，仅供体验。",
          metricKeys: ["acceptanceRate"]
        }
      },
      studentMetricKeys: ["acceptanceRate", "unfairAcceptanceRate", "rejectedUnfairCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "noResponses"],
      metricGates: {
        "unfairAcceptanceRate": ["noResponses"]
      },
      nextStep: "先回想你作决定时考虑了什么，再看不同方案下的选择。两个接受率的分母不同，不能把差值当成公平敏感度；接受和拒绝都没有标准答案。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["acceptanceRate", "unfairAcceptanceRate"]
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
        concept: "每轮呈现一个预设的模拟点数方案：一份给你、一份留给对方。这里没有实时同伴或真实点数交易。你可以接受（按方案分），也可以拒绝（双方都得零）。本次只记录你面对这些模拟方案时的取舍，不把选择归类成好坏。",
        takeaway: "接受或拒绝都可以，重要的是理解方案后作出自己的选择。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "小组分工不均时的沟通、遇到不合理规则时的取舍，都涉及“要不要为了公平承担代价”。这只是决策偏好的记录，不代表你的品德或人缘。",
        scene: "rules",
        frames: [
          {
            "title": "看方案",
            "text": "同伴提出分你多少。"
          },
          {
            "title": "做决定",
            "text": "接受就按方案分，拒绝双方得零。"
          },
          {
            "title": "看分布",
            "text": "多轮选择汇成公平感记录。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是品德评价、人格测验或同龄人排名。",
        metricHelp: {
          "acceptanceRate": {
            "label": "总体接受了多少",
            "explanation": "有明确接受或拒绝回应的轮次中，选择接受的比例。"
          },
          "unfairAcceptanceRate": {
            "label": "不公平时接受了多少",
            "explanation": "分给自己的份额不足一半的全部计划轮次中接受的比例，包含未回应轮次；不等于拒绝意愿。"
          },
          "rejectedUnfairCount": {
            "label": "拒绝了几次不公平",
            "explanation": "不公平提议中被拒绝的轮次数。"
          }
        }
      },
      professional: {
        construct: "最后通牒博弈响应者决策（公平感知与惩罚意愿）",
        procedure: "每轮提议（分给响应者的份额）随 config 冻结；公平提议定义为响应者份额 ≥ 总额一半；服务端按提议推导公平性并计算接受率、不公平接受率与拒绝数。",
        interpretation: "全部指标为描述性偏好量；不足一半提议接受率包含未回应轮次，较低值不能区分拒绝与未回应；两个接受率分母不同，且中断响应仍进入当前指标；本任务不设能力分数，不做品德或人格推断。",
        confounders: [
          "点数/虚拟资源与真实资源的拒绝意愿可能不同。",
          "没有真实交互对象时更接近一般公平态度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。"
        ],
        metricNotes: {
          "acceptanceRate": {
            "definition": "选择接受的轮次 / 有明确接受或拒绝回应的轮次；当前计分未排除标记为中断的回应。",
            "readingHint": "描述性偏好量，无好坏方向。"
          },
          "unfairAcceptanceRate": {
            "definition": "不足一半提议中接受的轮次 / 全部不足一半提议轮次，包含未回应；无此类提议时为 null。",
            "readingHint": "与总体接受率分母不同，不能将差值推断为公平敏感度。"
          },
          "rejectedUnfairCount": {
            "definition": "不公平提议中被拒绝的轮次数。",
            "readingHint": "受不公平提议轮次数影响。"
          },
          "fairOfferCount": {
            "definition": "本轮任务中公平提议的轮次数（由冻结提议序列决定）。",
            "readingHint": "常量，用于解释分母。"
          },
          "medianDecisionMs": {
            "definition": "有效响应的决策用时中位数。",
            "readingHint": "仅作描述。"
          }
        },
        configFields: [
          {
            "key": "offers",
            "label": "各轮提议（分给响应者）"
          },
          {
            "key": "potTotal",
            "label": "每轮总额"
          },
          {
            "key": "timeoutMs",
            "label": "单轮时限（毫秒）"
          }
        ]
      }
    }
  },
]
