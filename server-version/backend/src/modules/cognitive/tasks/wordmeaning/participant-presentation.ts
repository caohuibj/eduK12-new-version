import { wordmeaningRegistryMetaV11 } from './definitions'
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "wordmeaning",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "词汇理解",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中选对释义的比例。",
        "singleExplanation": "总体正确率：正式作答中选对释义的比例。"
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
    practicalTips: ["把词语放进句子里想一想，再对照选项。", "四个选项都读一遍，排除关系不符的。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次词汇理解的表现，不是语言能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "这个词，你理解得准吗？",
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
        takeaway: "把词放回句子里，意思就清楚了。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "读懂课文里的关键词、听懂新闻用语、挑选准确的表达，都依赖词义掌握。它只是语言能力的一小部分，不代表你的阅读或表达全貌。",
        scene: "rules",
        frames: [
          {
            "title": "读前对",
            "text": "看清目标词。"
          },
          {
            "title": "套关系",
            "text": "回忆它最常见的用法。"
          },
          {
            "title": "选答案",
            "text": "选出意思最接近的一项。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "accuracy": {
            "label": "选对了多少",
            "explanation": "正式作答中选对释义的比例。"
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
        construct: "词汇理解（关系推理）",
        procedure: "题目集 wordmeaning-zh-v1.0.0 冻结于 config；逐题呈现目标词与四个释义选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "正确率与用时同读；词义掌握受阅读量与教育暴露影响，属构念本身的组成部分。",
        confounders: [
          "词义熟悉度与方言差异会影响作答。",
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
 practicalTips: wordmeaningRegistryMetaV11.reportDefinition.practicalTips,
 reportReading: { ...historical.reportReading!, version: '1.1.0',
 title: '读懂词语在本题中的意思',
 summary: { template: '这次词义判断的正确率是 {accuracy}；答对且达到有效用时下限的题目，其中位用时为 {medianRtMs}。', metricKeys: ['accuracy', 'medianRtMs'] },
 popular: { ...historical.reportReading!.popular!,
 concept: '题目呈现一个词语或给定的使用语境，请从四个释义中找出最匹配的一项。本次反映的是对这些中文词语的理解，阅读经验也会影响作答。',
 example: '阅读时遇到不熟悉的词，可以先看上下文，再试着换成自己的话；相关的意思不一定就是同义。',
 frames: [{title:'读目标词',text:'有语境时，把词放回语境中理解。'}, {title:'比较释义',text:'区分同义、相关、相反和不相干的解释。'}, {title:'选择答案',text:'选出与本题意思最匹配的一项。'}],
 metricHelp: { ...historical.reportReading!.popular!.metricHelp,
 accuracy: {label:'理解对了多少',explanation:'正式题答对数除以实际计划题数，超时保留在分母中。'},
 errorCount: {label:'选错了几题',explanation:'做出了选择但释义不匹配的题数；不包含超时。'},
 },
 },
 summaryByProfile: { experience: { template: '这次18题体验中的正确率是 {accuracy}；请结合未作答情况阅读，不推断稳定能力。', metricKeys: ['accuracy'] } },
 nextStep: '回想哪些词语较陌生，用自己的句子解释它们；不要把一次词义选择当作语言能力定论。',
 professional: { ...historical.reportReading!.professional!,
 construct: '中文词义理解（本项目题库）',
 procedure: '题库 wordmeaning-zh-v1.1.0；独立练习1题，答对后进入正式题。体验18/标准30/科研36题，无重复抽题。正式题准确率包含超时，正确有效RT须达到冻结下限。',
 interpretation: '本次自然指标的描述，不作同龄排名、诊断或跨版本等值比较。',
 },
 },
})
