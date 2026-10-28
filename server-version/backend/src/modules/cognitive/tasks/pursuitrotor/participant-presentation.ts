import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.0",
    testType: "pursuitrotor",
    engineVersion: "1.0.0",
    scoringVersion: "1.0.0",
    title: "追踪旋转",
    metrics: {
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
    experienceHeadline: "onTargetRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["眼睛看着目标点的前方一点，不要盯着指针。", "手臂放松，用手腕而不是整条手臂来追踪。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次追踪运动的表现，不是运动能力诊断或年龄常模判断。",
    reportReading: {
      version: "1.0.0",
      title: "跟着转动的点走，你跟得稳吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你的指针有 {onTargetRate} 的时间在目标上。",
        metricKeys: ["onTargetRate"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的指针有 {onTargetRate} 的时间在目标上；体验版仅供体验。",
          metricKeys: ["onTargetRate"]
        }
      },
      studentMetricKeys: ["onTargetRate"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "noTracking", "lowTracking"],
      metricGates: {},
      nextStep: "这个比例反映视觉引导下的手眼协调；多练习会明显提升，属正常学习效应。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["onTargetRate"]
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
        concept: "一个小圆点沿着圆形轨道匀速转动。你把指针放在它上面，跟着它一起转——看你能跟多久不离。这个任务测的是视觉引导下的手眼协调。",
        takeaway: "眼睛看前方一点，手腕跟上，比死盯指针更稳。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "写字、用筷子夹菜、打球时的手感，都依赖视觉引导的精细运动控制。它只是感觉运动能力的一小部分，不代表你的运动能力或反应力全貌。",
        scene: "signal",
        frames: [
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
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "onTargetRate": {
            "label": "跟住了多少",
            "explanation": "指针停留在移动目标上的时间占总追踪时间的比例。"
          }
        }
      },
      professional: {
        construct: "视觉引导的精细运动追踪",
        procedure: "目标点沿圆轨道以恒定角速度转动（revolutionMs 毫秒/圈），参与者用指针尽量保持在其上；每轮 trackMs 毫秒；在目标上时间比 = 在目标上时间 / 总追踪时间。",
        interpretation: "时间比越高表示追踪越稳；学习效应显著（多轮后提升属正常），设备差异影响精度。",
        confounders: [
          "鼠标/触控的采样率与延迟影响时间比精度。",
          "设备差异（触屏 vs 鼠标）导致追踪表现不可直接比较。",
          "本报告不提供经过验证的人口常模、诊断、运动能力或感觉统合结论。"
        ],
        metricNotes: {
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
        configFields: [
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
]
