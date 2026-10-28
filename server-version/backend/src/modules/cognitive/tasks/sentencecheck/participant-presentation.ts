import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "sentencecheck",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "句图验证推理",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确的试次中，从句子出现到作答的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确的试次中，从句子出现到作答的典型时间。"
      },
      "negationPenaltyMs": {
        "label": "否定句代价",
        "explanation": "否定句代价：含“不是”的句子相对肯定句多用的时间；正值代表否定句更费时。",
        "singleExplanation": "否定句代价：否定句相对肯定句多用的时间。"
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
    practicalTips: ["先弄清句子说的是形状还是颜色，再核对图片。", "遇到“不是”先转换成“它是什么”，再比较。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次句图验证的表现，不是语言能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "这句话，和图片对得上吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你判断对了 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你判断对了 {accuracy}；正式版会给出否定句代价的完整记录。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["accuracy", "medianRtMs", "negationPenaltyMs"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "negationPenaltyMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读用时；“不是”句子的额外用时是正常的语言加工现象。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["negationPenaltyMs"]
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
        concept: "每题给一句话和一张图，比如“圆形不是蓝色的”。你要核对句子和图是否相符。含“不是”的句子需要多转一个弯——这也是任务想观察的加工过程。",
        takeaway: "先确定句子在说什么，再一步核对。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "核对通知条款、读实验步骤、理解“不在名单上”这类表述，都需要准确的句子核对。这只反映语言核对的一小部分，不代表阅读能力或智力的全貌。",
        scene: "rules",
        frames: [
          {
            "title": "读句子",
            "text": "弄清问的是形状还是颜色。"
          },
          {
            "title": "核对图片",
            "text": "把句子内容与图片对照。"
          },
          {
            "title": "判相符",
            "text": "相符按对，不符按错。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确的试次中从句子出现到作答的典型时间。"
          },
          "negationPenaltyMs": {
            "label": "“不是”多花多久",
            "explanation": "否定句相对肯定句的典型用时差；正值代表否定句更费时。"
          }
        }
      },
      professional: {
        construct: "句法语义核对（含否定的句图验证）",
        procedure: "逐试次呈现一句关于图形形状或颜色的陈述与一张合成图形；陈述真伪由服务端按形状/颜色事实与 askedValue 权威推导；正确率与正确有效 RT（rtMs ≥ validRtFloorMs）为主要指标；否定句代价为否定与肯定条件中位 RT 之差。",
        interpretation: "同时阅读正确率、有效反应数与否定句代价；代价受否定比率与试次数影响，不直接推断语言能力等级。",
        confounders: [
          "阅读熟练度与输入方式影响用时记录。",
          "模板集有限，重复 exposure 带来学习效应。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        metricNotes: {
          "accuracy": {
            "definition": "正确率：正式作答中与陈述真伪一致判断的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "negationPenaltyMs": {
            "definition": "否定条件正确有效 RT 中位数减肯定条件中位数；任一条件不足时为 null。",
            "readingHint": "有符号量；受否定比率影响。"
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
            "key": "negationRatio",
            "label": "否定句比例"
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
