import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "seriescomplete",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "数列完成",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对答案的比例。",
        "singleExplanation": "总体正确率：正式作答中选对答案的比例。"
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
    practicalTips: ["先看相邻两个数的差或比，再验证规律。", "不确定时先算差值，再看是不是等差、等比或跳数。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次数列完成的表现，不是语言能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "词与词之间的“关系”，你抓得住吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的类比推理正确率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的类比推理正确率是 {accuracy}；正式版会给出更稳的用时记录。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "errorCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；把错题的关系类型记下来，比只看分数更有用。",
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
        concept: "每题给出若干逻辑条件（比如“甲比乙高，乙比丙高”），你要从条件出发推出结论。这个任务看的是你从已知信息出发做演绎推理的本领。",
        takeaway: "先算差值，再看倍数。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "记停车位的编号规律、看日历推日期、写代码里的循环步长，都需要找规律。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        scene: "rules",
        frames: [
          {
            "title": "读前对",
            "text": "看相邻两项的差或比。"
          },
          {
            "title": "套关系",
            "text": "验证规律后选出下一项。"
          },
          {
            "title": "选答案",
            "text": "四个选项里只有一个符合规律。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对答案的比例。"
          },
          "medianRtMs": {
            "label": "想了多久",
            "explanation": "答对题目中从出现到选择的典型时间。"
          },
          "errorCount": {
            "label": "选错了几次",
            "explanation": "选择错误关系的次数；与用时一起看。"
          }
        }
      },
      professional: {
        construct: "数列完成（关系推理）",
        procedure: "题目集 seriescomplete-zh-v1.0.0 冻结于 config；逐题呈现逻辑推断题与四个选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "正确率与用时同读；题库覆盖等差、等比、平方、斐波那契、字母等多种序列，分序列类型分析属研究用途，本报告不输出。",
        confounders: [
          "策略差异（先算差值 vs 先看倍数）影响解题速度。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
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
            "label": "题目集版本"
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

participantPresentations.push({
  "schemaVersion": 1,
  "presentationVersion": "1.1.0",
  "testType": "seriescomplete",
  "engineVersion": "1.1.0",
  "scoringVersion": "1.1.0",
  "title": "数列补全",
  "metrics": {
    "accuracy": {
      "label": "本次正式题正确率",
      "explanation": "答对正式题数除以全部已呈现正式题数；超时计入分母，不将有效零正确率当缺失。"
    },
    "medianRtMs": {
      "label": "正确且未中断作答的典型用时",
      "explanation": "仅纳入300毫秒至题目时限之间的正确、未中断作答；没有记录为null，不补成0。"
    },
    "errorCount": {
      "label": "选错题数"
    },
    "timeoutCount": {
      "label": "超时未答题数"
    },
    "validRtCount": {
      "label": "有效正确用时数量"
    }
  },
  "experienceHeadline": "accuracy",
  "hiddenMetrics": [],
  "singleHiddenMetrics": [],
  "disclaimer": "内部原创数字与英文字母序列材料，字母题受英语字母知识影响；题目分组未经难度标定，无常模、诊断或能力排名。重复施测可能受练习影响。",
  "suppressTips": false,
  "practicalTips": [
    "依次核查每一步是否符合你发现的简洁规律。"
  ],
  "protocols": {},
  "reportReading": {
    "version": "1.1.0",
    "title": "数列补全：回看这次作答",
    "introduction": "发现数列或字母序列的简洁变化规律并选择下一项。",
    "summary": {
      "template": "这次正式题的正确率为 {accuracy}；超时未答 {timeoutCount} 题。",
      "metricKeys": [
        "accuracy",
        "timeoutCount"
      ]
    },
    "studentMetricKeys": [
      "accuracy",
      "timeoutCount"
    ],
    "processMetricKeys": [
      "medianRtMs",
      "validRtCount"
    ],
    "withholdFlags": [
      "interrupted"
    ],
    "metricGates": {
      "medianRtMs": [
        "insufficientValidRt"
      ]
    },
    "nextStep": "依次核查每一步是否符合你发现的简洁规律。 内部原创数字与英文字母序列材料，字母题受英语字母知识影响；题目分组未经难度标定，无常模、诊断或能力排名。重复施测可能受练习影响。",
    "chart": {
      "kind": "metrics",
      "metricKeys": [
        "accuracy"
      ]
    }
  }
})
