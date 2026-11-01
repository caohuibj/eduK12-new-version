import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "pursuitrotor",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "追踪旋转",
    "metrics": {
      "onTargetRate": {
        "label": "在目标上时间比",
        "explanation": "在目标上时间比：指针停留在移动目标上的时间占总追踪时间的比例。",
        "singleExplanation": "在目标上时间比：指针停在移动目标上的时间比例。"
      },
      "totalTimeOnTargetMs": {
        "label": "累计在目标上时间"
      },
      "totalTrackMs": {
        "label": "累计追踪总时长"
      }
    },
    "experienceHeadline": "onTargetRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "眼睛看着目标点的前方一点，不要盯着指针。",
      "手臂放松，用手腕而不是整条手臂来追踪。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次追踪运动的表现，不是运动能力诊断或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "跟着转动的点走，你跟得稳吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的指针有 {onTargetRate} 的时间在目标上。",
        "metricKeys": [
          "onTargetRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的指针有 {onTargetRate} 的时间在目标上；体验版仅供体验。",
          "metricKeys": [
            "onTargetRate"
          ]
        }
      },
      "studentMetricKeys": [
        "onTargetRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "noTracking",
        "lowTracking"
      ],
      "metricGates": {},
      "nextStep": "先结合本次追踪时长阅读这个比例。设备、指针方式和对轨道的熟悉程度都可能影响记录；再次尝试可先放松手部、确认目标看得清。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "onTargetRate"
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
        "concept": "一个小圆点沿着圆形轨道匀速转动。你把指针放在它上面，跟着它一起转——看你能跟多久不离。这个任务记录本次视觉引导下的追踪表现。",
        "takeaway": "先看清移动目标，再用舒适的方式跟随；这次表现不代表整体运动能力。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "写字、用筷子夹菜、打球时的手感，都依赖视觉引导的精细运动控制。它只是感觉运动能力的一小部分，不代表你的运动能力或反应力全貌。",
        "scene": "signal",
        "frames": [
          {
            "title": "看轨道",
            "text": "目标点沿着圆圈转动。"
          },
          {
            "title": "跟上它",
            "text": "把指针放在目标点上面尽量不离。"
          },
          {
            "title": "看比例",
            "text": "在目标上的时间越长越好。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "onTargetRate": {
            "label": "跟住了多少",
            "explanation": "指针停留在移动目标上的时间占总追踪时间的比例。"
          }
        }
      },
      "professional": {
        "construct": "视觉引导的精细运动追踪",
        "procedure": "目标点沿圆轨道以恒定角速度转动（revolutionMs 毫秒/圈），参与者用指针尽量保持在其上；每轮 trackMs 毫秒；在目标上时间比 = 在目标上时间 / 总追踪时间。",
        "interpretation": "时间比越高表示追踪越稳；学习效应显著（多轮后提升属正常），设备差异影响精度。",
        "confounders": [
          "鼠标/触控的采样率与延迟影响时间比精度。",
          "设备差异（触屏 vs 鼠标）导致追踪表现不可直接比较。",
          "本报告不提供经过验证的人口常模、诊断、运动能力或感觉统合结论。"
        ],
        "metricNotes": {
          "onTargetRate": {
            "definition": "有效轮次的 timeOnTargetMs 之和 / 有效轮次的 min(totalTrackMs, trackMs) 之和。",
            "readingHint": "越高表示追踪越稳；学习效应显著。"
          },
          "totalTimeOnTargetMs": {
            "definition": "有效轮次的在目标上时间累计。",
            "readingHint": "受轮次数影响，跨 profile 不可比。"
          },
          "totalTrackMs": {
            "definition": "有效轮次的追踪时长累计（不超过 config.trackMs）。",
            "readingHint": "与 totalTimeOnTargetMs 对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划轮次数"
          },
          {
            "key": "trackMs",
            "label": "每轮追踪时长（毫秒）"
          },
          {
            "key": "revolutionMs",
            "label": "每圈时长（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "pursuitrotor",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "跟着小圆点移动",
    "metrics": {
      "onTargetRate": {
        "label": "指针命中目标的时间比例",
        "explanation": "指针中心距目标中心不超过28屏幕像素（目标半径18加指针半径10）算命中；分母为非中断轮实际追踪时长，每轮按配置封顶；无有效时长为缺失。",
        "singleExplanation": "指针中心距目标中心不超过28屏幕像素（目标半径18加指针半径10）算命中；分母为非中断轮实际追踪时长，每轮按配置封顶；无有效时长为缺失。"
      },
      "totalTimeOnTargetMs": {
        "label": "累计在目标上时间"
      },
      "totalTrackMs": {
        "label": "累计追踪总时长"
      }
    },
    "experienceHeadline": "onTargetRate",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "目标沿圆轨道移动，你控制指针跟随。报告按实际记录到的追踪时间，计算指针与目标接触的比例。",
        "reportCaveats": [
          "本次正式任务共2轮追踪，每轮20秒。另有20秒练习。",
          "体验约1.5–2分钟；研究约3–5分钟（流程估计，非实测）。",
          "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
          "与官方PEBL圆轨鼠标追踪属同类范式。固定源码默认4轮×15秒，角度计算为每秒0.1333333圈；本版研究8轮×20秒、每秒0.25圈，几何与采样不同，不是PEBL标准协议复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "目标沿圆轨道移动，你控制指针跟随。报告按实际记录到的追踪时间，计算指针与目标接触的比例。",
        "reportCaveats": [
          "本次正式任务共4轮追踪，每轮20秒。另有20秒练习。",
          "体验约1.5–2分钟；研究约3–5分钟（流程估计，非实测）。",
          "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
          "与官方PEBL圆轨鼠标追踪属同类范式。固定源码默认4轮×15秒，角度计算为每秒0.1333333圈；本版研究8轮×20秒、每秒0.25圈，几何与采样不同，不是PEBL标准协议复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "目标沿圆轨道移动，你控制指针跟随。报告按实际记录到的追踪时间，计算指针与目标接触的比例。",
        "reportCaveats": [
          "本次正式任务共8轮追踪，每轮20秒。另有20秒练习。",
          "体验约1.5–2分钟；研究约3–5分钟（流程估计，非实测）。",
          "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
          "与官方PEBL圆轨鼠标追踪属同类范式。固定源码默认4轮×15秒，角度计算为每秒0.1333333圈；本版研究8轮×20秒、每秒0.25圈，几何与采样不同，不是PEBL标准协议复刻。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "先调整坐姿、指针速度和操作空间，再尝试平顺跟随；不同设备的数据不宜直接相互比较。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
    "reportReading": {
      "version": "3.0.0",
      "title": "让指针尽量跟上小圆点",
      "introduction": "目标沿圆轨道移动，你控制指针跟随。报告按实际记录到的追踪时间，计算指针与目标接触的比例。",
      "summary": {
        "template": "实际记录追踪 {totalTrackMs}，其中指针命中目标累计 {totalTimeOnTargetMs}，所占比例为 {onTargetRate}。",
        "metricKeys": [
          "onTargetRate",
          "totalTrackMs",
          "totalTimeOnTargetMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "实际记录追踪 {totalTrackMs}，其中指针命中目标累计 {totalTimeOnTargetMs}，所占比例为 {onTargetRate}。",
          "metricKeys": [
            "onTargetRate",
            "totalTrackMs",
            "totalTimeOnTargetMs"
          ]
        }
      },
      "studentMetricKeys": [
        "onTargetRate",
        "totalTrackMs",
        "totalTimeOnTargetMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "noTracking",
        "lowTracking"
      ],
      "metricGates": {},
      "nextStep": "先调整坐姿、指针速度和操作空间，再尝试平顺跟随；不同设备的数据不宜直接相互比较。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "onTargetRate"
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
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "目标沿圆轨道移动，你控制指针跟随。报告按实际记录到的追踪时间，计算指针与目标接触的比例。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "用鼠标描着移动图形，或用手指跟着屏幕上的点走，都需要不断修正位置。这里的操作方式和设备本身也是任务的一部分。",
        "scene": "signal",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "2 / 4 / 8轮，每轮20秒，圆轨道每4秒一圈；另有20秒练习。"
          },
          {
            "title": "大概需要多久",
            "text": "体验约1.5–2分钟；研究约3–5分钟。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "先调整坐姿、指针速度和操作空间，再尝试平顺跟随；不同设备的数据不宜直接相互比较。"
          }
        ],
        "boundary": "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
        "metricHelp": {
          "onTargetRate": {
            "label": "指针命中目标的时间比例",
            "explanation": "指针中心距目标中心不超过28屏幕像素（目标半径18加指针半径10）算命中；分母为非中断轮实际追踪时长，每轮按配置封顶；无有效时长为缺失。"
          },
          "totalTrackMs": {
            "label": "累计追踪总时长",
            "explanation": "只描述本次记录。"
          },
          "totalTimeOnTargetMs": {
            "label": "累计在目标上时间",
            "explanation": "只描述本次记录。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "2 / 4 / 8轮，每轮20秒，圆轨道每4秒一圈；另有20秒练习。 与官方PEBL圆轨鼠标追踪属同类范式。固定源码默认4轮×15秒，角度计算为每秒0.1333333圈；本版研究8轮×20秒、每秒0.25圈，几何与采样不同，不是PEBL标准协议复刻。",
        "interpretation": "体验只有两轮，不能据此确定练习进步或稳定协调能力。帧率、输入方式、目标大小与中断都会影响比例。",
        "confounders": [
          "鼠标/触控的采样率与延迟影响时间比精度。",
          "设备差异（触屏 vs 鼠标）导致追踪表现不可直接比较。",
          "本报告不提供经过验证的人口常模、诊断、运动能力或感觉统合结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "onTargetRate": {
            "definition": "指针中心距目标中心不超过28屏幕像素（目标半径18加指针半径10）算命中；分母为非中断轮实际追踪时长，每轮按配置封顶；无有效时长为缺失。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "totalTimeOnTargetMs": {
            "definition": "有效轮次的在目标上时间累计。",
            "readingHint": "受轮次数影响，跨 profile 不可比。"
          },
          "totalTrackMs": {
            "definition": "有效轮次的追踪时长累计（不超过 config.trackMs）。",
            "readingHint": "与 totalTimeOnTargetMs 对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划轮次数"
          },
          {
            "key": "trackMs",
            "label": "每轮追踪时长（毫秒）"
          },
          {
            "key": "revolutionMs",
            "label": "每圈时长（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": []
      },
      "qualityLabels": {
        "lowTracking": "指针命中目标的时间比例较低"
      }
    }
  }
]
