import { wordanalogyRegistryMetaV11 } from './definitions'
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "wordanalogy",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "言语类比推理",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对类比关系的比例。",
        "singleExplanation": "总体正确率：正式作答中选对类比关系的比例。"
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
    practicalTips: ["先说出前一对词的关系（功能、部分、因果……），再套到后一对上。", "四个选项都读一遍，排除关系不符的。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次言语类比推理的表现，不是语言能力、智力或年龄常模判断。",
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
        concept: "题目给出一对词的关系，比如“鸟 对 翅膀”——翅膀是鸟身体的一部分。你要在选项里找到拥有同样关系的一对。这个任务看的是你发现并套用言语关系的能力。",
        takeaway: "先说清关系，再找答案。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "看懂比喻、写议论文里的类比论证、理解新概念和旧概念的关系，都用到了关系推理。它只是语言与思维本领的一小部分，不代表你的语言能力或智力。",
        scene: "rules",
        frames: [
          {
            "title": "读前对",
            "text": "说出两个词之间是什么关系。"
          },
          {
            "title": "套关系",
            "text": "把同样的关系放到后面的词上。"
          },
          {
            "title": "选答案",
            "text": "四个选项里只有一组的关系完全一致。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "推对了多少",
            "explanation": "正式作答中选对类比关系的比例。"
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
        construct: "言语类比推理（关系推理）",
        procedure: "题目集 wordanalogy-zh-v1.0.0 冻结于 config；逐题呈现词对类比与四个选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "正确率与用时同读；题库覆盖多种关系类型，分关系类型的表现分析属研究用途，本报告不输出。",
        confounders: [
          "语言熟练度与词汇量是已知混淆。",
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

const historical = participantPresentations[0]
participantPresentations.push({
 ...historical, engineVersion: '1.1.0', scoringVersion: '1.1.0', presentationVersion: '1.1.0',
 metrics: { ...historical.metrics,
 accuracy: { ...historical.metrics.accuracy, explanation: '本次正式题中答对的比例；超时仍计入正式题分母，练习不计入。', singleExplanation: '本次正式题中答对的比例；不是群体百分位。' },
 medianRtMs: { ...historical.metrics.medianRtMs, explanation: '只统计答对且达到有效用时下限的题目；没有足够数据时不解释速度。' },
 errorCount: { label: '选错题数', explanation: '已经选择但答案不正确的正式题数；不包含超时。' },
 timeoutCount: { label: '未作答题数', explanation: '到时限仍未作答的正式题数；不是选择了第一个选项或零用时。' },
 },
 practicalTips: wordanalogyRegistryMetaV11.reportDefinition.practicalTips,
 reportReading: { ...historical.reportReading!, version: '1.1.0',
 title: '理解词语之间的关系',
 summaryByProfile: { experience: { template: '这次18题体验中的正确率是 {accuracy}；请结合未作答情况阅读，不推断稳定能力。', metricKeys: ['accuracy'] } },
 nextStep: '回想哪些关系让你犹豫，尝试先说出关系，再看选项；报告不提供正式题的答案回放。',
 professional: { ...historical.reportReading!.professional!,
 procedure: '题库 wordanalogy-zh-v1.1.0；独立练习1题，答对后进入正式题。体验18/标准30/科研36题，无重复抽题。正式题准确率包含超时，正确有效RT须达到冻结下限。',
 interpretation: '本次自然指标的描述，不作同龄排名、诊断或跨版本等值比较。',
 },
 },
})
