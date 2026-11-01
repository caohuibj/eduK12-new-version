import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "logicdeduce",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "多条件逻辑推断",
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
    practicalTips: ["把题目给出的条件一条条列出来，再逐步推导。", "用代入法：把每个选项放进条件里验证是否矛盾。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次逻辑推断的表现，不是语言能力、智力或年龄常模判断。",
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
        takeaway: "先理条件，再推结论。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "做计划排优先级、根据线索找答案、判断谁对谁错，都用到了逻辑推理。它只是推理能力的一小部分，不代表你的智力或学业水平。",
        scene: "rules",
        frames: [
          {
            "title": "读前对",
            "text": "把条件一条条列清楚。"
          },
          {
            "title": "套关系",
            "text": "从条件出发逐步推导。"
          },
          {
            "title": "选答案",
            "text": "四个选项里只有一个不与条件矛盾。"
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
        construct: "多条件逻辑推断（关系推理）",
        procedure: "题目集 logicdeduce-zh-v1.0.0 冻结于 config；逐题呈现逻辑推断题与四个选项，服务端按题库权威推导正确性；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "正确率与用时同读；题库覆盖排序、条件、三段论等多种题型，分题型分析属研究用途，本报告不输出。",
        confounders: [
          "阅读理解能力是必要的但不是充分的，核心是逻辑推导。",
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

const audited = structuredClone(participantPresentations[0])
audited.presentationVersion='2.0.0';audited.engineVersion='2.0.0';audited.scoringVersion='2.0.0'
if(audited.reportReading){
 audited.reportReading.version='2.0.0'
 audited.reportReading.withholdFlags=['legacyUninterpretable']
 audited.reportReading.summaryByProfile={experience:{template:'这次18题体验中，你答对的比例是 {accuracy}。短版只描述本次表现，不与其他人排名比较。',metricKeys:['accuracy']}}
 audited.reportReading.popular!.frames=[{title:'读清条件',text:'确认题目给了哪些信息、要求什么。'}, {title:'逐步推导',text:'只用题内条件，区分一定成立与仅有可能。'}, {title:'核对选项',text:'按题目问题选择结论；条件不足时可以选择无法确定。'}]
 audited.reportReading.popular!.metricHelp!.errorCount={label:'选错了几题',explanation:'已作出选择但答案不正确的正式题数；超时另计。'}
 audited.reportReading.professional!.construct='多条件演绎推断'
 audited.reportReading.nextStep='先看本次答对比例，再看用时和超时。下次可练习理清条件；这份报告不提供能力排名。'
 audited.reportReading.professional!.procedure='冻结题池 logicdeduce-zh-v2.0.0：36道独立正式题，另有1道不入分练习；体验/标准/科研为18/30/36题，每题15秒。超时记录null，正确率包含已呈现的超时题；正确且未中断、300ms至时限内的反应进入用时统计。'
}
participantPresentations.push(audited)
