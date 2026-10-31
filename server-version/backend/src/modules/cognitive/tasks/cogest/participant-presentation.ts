import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "cogest",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "认知估算",
    metrics: {
      "accuracy": {
        "label": "合理量级选中率",
        "explanation": "合理量级选中率：正式作答中选对答案的比例。",
        "singleExplanation": "合理量级选中率：正式作答中选对答案的比例。"
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
    practicalTips: ["先想想现实中的物体和场景，再判断数量是否合理。", "检查估计是否明显偏大或偏小，不要求精确背数。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次现实数量估算的表现，不是语言能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "现实中的数量，大致有多大？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的估算题目标量级选中率是 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的估算题目标量级选中率是 {accuracy}；短任务记录较少，不能据此推断稳定能力。",
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
        concept: "根据日常经验判断现实数量的合理量级。它混合一般知识与估算策略，不是纯粹的估算能力测量。",
        takeaway: "先联系现实，再核查数量级。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "判断物体多重、空间多大，需要结合经验检查数量是否合理；本任务不提供智力、诊断或同龄人排名。",
        scene: "rules",
        frames: [
          {
            "title": "读前对",
            "text": "先确认在估计哪一种现实数量。"
          },
          {
            "title": "套关系",
            "text": "结合现实经验判断量级。"
          },
          {
            "title": "选答案",
            "text": "排除明显偏离现实量级的选项。"
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
            "explanation": "未选中项目预期量级选项的题数；与超时分开看。"
          }
        }
      },
      professional: {
        construct: "现实数量合理性判断",
        procedure: "题目集 cogest-zh-v1.0.0 冻结于 config；逐题呈现现实数量估算题与四个选项，按冻结题库预期选项计分；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "选中预期量级选项的比例与用时同读；一般知识和生活经验会影响表现，不能作临床常模或能力排名。",
        confounders: [
          "一般知识、文化和生活经验会影响估算，不能解释为纯估算能力。",
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
  "testType": "cogest",
  "engineVersion": "1.1.0",
  "scoringVersion": "1.1.0",
  "title": "认知估算",
  "metrics": {
    "accuracy": {
      "label": "本次合理量级选中率",
      "explanation": "选中项目预设量级选项的题数除以已呈现正式题数；超时计入分母，0保留；不是人群常模。"
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
  "disclaimer": "内部估算候选题；区间是粗粒度量级选项，不是临床容许范围或人口常模。当前20题不足以支撑原30/36题协议，尚不可纳入；一般知识和生活经验影响表现。",
  "suppressTips": false,
  "practicalTips": [
    "结合日常经验，检查选项是否明显偏大或偏小。"
  ],
  "protocols": {},
  "reportReading": {
    "version": "1.1.0",
    "title": "认知估算：回看这次作答",
    "introduction": "根据日常经验估计现实数量的合理量级。",
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
    "nextStep": "结合日常经验，检查选项是否明显偏大或偏小。 内部估算候选题；区间是粗粒度量级选项，不是临床容许范围或人口常模。当前20题不足以支撑原30/36题协议，尚不可纳入；一般知识和生活经验影响表现。",
    "chart": {
      "kind": "metrics",
      "metricKeys": [
        "accuracy"
      ]
    }
  }
})
