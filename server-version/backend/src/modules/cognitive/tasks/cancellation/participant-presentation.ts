import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "cancellation",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "视觉划消",
    metrics: {
      "hitRate": {
        "label": "命中率",
        "explanation": "命中率：所有目标符号中被你成功点亮的比例。",
        "singleExplanation": "命中率：所有目标符号中被你成功点亮的比例。"
      },
      "falseAlarmRate": {
        "label": "误报比例",
        "explanation": "误报比例：你点亮的格子里不是目标的占比；越高说明越心急。",
        "singleExplanation": "误报比例：点亮的格子里不是目标的占比。"
      },
      "hitCount": {
        "label": "命中数"
      },
      "missCount": {
        "label": "漏报数"
      },
      "falseAlarmCount": {
        "label": "误报数"
      }
    },
    experienceHeadline: "hitRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["按行从左到右扫，比乱找更快更稳。", "不确定的格子不要乱点，误报会拉低分数。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次视觉划消表现，不是注意力诊断、临床状态或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "限时扫一遍，你能逮住多少目标？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你逮住了 {hitRate} 的目标；误报比例 {falseAlarmRate}。",
        metricKeys: ["hitRate", "falseAlarmRate"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你逮住了 {hitRate} 的目标；体验版仅 1 轮，仅供体验。",
          metricKeys: ["hitRate"]
        }
      },
      studentMetricKeys: ["hitRate", "falseAlarmRate", "missCount"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "excessiveFalseAlarms"],
      metricGates: {},
      nextStep: "先看命中率，再对照误报比例；又快又准才是搜索能力，只快不准不算。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["hitRate", "falseAlarmRate"]
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
        concept: "一格一格的符号墙里藏着若干目标符号。限时内把目标全部点亮——既要比谁找得全，也要小心别点错。这里看的是你的视觉搜索：注意像手电筒，怎么扫、扫得准不准。",
        takeaway: "按行扫描，又快又准。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "在货架上找特定商品、在表格里核对数据、在地图上找路标，都是视觉搜索。它只是注意力的一小部分，不代表你的专注力或学习能力全貌。",
        scene: "signal",
        frames: [
          {
            "title": "记目标",
            "text": "看清楚本轮要找的符号。"
          },
          {
            "title": "按行扫",
            "text": "从左到右、一行一行扫过去。"
          },
          {
            "title": "点亮目标",
            "text": "点对的加分，点错的扣分。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "hitRate": {
            "label": "逮住了多少",
            "explanation": "目标符号中被成功点亮的比例。"
          },
          "falseAlarmRate": {
            "label": "点错了多少",
            "explanation": "点亮的格子里不是目标的占比。"
          },
          "missCount": {
            "label": "漏了几个",
            "explanation": "没被点亮的目标符号个数。"
          }
        }
      },
      professional: {
        construct: "视觉搜索/划消（选择性注意）",
        procedure: "每轮网格由服务端按 seed+scanIndex 重建（目标符号占 CANCELLATION_TARGET_COUNT 格，其余为形状相近干扰项）；参与者限时点亮目标，服务端将最终选中集与目标集求交并计算命中/漏报/误报。",
        interpretation: "命中率与误报率同读（信号检测：灵敏度与反应偏向分离）；限时与轮次数影响解释边界。",
        confounders: [
          "触控/鼠标点击精度影响误报计数。",
          "剩余时间压力因人而异。",
          "本报告不提供经过验证的人口常模、诊断、注意力等级或临床结论。"
        ],
        metricNotes: {
          "hitRate": {
            "definition": "命中目标数 / 目标总数（跨有效轮次累计）。",
            "readingHint": "与误报率同读。"
          },
          "falseAlarmRate": {
            "definition": "误报数 / 选中总数；未选中任何格子时为 null。",
            "readingHint": "达到 0.3 触发误报过多标记。"
          },
          "hitCount": {
            "definition": "选中且为目标格的次数累计。",
            "readingHint": "受轮次数影响。"
          },
          "missCount": {
            "definition": "目标总数 − 命中数。",
            "readingHint": "与命中率互补。"
          },
          "falseAlarmCount": {
            "definition": "选中且非目标格的次数累计。",
            "readingHint": "与误报率互补。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划轮次数"
          },
          {
            "key": "durationMs",
            "label": "每轮时长（毫秒）"
          },
          {
            "key": "stimulusSetVersion",
            "label": "符号集版本"
          }
        ]
      }
    }
  },
]
