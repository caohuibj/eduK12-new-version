import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "runningspan",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "运行记忆广度",
    metrics: {
      "runningSpanAccuracy": {
        "label": "串行回忆正确率",
        "explanation": "串行回忆正确率：回忆位置上字母与顺序都对的比例，是最主要的运行广度指标。",
        "singleExplanation": "串行回忆正确率：回忆位置上字母与顺序都对的比例。"
      },
      "totalCorrectPositions": {
        "label": "串行正确总数",
        "explanation": "串行正确总数：全部试次里位置与字母都正确的个数。",
        "singleExplanation": "串行正确总数：全部试次里位置与字母都正确的个数。"
      },
      "intrusionRate": {
        "label": "侵入比例",
        "explanation": "侵入比例：回忆中混入“不属于最后几个”的字母的比例；过高说明旧信息在干扰更新。",
        "singleExplanation": "侵入比例：回忆中混入旧字母的比例。"
      },
      "medianResponseMs": {
        "label": "回忆用时中位数",
        "explanation": "回忆用时中位数：各试次回忆阶段的典型用时。",
        "singleExplanation": "回忆用时中位数：各试次回忆阶段的典型用时。"
      }
    },
    experienceHeadline: "runningSpanAccuracy",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["不知道序列何时结束：试着一直保持“最近几个”在脑子里。", "按顺序回忆，别只求快；稳住的顺序就是得分。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次运行广度任务的回忆表现，不是记忆能力、临床状态或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "脑中的“最近几个”，你留住了多少？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的串行回忆正确率是 {runningSpanAccuracy}；混入旧字母的比例是 {intrusionRate}。",
        metricKeys: ["runningSpanAccuracy", "intrusionRate"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的串行回忆正确率是 {runningSpanAccuracy}；正式版会给出更稳的更新记录。",
          metricKeys: ["runningSpanAccuracy"]
        }
      },
      studentMetricKeys: ["runningSpanAccuracy", "intrusionRate", "totalCorrectPositions"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "emptyRecall", "excessiveIntrusions"],
      metricGates: {},
      nextStep: "先看串行正确率，再看侵入比例；侵入多说明旧字母还在占地方，这正是更新任务要观察的。",
      chart: {
        "kind": "memory_lengths",
        "metricKeys": ["runningSpanAccuracy"]
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
        concept: "字母一个一个蹦出来，什么时候停谁也不知道。你唯一的办法，是让脑子里一直只留“最近的几个”。停止后要把最后三个按顺序写出来——这就是工作记忆的“更新”：不断放进新的，挤掉旧的。",
        takeaway: "记住最新的，放下过时的。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "老师连续报作业、比赛记分牌滚动更新、群消息一条条刷过，都需要不断替换脑子里的旧信息。这只反映记忆更新的一小部分，不代表你的记忆能力全貌。",
        scene: "sequence",
        frames: [
          {
            "title": "跟住新字母",
            "text": "每个字母都替换掉脑中的旧队列。"
          },
          {
            "title": "等待停止",
            "text": "你不知道哪一个是最后一个。"
          },
          {
            "title": "按序回忆",
            "text": "把最后三个按出现顺序选出。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "runningSpanAccuracy": {
            "label": "按顺序记对了多少",
            "explanation": "回忆位置上字母与顺序都对的比例。"
          },
          "intrusionRate": {
            "label": "旧字母来捣乱了吗",
            "explanation": "回忆中混入不属于最后几个的字母的比例。"
          },
          "totalCorrectPositions": {
            "label": "一共记对了几个",
            "explanation": "全部试次中位置与字母都正确的总数。"
          }
        }
      },
      professional: {
        construct: "工作记忆更新（运行广度）",
        procedure: "每试次呈现 listLengthMin..listLengthMax 内随机长度的字母序列（刺激时长 stimulusMs、间隔 isiMs，终点不可预知），回忆最后 recallLength 项；串行严格计分：位置与字母均正确才计 1；侵入指回忆项不属于目标窗口。",
        interpretation: "串行正确率为主要指标；侵入率反映旧信息清除失败，与正确率同读。回忆阶段自定速，用时仅作描述。",
        confounders: [
          "组块化/复述策略改变成绩。",
          "作答中断与空回忆降低可解释性。",
          "本报告不提供经过验证的人口常模、诊断、稳定记忆能力等级或临床结论。"
        ],
        metricNotes: {
          "runningSpanAccuracy": {
            "definition": "串行正确数 / 已填回忆槽位数；无有效输入时为 null。",
            "readingHint": "严格串行计分；与侵入率同读。"
          },
          "totalCorrectPositions": {
            "definition": "位置与字母均正确的累计个数。",
            "readingHint": "受试次数影响，跨 profile 不可比。"
          },
          "intrusionRate": {
            "definition": "回忆中不属于目标窗口的字母占已填槽位的比例。",
            "readingHint": "达到 0.5 触发侵入过多标记。"
          },
          "medianResponseMs": {
            "definition": "各试次回忆阶段用时的中位数。",
            "readingHint": "自定速任务，仅作描述。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "recallLength",
            "label": "回忆长度"
          },
          {
            "key": "stimulusMs",
            "label": "单字母呈现时长（毫秒）"
          }
        ]
      }
    }
  },
]
