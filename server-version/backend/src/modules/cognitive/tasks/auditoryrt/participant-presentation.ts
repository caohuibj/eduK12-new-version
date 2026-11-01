import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "auditoryrt",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "听觉简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "中位反应时",
        "explanation": "中位反应时：符合任务有效窗口的反应时中位数；这是软件记录的声音起点到按键用时，受到设备播放延迟影响。",
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
        "explanation": "抢拍次数：按现有规则归为过早反应的次数，包括声音前按键及声音起点后不足150毫秒的反应。"
      },
      "lapseCount": {
        "label": "漏失次数",
        "explanation": "漏失次数：未按键或反应超过1000毫秒的次数；不等同于听力问题。"
      }
    },
    "experienceHeadline": "medianRtMs",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "在安静环境施测，音量调到清晰可闻。",
      "手保持放松，听到声音立即按键，不要抢拍。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次听觉反应速度，不是听力诊断或人口常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "听到声音，你按得有多快？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次符合任务有效窗口的反应，中间一个用时为 {medianRtMs} 毫秒。",
        "metricKeys": [
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的中位反应时是 {medianRtMs} 毫秒；体验版仅供体验。",
          "metricKeys": [
            "medianRtMs"
          ]
        }
      },
      "studentMetricKeys": [
        "medianRtMs"
      ],
      "processMetricKeys": [
        "anticipationCount",
        "lapseCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials",
        "excessiveAnticipations",
        "highVariability"
      ],
      "metricGates": {},
      "nextStep": "反应速度会受到注意状态、音量、播放设备和按键方式的共同影响；单次结果仅供观察。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtMs",
          "rtCv"
        ]
      },
      "caveatTerms": {
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "房间里很安静。突然——「嘀」的一声，你立刻按键。听到声音再按键，需要听觉觉察、注意和动作配合，记录的总时间还受到设备播放延迟影响。这个任务观察的是一次特定条件下的反应时。",
        "takeaway": "听到再按，不抢拍；记录反映这次任务与设备条件，不用来判断聪明程度。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "听到身后自行车铃声马上让开、起跑线上听发令枪冲出去，都靠这条听觉反应通路。它受睡眠和状态影响很大，一次结果只是这一刻的快照。",
        "scene": "signal",
        "frames": [
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
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
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
      "professional": {
        "construct": "听觉信号检测到运动反应的加工速度",
        "procedure": "前瞻期在 foreperiodMinMs–foreperiodMaxMs 均匀抖动且避免连续重复后播放纯音（toneFrequencyHz，toneDurationMs）；参与者在声音响起后尽快按键；maxRtWindowMs 内无按键记漏失。RT = 声音起点到按键；早于 150ms 记预期反应。",
        "interpretation": "中位 RT 越短表示听觉加工速度越快；变异系数反映反应稳定性；预期反应过多提示节奏预期或指令理解偏差。",
        "confounders": [
          "音频输出延迟（蓝牙耳机可达 100ms+）会整体抬高 RT；audioLatencyMs 随试次留痕。",
          "音量与播放设备差异影响可听性。",
          "本报告不提供经过验证的人口常模、听力诊断或神经学结论。"
        ],
        "metricNotes": {
          "medianRtMs": {
            "definition": "有效试次（150ms ≤ rtMs ≤ 1000ms）反应时的中位数。",
            "readingHint": "与有效次数、过早反应及未答次数同读；设备播放延迟也会影响记录。"
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
        "configFields": [
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
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "auditoryrt",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "提示出现后，多久作出反应",
    "metrics": {
      "medianRtMs": {
        "label": "典型有效反应用时（中位数）",
        "explanation": "把150–1000毫秒内的有效反应用时排好序，取中间的代表值；偶数个时取中间两个的平均。1毫秒是千分之一秒，记录包含设备影响。",
        "singleExplanation": "把150–1000毫秒内的有效反应用时排好序，取中间的代表值；偶数个时取中间两个的平均。1毫秒是千分之一秒，记录包含设备影响。"
      },
      "meanRtMs": {
        "label": "有效反应平均用时"
      },
      "rtSdMs": {
        "label": "有效反应用时的波动大小"
      },
      "rtCv": {
        "label": "相对平均用时的波动比例",
        "explanation": "本次有效反应的标准差除以平均用时，描述相对波动，不是稳定能力或常模。"
      },
      "validCount": {
        "label": "有效试次数"
      },
      "anticipationCount": {
        "label": "过早反应次数",
        "explanation": "抢拍次数：按现有规则归为过早反应的次数，包括声音前按键及声音起点后不足150毫秒的反应。"
      },
      "lapseCount": {
        "label": "漏失次数",
        "explanation": "漏失次数：未按键或反应超过1000毫秒的次数；不等同于听力问题。"
      }
    },
    "experienceHeadline": "medianRtMs",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先确认音量舒适、环境安静，比较时保持设备与输入方式一致。一次短体验不能判断反应能力或健康状况。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次听觉反应速度，不是听力诊断或人口常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "提示出现后，多久作出反应",
      "introduction": "像听到提示音后点一下，这里记录电脑上的一次提示与按键过程，不是纯听觉神经传导速度。",
      "summary": {
        "template": "本次有效反应的典型用时为 {medianRtMs}；这是含设备影响的任务记录。",
        "metricKeys": [
          "medianRtMs"
        ]
      },
      "summaryByProfile": {},
      "studentMetricKeys": [
        "medianRtMs"
      ],
      "processMetricKeys": [
        "anticipationCount",
        "lapseCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials",
        "excessiveAnticipations",
        "highVariability"
      ],
      "metricGates": {},
      "nextStep": "先确认音量舒适、环境安静，比较时保持设备与输入方式一致。一次短体验不能判断反应能力或健康状况。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtMs",
          "rtCv"
        ]
      },
      "caveatTerms": {
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "像听到提示音后点一下，这里记录电脑上的一次提示与按键过程，不是纯听觉神经传导速度。",
        "takeaway": "提示出现再按，先看有效次数，再读这次设备上的用时。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "当前同时出现可见提示；只汇总150–1000毫秒范围内的有效反应。耳机、音频延迟和设备会影响记录。",
        "scene": "signal",
        "frames": [
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
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "medianRtMs": {
            "label": "典型有效反应用时（中位数）",
            "explanation": "把150–1000毫秒内的有效反应用时排好序，取中间的代表值；偶数个时取中间两个的平均。1毫秒是千分之一秒，记录包含设备影响。"
          },
          "rtCv": {
            "label": "相对平均用时的波动比例",
            "explanation": "本次有效反应的标准差除以平均用时，描述相对波动，不是稳定能力或常模。"
          }
        }
      },
      "professional": {
        "construct": "带同步视觉提示的浏览器合成音反应记录",
        "procedure": "随机等待1–4秒后播放880Hz、120毫秒提示音，同步显示声音图标。1500毫秒响应窗中，150–1000毫秒才进入有效RT；输出延迟仅留痕，没有物理校准。",
        "interpretation": "典型用时只汇总150–1000毫秒反应。图标同时可见，音频输出与输入延迟未校正；不是纯听觉加工速度。早按、漏失与中断需同读，跨设备不直接排快慢。",
        "confounders": [
          "音频输出延迟（蓝牙耳机可达 100ms+）会整体抬高 RT；audioLatencyMs 随试次留痕。",
          "音量与播放设备差异影响可听性。",
          "本报告不提供经过验证的人口常模、听力诊断或神经学结论。"
        ],
        "metricNotes": {
          "medianRtMs": {
            "definition": "有效试次（150ms ≤ rtMs ≤ 1000ms）反应时的中位数。",
            "readingHint": "与有效次数、过早反应及未答次数同读；设备播放延迟也会影响记录。"
          },
          "meanRtMs": {
            "definition": "有效试次反应时的算术平均。",
            "readingHint": "对长尾敏感，与中位数对照阅读。"
          },
          "rtSdMs": {
            "definition": "本次有效RT相对均值的平方偏差，除以有效个数n后开方（总体口径）。",
            "readingHint": "不是除以n−1的样本标准差；有效个数少时仅作本次描述。"
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
        "configFields": [
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
  }
]
