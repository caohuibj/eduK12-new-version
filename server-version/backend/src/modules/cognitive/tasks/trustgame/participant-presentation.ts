import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "trustgame",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "信任与公平博弈",
    metrics: {
      "acceptanceRate": {
        "label": "总体接受率",
        "explanation": "总体接受率：全部有效轮次中选择接受的比例。",
        "singleExplanation": "总体接受率：全部有效轮次中选择接受的比例。"
      },
      "unfairAcceptanceRate": {
        "label": "不公平提议接受率",
        "explanation": "不公平提议接受率：分给自己的份额不足一半（不公平）的轮次中，选择接受的比例；越低代表越愿意拒绝不公平。",
        "singleExplanation": "不公平提议接受率：不公平轮次中选择接受的比例。"
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
      version: "1.0.0",
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
      nextStep: "先看总体接受率，再对照不公平提议的接受率；两者差异越大，说明你对公平越敏感。",
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
        concept: "每轮有一位匿名同伴把一笔点数分成两份：一份给你、一份留给自己。你可以接受（按方案分），也可以拒绝（双方都得零）。什么时候忍下不公平、什么时候宁可两败俱伤，就是这次想记录的取舍。",
        takeaway: "接受还是拒绝，都是你公平感的表达。",
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
            "explanation": "全部有效轮次中选择接受的比例。"
          },
          "unfairAcceptanceRate": {
            "label": "不公平时接受了多少",
            "explanation": "分给自己的份额不足一半时，选择接受的比例。"
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
        interpretation: "全部指标为描述性偏好量；不公平接受率越低代表惩罚意愿越强，但受轮次数与提议分布影响；本任务不设能力分数，不做品德或人格推断。",
        confounders: [
          "点数/虚拟资源与真实资源的拒绝意愿可能不同。",
          "没有真实交互对象时更接近一般公平态度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。"
        ],
        metricNotes: {
          "acceptanceRate": {
            "definition": "选择接受的轮次 / 有效响应轮次。",
            "readingHint": "描述性偏好量，无好坏方向。"
          },
          "unfairAcceptanceRate": {
            "definition": "不公平提议（响应者份额 < 总额一半）中被接受的比例；无不公平提议时为 null。",
            "readingHint": "与总体接受率对照阅读。"
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
