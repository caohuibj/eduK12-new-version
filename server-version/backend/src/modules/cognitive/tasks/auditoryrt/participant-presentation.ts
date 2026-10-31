import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "auditoryrt",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "听觉简单反应时",
    metrics: {
      "medianRtMs": {
        "label": "中位反应时",
        "explanation": "中位反应时：从声音响起到你按键的时间的中位数，越短说明听觉反应越快。",
        "singleExplanation": "中位反应时：你按下按键快慢的代表值。"
      },
      "meanRtMs": {
        "label": "平均反应时"
      },
      "rtSdMs": {
        "label": "反应时标准差"
      },
      "rtCv": {
        "label": "反应时波动系数",
        "explanation": "反应时波动系数：反应快慢的稳定程度，越小越稳定。"
      },
      "validCount": {
        "label": "有效试次数"
      },
      "anticipationCount": {
        "label": "抢拍次数",
        "explanation": "抢拍次数：还没听到声音就提前按的次数。"
      },
      "lapseCount": {
        "label": "漏失次数",
        "explanation": "漏失次数：声音响后没来得及按或没按的次数。"
      }
    },
    experienceHeadline: "medianRtMs",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["在安静环境施测，音量调到清晰可闻。", "手保持放松，听到声音立即按键，不要抢拍。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次听觉反应速度，不是听力诊断或人口常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "听到声音，你按得有多快？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你从中位水平算的反应时是 {medianRtMs} 毫秒。",
        metricKeys: ["medianRtMs"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的中位反应时是 {medianRtMs} 毫秒；体验版仅供体验。",
          metricKeys: ["medianRtMs"]
        }
      },
      studentMetricKeys: ["medianRtMs"],
      processMetricKeys: ["anticipationCount", "lapseCount"],
      withholdFlags: ["legacyUninterpretable", "insufficientValidTrials", "excessiveAnticipations", "highVariability"],
      metricGates: {},
      nextStep: "反应速度会受到注意状态、音量、播放设备和按键方式的共同影响；单次结果仅供观察。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["medianRtMs", "rtCv"]
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
        concept: "房间里很安静。突然——「嘀」的一声，你立刻按键。听到声音再按键，需要听觉觉察、注意和动作配合，记录的总时间还受到设备播放延迟影响。这个任务观察的是一次特定条件下的反应时。",
        takeaway: "听到再按，不抢拍；反应快不等于聪明，它只是大脑的一条快车道。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "听到身后自行车铃声马上让开、起跑线上听发令枪冲出去，都靠这条听觉反应通路。它受睡眠和状态影响很大，一次结果只是这一刻的快照。",
        scene: "signal",
        frames: [
          {
            "title": "安静等待",
            "text": "屏幕上只有提示，不知道声音什么时候响。"
          },
          {
            "title": "声音一响",
            "text": "「嘀」——立刻按键。"
          },
          {
            "title": "看速度",
            "text": "记录本次反应快慢和稳定性，同时留意设备差异。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "medianRtMs": {
            "label": "按得有多快",
            "explanation": "从声音响起到按键的时间的代表值，越短越快。"
          },
          "rtCv": {
            "label": "按得有多稳",
            "explanation": "每次反应快慢的波动程度，越小越稳定。"
          }
        }
      },
      professional: {
        construct: "听觉信号检测到运动反应的加工速度",
        procedure: "前瞻期在 foreperiodMinMs–foreperiodMaxMs 均匀抖动且避免连续重复后播放纯音（toneFrequencyHz，toneDurationMs）；参与者在声音响起后尽快按键；maxRtWindowMs 内无按键记漏失。RT = 声音起点到按键；早于 150ms 记预期反应。",
        interpretation: "中位 RT 越短表示听觉加工速度越快；变异系数反映反应稳定性；预期反应过多提示节奏预期或指令理解偏差。",
        confounders: [
          "音频输出延迟（蓝牙耳机可达 100ms+）会整体抬高 RT；audioLatencyMs 随试次留痕。",
          "音量与播放设备差异影响可听性。",
          "本报告不提供经过验证的人口常模、听力诊断或神经学结论。"
        ],
        metricNotes: {
          "medianRtMs": {
            "definition": "有效试次（150ms ≤ rtMs ≤ 1000ms）反应时的中位数。",
            "readingHint": "越短越快；分数锚点 220ms→100、700ms→0。"
          },
          "meanRtMs": {
            "definition": "有效试次反应时的算术平均。",
            "readingHint": "对长尾敏感，与中位数对照阅读。"
          },
          "rtSdMs": {
            "definition": "有效试次反应时的样本标准差。",
            "readingHint": "绝对波动量，随反应时水平变化。"
          },
          "rtCv": {
            "definition": "rtSdMs / meanRtMs。",
            "readingHint": "去量纲的稳定性指标；超过 0.5 触发质量旗标。"
          },
          "validCount": {
            "definition": "落在有效窗口内的试次数。",
            "readingHint": "低于计划数一半触发 limited。"
          },
          "anticipationCount": {
            "definition": "rtMs < 150ms 的试次数（含提前按键记 0 的试次）。",
            "readingHint": "占比达 0.3 触发质量旗标。"
          },
          "lapseCount": {
            "definition": "rtMs > 1000ms 或无按键的试次数。",
            "readingHint": "反映注意维持，不直接计入速度。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "foreperiodMinMs",
            "label": "前瞻期下限（毫秒）"
          },
          {
            "key": "foreperiodMaxMs",
            "label": "前瞻期上限（毫秒）"
          },
          {
            "key": "toneFrequencyHz",
            "label": "纯音频率（Hz）"
          },
          {
            "key": "toneDurationMs",
            "label": "纯音时长（毫秒）"
          },
          {
            "key": "maxRtWindowMs",
            "label": "应答窗口（毫秒）"
          }
        ]
      }
    }
  },
]
