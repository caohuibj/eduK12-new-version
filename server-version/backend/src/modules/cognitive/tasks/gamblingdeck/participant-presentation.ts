import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "gamblingdeck",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "宝箱决策学习",
    metrics: {
      "advantageousChoiceRate": {
        "label": "优势箱选择比例",
        "explanation": "优势箱选择比例：全部选择中，落在长期更划算两个箱子上的比例。",
        "singleExplanation": "优势箱选择比例：全部选择中，落在长期更划算两个箱子上的比例。"
      },
      "netScore": {
        "label": "累计净得分",
        "explanation": "累计净得分：把每次开箱的输赢加起来的总数。",
        "singleExplanation": "累计净得分：把每次开箱的输赢加起来的总数。"
      },
      "blockTrendSlope": {
        "label": "分块学习斜率",
        "explanation": "分块学习斜率：把任务分成几段后，选优势箱的比例随段数的平均变化；正值代表越选越好。",
        "singleExplanation": "分块学习斜率：选优势箱比例随任务进程的平均变化。"
      },
      "deckChoiceRates": {
        "label": "各箱选择比例"
      }
    },
    experienceHeadline: "advantageousChoiceRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["先在小损失里观察规律：有的箱子赢多输得也多。", "如果发现自己总选同一个箱子，试着换一个对比一下。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次四箱任务的决策学习过程，不是冲动性、风险性格或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "开箱之后，你摸到了什么规律？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你 {advantageousChoiceRate} 的选择落在长期更划算的箱子上，累计净得 {netScore}。",
        metricKeys: ["advantageousChoiceRate", "netScore"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你 {advantageousChoiceRate} 的选择落在长期更划算的箱子上；体验版还看不出稳定的学习趋势。",
          metricKeys: ["advantageousChoiceRate"]
        }
      },
      studentMetricKeys: ["advantageousChoiceRate", "netScore", "blockTrendSlope"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable"],
      metricGates: {},
      nextStep: "先看累计净得与优势箱比例，再看分段趋势；这不是“冲动性评分”，只描述这次学习过程。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["advantageousChoiceRate"]
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
      illustration: "sequence",
      popular: {
        conceptTitle: "先弄懂，这个任务在看什么",
        concept: "四个宝箱，有的经常小赚但偶尔大亏，有的稳稳小赚。规则不会提前告诉你——你要边开箱边琢磨哪个箱子长期最划算。这里看的正是这个“从反馈中学习并调整”的过程。",
        takeaway: "好决策不是不输，而是长期算得过账。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "零花钱怎么分配、练哪门兴趣更值得坚持，都需要从小反馈里总结长期规律。这个任务只是决策学习的一小段模拟，不代表你的性格或冲动性。",
        scene: "sequence",
        frames: [
          {
            "title": "开一个箱",
            "text": "先选一个箱子看输赢。"
          },
          {
            "title": "记下反馈",
            "text": "把输赢大小和频率记在心里。"
          },
          {
            "title": "调整选择",
            "text": "逐步转向长期更划算的箱子。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、消费建议或同龄人排名。",
        metricHelp: {
          "advantageousChoiceRate": {
            "label": "选“划算箱子”的比例",
            "explanation": "全部选择中落在长期净得分更高两箱的比例。"
          },
          "netScore": {
            "label": "最后赚了多少",
            "explanation": "所有开箱输赢的总和，只描述这次任务。"
          },
          "blockTrendSlope": {
            "label": "越选越好吗",
            "explanation": "分段看优势箱比例的变化趋势；正值代表后段更偏好划算的箱子。"
          }
        }
      },
      professional: {
        construct: "基于反馈的四箱决策学习（IGT 结构）",
        procedure: "奖惩计划由 scoringVersion 钉死：A/B 每十张净 -250（A 频发小损失、B 罕见巨额损失），C/D 每十张净 +250（C 频发小损失、D 无损失）；箱选择为唯一客户端行为事实，净结果由服务端按选择次数在计划内的位置推导。",
        interpretation: "优势箱比例为主指标；分块斜率为有符号趋势量，受块大小与试次数影响。箱选择不独立（计划内位置随选择次数变化），不做逐试次独立性推断。",
        confounders: [
          "点数奖励与真实激励的学习信号可能不同。",
          "作答中断影响分段趋势的稳定性。",
          "本报告不提供经过验证的人口常模、诊断、冲动性或风险性格等级结论。"
        ],
        metricNotes: {
          "advantageousChoiceRate": {
            "definition": "选择 C/D 的试次占总试次的比例。",
            "readingHint": "与净得分、分块趋势同读；短版本不稳定。"
          },
          "netScore": {
            "definition": "按冻结计划逐试次净结果之和。",
            "readingHint": "受箱选择分布影响大，不单独作为能力指标。"
          },
          "blockTrendSlope": {
            "definition": "各 blockSize 分块内优势选择比例对块序号的 OLS 斜率；不足两块或方差为零时为 null。",
            "readingHint": "有符号趋势量；正值代表偏好随进程上升。"
          },
          "deckChoiceRates": {
            "definition": "A/B/C/D 各箱选择比例（研究用途字段）。",
            "readingHint": "用于观察损失频率偏好，不做单独结论。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "blockSize",
            "label": "分块大小"
          },
          {
            "key": "feedbackMs",
            "label": "反馈展示时长（毫秒）"
          }
        ]
      }
    }
  },
]
