import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "sharegame",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "分享决策",
    metrics: {
      "givingRate": {
        "label": "给出比例",
        "explanation": "给出比例：全部轮次中，分给同伴的点数占总额的比例。",
        "singleExplanation": "给出比例：分给同伴的点数占总额的比例。"
      },
      "equalSplitCount": {
        "label": "对半分轮数",
        "explanation": "对半分轮数：你选择正好对半分的轮次数。",
        "singleExplanation": "对半分轮数：选择正好对半分的轮次数。"
      },
      "generousRate": {
        "label": "对半及以上比例",
        "explanation": "对半及以上比例：分出一半或更多的轮次占比。",
        "singleExplanation": "对半及以上比例：分出一半或更多的轮次占比。"
      },
      "givingRateSd": {
        "label": "给出比例波动",
        "explanation": "给出比例波动：各轮给出比例的标准差，越小越一致。",
        "singleExplanation": "给出比例波动：各轮给出比例的差异程度。"
      },
      "medianDecisionMs": {
        "label": "决策用时中位数"
      }
    },
    experienceHeadline: "givingRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["没有对错：按你真实的分配习惯选择即可。", "不同轮次的金额不同，先看清楚本轮总额。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次分享决策的选择分布，是偏好描述而非品德、人格或能力判断。",
    reportReading: {
      version: "1.0.0",
      title: "一笔可以自由分配的点数，你会怎么分？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你平均分出 {givingRate}；其中 {generousRate} 的轮次给了一半或更多。",
        metricKeys: ["givingRate", "generousRate"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你平均分出 {givingRate}；体验版轮次少，只作演示。",
          metricKeys: ["givingRate"]
        }
      },
      studentMetricKeys: ["givingRate", "generousRate", "equalSplitCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable"],
      metricGates: {},
      nextStep: "先看给出比例，再结合波动幅度理解一致性；这是偏好记录，没有好坏评分。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["givingRate", "generousRate"]
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
        concept: "每轮你拿到一笔点数，可以完全自留，也可以分一部分给一位看不到名字的同伴——对方无法回报你。你怎么分，就是这次想记录的分配偏好。",
        takeaway: "分享没有标准答案，一致性比数字更重要。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "班费分摊、小组分工的利益分配、抽奖后与朋友分享奖品，都涉及自由分配。这里只是把这种选择放在了一个小场景里，不代表你的品德或人缘。",
        scene: "rules",
        frames: [
          {
            "title": "看本轮总额",
            "text": "每轮的总额可能不同。"
          },
          {
            "title": "做分配",
            "text": "决定给同伴多少、自己留多少。"
          },
          {
            "title": "看分布",
            "text": "多轮选择汇成分配偏好记录。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是品德评价、人格测验或同龄人排名。",
        metricHelp: {
          "givingRate": {
            "label": "平均分出多少",
            "explanation": "分给同伴的点数占总额的比例。"
          },
          "generousRate": {
            "label": "给一半以上的轮次",
            "explanation": "分出一半或更多的轮次占比。"
          },
          "equalSplitCount": {
            "label": "对半分的轮数",
            "explanation": "选择正好对半分的轮次数。"
          },
          "givingRateSd": {
            "label": "选择是否一致",
            "explanation": "各轮给出比例的标准差；越小越一致。"
          }
        }
      },
      professional: {
        construct: "无回报情境下的分配偏好（独裁者式）",
        procedure: "每轮禀赋随 config 冻结，参与者从五个预设档位（0、1/4、1/2、3/4、全部）中选择分给同伴的份额；给出比例为总给出点数/总禀赋；一致性为各轮给出比例的标准差。",
        interpretation: "全部指标为描述性偏好量；档位颗粒度限制给出量的分辨率；本任务不设能力分数，不做品德或人格推断。",
        confounders: [
          "点数/虚拟资源与真实资源下的分享偏好可能不同。",
          "预设档位限制分配粒度。",
          "本报告不提供经过验证的人口常模、诊断、品德或人格结论。"
        ],
        metricNotes: {
          "givingRate": {
            "definition": "总给出点数 / 总禀赋。",
            "readingHint": "描述性偏好量，无好坏方向。"
          },
          "equalSplitCount": {
            "definition": "给出点数恰好为一半的轮次数。",
            "readingHint": "对半分是常见的公平规范锚点。"
          },
          "generousRate": {
            "definition": "给出比例 ≥ 0.5 的轮次占比。",
            "readingHint": "与 givingRate 同读。"
          },
          "givingRateSd": {
            "definition": "各轮给出比例的标准差；单轮时为 0。",
            "readingHint": "越小越一致；受轮次数影响。"
          },
          "medianDecisionMs": {
            "definition": "各轮决策用时的中位数。",
            "readingHint": "仅作描述。"
          }
        },
        configFields: [
          {
            "key": "endowments",
            "label": "各轮禀赋"
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
