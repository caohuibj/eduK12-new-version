import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.1",
    testType: "symbolmatch",
    engineVersion: "1.0.1",
    scoringVersion: "1.0.0",
    title: "符号数字配对",
    metrics: {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：全部正式试次中配对正确的比例；未回应也计入分母。",
        "singleExplanation": "总体正确率：全部正式试次中配对正确的比例；未回应也计入分母。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：纳入用时统计的正确试次中，从符号出现到选择数字的典型时间。",
        "singleExplanation": "正确作答中位用时：纳入用时统计的正确试次中，从符号出现到选择数字的典型时间。"
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
    experienceHeadline: "medianRtMs",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["可以先熟悉图例中各配对的位置；作答时按需要查表，不必强记。", "每题只记录第一次选择。回想是否有看错符号或按错数字，下次先核对配对，再作答。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次符号-数字配对的表现，不是智力、学习能力或年龄常模判断。",
    reportReading: {
      version: "1.0.1",
      title: "照着图例，你能配得多快？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，全部正式试次有 {accuracy} 配对正确；正确有效作答的典型用时是 {medianRtMs}。",
        metricKeys: ["accuracy", "medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，全部正式试次有 {accuracy} 配对正确；未回应也计入分母，试次较少，先关注规则是否理解。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["medianRtMs", "accuracy", "errorCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {
        "medianRtMs": ["insufficientValidRt"]
      },
      nextStep: "先看正确率，再读正确作答用时。想一想是查图例、辨认符号还是按数字更费力，下次可先熟悉配对位置；不要只为缩短用时而抢答。",
      chart: {
        "kind": "metrics",
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
      illustration: "signal",
      popular: {
        conceptTitle: "先弄懂，这个任务在看什么",
        concept: "图例上写着五个“符号=数字”的配对。每题冒出一个符号，你要尽快按下对应的数字。这里看的是查表配对的速度和准确——一种很基础的处理速度。",
        takeaway: "图例全程可查，不必强记；先核对配对，再逐渐熟悉它的位置。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "看地图图例找符号、对照键盘快捷键、查课表代码，都是同一种查表本领。它只是处理速度的一小部分，不代表你的智力或学习能力。",
        scene: "signal",
        frames: [
          {
            "title": "看符号",
            "text": "每题出现图例中的一个符号，符号可能重复。"
          },
          {
            "title": "查图例",
            "text": "找到它对应的数字。"
          },
          {
            "title": "按数字",
            "text": "又快又准地作答。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "medianRtMs": {
            "label": "配对花了多久",
            "explanation": "纳入用时统计的正确试次中，从符号出现到作答的典型时间。"
          },
          "accuracy": {
            "label": "这次配对正确的比例",
            "explanation": "正式作答中判断正确的比例。"
          },
          "errorCount": {
            "label": "配错了几次",
            "explanation": "按错数字的次数；与用时一起看。"
          }
        }
      },
      professional: {
        construct: "符号-数字配对的处理速度（编码）",
        procedure: "五对符号-数字映射随 config 冻结并常驻显示；逐试次呈现符号并记录数字选择；正确性由服务端按映射推导；RT 统计限正确且 rtMs ≥ validRtFloorMs 的反应。",
        interpretation: "速度与准确同读；映射熟悉化会带来学习效应，跨试次前后的比较仅具描述性。",
        confounders: [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "作答中断、超时和有效反应数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、智力或学业等级结论。"
        ],
        metricNotes: {
          "accuracy": {
            "definition": "正确率：全部正式试次中配对正确的比例，错误和未回应均留在分母。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应（rtMs ≥ validRtFloorMs）的中位时间。",
            "readingHint": "与正确率同读；速度—准确率权衡会改变解释。"
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
            "key": "symbolDigitMap",
            "label": "符号-数字映射"
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
