import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "maze",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "迷宫学习",
    metrics: {
      "pathEfficiency": {
        "label": "路径效率",
        "explanation": "路径效率：最优路径长度与实际走的长度的比值，1.0 表示走了最短路线。",
        "singleExplanation": "路径效率：最优路径与实际路径的比值，越接近 1 越好。"
      },
      "completedCount": {
        "label": "完成迷宫数",
        "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。",
        "singleExplanation": "完成迷宫数：成功到达终点的迷宫数量。"
      },
      "totalDeadEnds": {
        "label": "累计死路次数",
        "explanation": "累计死路次数：走回头路或进入已被访问过格子的次数。",
        "singleExplanation": "累计死路次数：走回头路的次数。"
      },
      "medianCompletionTimeMs": {
        "label": "完成用时中位数"
      }
    },
    experienceHeadline: "pathEfficiency",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["先记住整体方向（目标是右下角），再选择具体路线。", "进入死路时尽快回头，不要反复尝试同一方向。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次迷宫导航表现，不是空间能力诊断或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "迷宫里，你走了多少冤枉路？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的路径效率是 {pathEfficiency}；共完成了 {completedCount} 个迷宫。",
        metricKeys: ["pathEfficiency", "completedCount"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的路径效率是 {pathEfficiency}；体验版仅 2 个迷宫。",
          metricKeys: ["pathEfficiency"]
        }
      },
      studentMetricKeys: ["pathEfficiency", "totalDeadEnds"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "incompleteMazes"],
      metricGates: {},
      nextStep: "先看是否全部完成，再看路径效率；效率 1.0 表示走了最短路线，死路次数多说明规划不够。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["pathEfficiency"]
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
        concept: "一个迷宫，从左上角出发，目标是右下角。你用方向键一步步走——但墙会挡住你。这个任务看的是你在心里规划路线、判断方向的本领。",
        takeaway: "先看大局定方向，再一步一步走。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "在陌生城市找路、在商场找到目标店铺、规划从家到学校的路线，都需要空间导航。它只是空间能力的一小部分，不代表你的方向感或智力全貌。",
        scene: "sequence",
        frames: [
          {
            "title": "看全局",
            "text": "目标在右下角，先确定大方向。"
          },
          {
            "title": "逐步走",
            "text": "用方向键一格一格移动。"
          },
          {
            "title": "到终点",
            "text": "走出最短路线到达终点。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "pathEfficiency": {
            "label": "走了多少冤枉路",
            "explanation": "最优路径与实际路径的比值；1.0 = 最短路线。"
          },
          "totalDeadEnds": {
            "label": "走了几次回头路",
            "explanation": "进入已访问过格子的次数。"
          },
          "completedCount": {
            "label": "完成了几个",
            "explanation": "成功到达终点的迷宫数量。"
          }
        }
      },
      professional: {
        construct: "空间导航与路线规划",
        procedure: "迷宫由递归回溯算法从 seed+mazeIndex 生成（完美迷宫，唯一解）；参与者从左上角导航至右下角；服务端重建迷宫、逐步验证移动合法性并计算最优路径（BFS）；路径效率 = 最优路径长度 / 实际移动步数。",
        interpretation: "路径效率 1.0 表示走了最短路线；效率受策略（右手法则 vs 目标导向）影响。移动合法性由服务端逐步验证，穿墙提交直接拒绝。",
        confounders: [
          "屏幕尺寸影响迷宫显示和导航体验。",
          "策略差异（右手法则 vs 目标导向）影响路径效率。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        metricNotes: {
          "pathEfficiency": {
            "definition": "已完成迷宫的最优路径长度之和 / 实际移动步数之和；未全部完成时为 null。",
            "readingHint": "1.0 = 全走最短路线；越低说明绕路越多。"
          },
          "completedCount": {
            "definition": "成功到达终点的迷宫数。",
            "readingHint": "与总迷宫数对照阅读。"
          },
          "totalDeadEnds": {
            "definition": "累计进入已访问格子的次数。",
            "readingHint": "反映空间规划的准确性。"
          },
          "medianCompletionTimeMs": {
            "definition": "已完成迷宫的完成用时中位数。",
            "readingHint": "与路径效率同读。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划迷宫数"
          },
          {
            "key": "mazeCols",
            "label": "迷宫列数"
          },
          {
            "key": "timeLimitMs",
            "label": "时间限制（毫秒）"
          }
        ]
      }
    }
  },
]
