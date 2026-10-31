import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "seqlearn",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "序列反应学习",
    metrics: {
      "srtPatternAdvantageMs": {
        "label": "序列学习效应",
        "explanation": "序列学习效应：随机块与后期重复块的正确作答中位用时之差；正值代表重复位置让你变快了。",
        "singleExplanation": "序列学习效应：随机块与后期重复块的正确作答中位用时之差。"
      },
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中按对位置的比例。",
        "singleExplanation": "总体正确率：正式作答中按对位置的比例。"
      },
      "randomBlockAccuracy": {
        "label": "随机块正确率",
        "explanation": "随机块正确率：位置随机打乱的区组中按对位置的比例。",
        "singleExplanation": "随机块正确率：随机区组中按对位置的比例。"
      },
      "medianRtLatePatternMs": {
        "label": "后期重复块中位用时",
        "explanation": "后期重复块中位用时：接近结尾的重复区组中正确作答的典型时间。",
        "singleExplanation": "后期重复块中位用时：接近结尾的重复区组中正确作答的典型时间。"
      },
      "medianRtRandomMs": {
        "label": "随机块中位用时",
        "explanation": "随机块中位用时：随机区组中正确作答的典型时间。",
        "singleExplanation": "随机块中位用时：随机区组中正确作答的典型时间。"
      },
      "medianRtEarlyPatternMs": {
        "label": "早期重复块中位用时"
      }
    },
    experienceHeadline: "srtPatternAdvantageMs",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["位置规律不会被告知：跟着感觉快速反应即可。", "保持稳定节奏，学习效应来自重复暴露。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次序列反应任务的表现，不是学习能力、智力或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "你的手指，先于你知道了规律？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的序列学习效应是 {srtPatternAdvantageMs}；总体正确率 {accuracy}。",
        metricKeys: ["srtPatternAdvantageMs", "accuracy"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，总体正确率 {accuracy}；体验版时长不足以看出稳定的学习效应。",
          metricKeys: ["accuracy"]
        }
      },
      studentMetricKeys: ["srtPatternAdvantageMs", "accuracy", "medianRtRandomMs"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientRandomRt", "insufficientPatternRt"],
      metricGates: {
        "srtPatternAdvantageMs": ["insufficientRandomRt", "insufficientPatternRt"]
      },
      nextStep: "先确认正确率，再读序列学习效应；正值代表重复的位置让你变快，这是隐性学习的常见信号。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["medianRtLatePatternMs", "medianRtRandomMs"]
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
        concept: "信号会出现在四个格子里，看到就按对应的键。有些位置的顺序其实在悄悄重复——没有人告诉你。如果反复之后你按得越来越快，而位置乱掉时又变慢，这就说明你的动作系统先“学会”了规律。",
        takeaway: "重复会留下痕迹，即使你还没意识到。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "学骑车走固定路线、弹一段旋律、熟练地打字，动作都会越来越顺。这是很基础的动作学习，不代表你的学业学习能力或智力。",
        scene: "sequence",
        frames: [
          {
            "title": "看信号",
            "text": "信号出现在某个格子里。"
          },
          {
            "title": "快按键",
            "text": "按对应位置的键或点击。"
          },
          {
            "title": "比快慢",
            "text": "重复位置与随机位置的速度差就是学习信号。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "srtPatternAdvantageMs": {
            "label": "重复让你快了多少",
            "explanation": "随机块与后期重复块的正确用时之差；正值代表学习信号。"
          },
          "accuracy": {
            "label": "按对了多少",
            "explanation": "正式作答中按对位置的比例。"
          },
          "medianRtRandomMs": {
            "label": "乱序时有多快",
            "explanation": "随机区组中正确作答的典型时间。"
          }
        }
      },
      professional: {
        construct: "隐性序列学习（SRT）",
        procedure: "重复序列随 config 冻结；模式块位置由服务端按冻结序列权威校验，随机块位置为客户端观察事实；序列学习效应 = 随机块正确有效 RT 中位数 − 后期重复块（最后两个区组）中位数；RT 统计限正确且 rtMs ≥ validRtFloorMs。",
        interpretation: "效应为有符号量，正值代表对重复结构的更快反应；受随机块数量、试次数与觉察策略影响，不单独推断学习能力。",
        confounders: [
          "被试可能显性觉察序列，改变学习性质（本任务不测觉察）。",
          "输入方式（键盘/触控）与设备延迟影响用时记录。",
          "本报告不提供经过验证的人口常模、诊断、学习能力或智力等级结论。"
        ],
        metricNotes: {
          "srtPatternAdvantageMs": {
            "definition": "随机块正确有效 RT 中位数减后期重复块（最后两个区组）中位数。",
            "readingHint": "有符号量；两条件有效记录不足时为 null。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中按对位置的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "randomBlockAccuracy": {
            "definition": "随机区组内按对位置的比例。",
            "readingHint": "随机块无规律，正确率反映基础选择准确性。"
          },
          "medianRtLatePatternMs": {
            "definition": "最后两个重复区组的正确有效 RT 中位数。",
            "readingHint": "与随机块中位数对照阅读。"
          },
          "medianRtRandomMs": {
            "definition": "随机区组的正确有效 RT 中位数。",
            "readingHint": "随机块数量有限，估计较不稳定。"
          },
          "medianRtEarlyPatternMs": {
            "definition": "第一个重复区组的正确有效 RT 中位数。",
            "readingHint": "仅作基线描述。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "patternSequence",
            "label": "重复序列"
          },
          {
            "key": "randomBlockIndices",
            "label": "随机区组位置"
          }
        ]
      }
    }
  },
]
