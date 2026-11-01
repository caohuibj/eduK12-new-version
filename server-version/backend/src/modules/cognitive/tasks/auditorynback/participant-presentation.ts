import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.1",
    testType: "auditorynback",
    engineVersion: "1.0.1",
    scoringVersion: "1.0.0",
    title: "听觉 n-back 工作记忆",
    metrics: {
      "dPrime": {
        "label": "d′",
        "explanation": "d′：由命中率与误报率共同计算的区分指标，描述本次区分匹配与非匹配音的情况；不是容量、智力或能力等级。",
        "singleExplanation": "d′：你分辨匹配音的敏锐程度。"
      },
      "hitRate": {
        "label": "命中率",
        "explanation": "命中率：出现匹配音时你按键的比例。"
      },
      "falseAlarmRate": {
        "label": "误报率",
        "explanation": "误报率：不是匹配音时你按了键的比例。"
      },
      "medianHitRtMs": {
        "label": "命中中位反应时"
      },
      "matchCount": {
        "label": "匹配试次数"
      },
      "nonmatchCount": {
        "label": "非匹配试次数"
      }
    },
    experienceHeadline: "dPrime",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["在心里轻轻记住最近两个音，新音响起时和「往前第二个」比较。", "不要把整段旋律都记住，只追踪滑动窗口内的两个音。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次听觉工作记忆更新表现，不是诊断或人口常模判断。",
    reportReading: {
      version: "1.0.1",
      title: "听到新音时，你如何边记边比较？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，本次匹配区分指标 d′ 为 {dPrime}。",
        metricKeys: ["dPrime"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你的 d′ 为 {dPrime}；体验版试次少，仅供体验。",
          metricKeys: ["dPrime"]
        }
      },
      studentMetricKeys: ["dPrime", "hitRate"],
      processMetricKeys: ["falseAlarmRate", "medianHitRtMs"],
      withholdFlags: ["legacyUninterpretable", "insufficientTargets", "excessiveOmissions", "floorPerformance", "stimulusEchoMismatch"],
      metricGates: {},
      nextStep: "先确认是否有足够的匹配和非匹配记录，再结合命中率与误报率阅读。想再尝试时，可以先重看例子；熟悉任务后的变化不等同于日常能力或训练效果提高。",
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
        concept: "你会在耳机里听到一串高低不同的音。规则只有一条：新音和「往前数第二个」一样时，就按键。你脑中要像拿着一张便签，不断把旧音划掉、写上新音——这个「不断更新」的动作，正是工作记忆的核心。",
        takeaway: "这次任务需要边听边更新；单次表现不等于记忆容量或日常能力。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "传话时记住「先找张老师，再找李老师」，中途计划还会被打断更新——这种脑子里随时改清单的能力，就是听觉工作记忆在干活。",
        scene: "signal",
        frames: [
          {
            "title": "听新音",
            "text": "每个音只响很短的时间。"
          },
          {
            "title": "和往前第二个比",
            "text": "一样就按键，不一样就等下一个。"
          },
          {
            "title": "随时更新",
            "text": "脑中的「便签」永远只留最近两个音。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "dPrime": {
            "label": "分得有多准",
            "explanation": "结合本次命中和误报情况的区分指标，不直接判断猜测或能力等级。"
          },
          "hitRate": {
            "label": "抓住了多少",
            "explanation": "出现匹配音时你按键的比例。"
          },
          "falseAlarmRate": {
            "label": "非匹配音的按键比例",
            "explanation": "不是匹配音时你按了键的比例。"
          }
        }
      },
      professional: {
        construct: "听觉信息的滑动窗口保持与更新（工作记忆更新）",
        procedure: "纯音序列（toneFrequenciesHz）以 stimulusMs/isiMs 节奏播放；位置 i（i≥nLevel）按 targetRatio 决定是否与第 i−n 音相同；参与者在匹配音出现时按键（响应窗口覆盖音符与静默期）。音序列由服务端按 randomSeed 重建；d′ 采用 Hautus 校正。",
        interpretation: "d′ 综合命中率与误报率，是主要指标；漏按率高提示注意脱离，误报率高提示反应标准偏松（criterion shift）；命中反应时可作为次要参考。",
        confounders: [
          "音高辨别困难（听力或设备问题）会被误判为记忆失败；施测前需完成音量自检。",
          "音频输出延迟影响 rt 对齐但不影响命中/误报判定。",
          "本报告不提供经过验证的人口常模、诊断或学习障碍结论。"
        ],
        metricNotes: {
          "dPrime": {
            "definition": "Hautus 校正 d′ = Φ⁻¹((hits+0.5)/(matchN+1)) − Φ⁻¹((FA+0.5)/(nonmatchN+1))。",
            "readingHint": "0 附近为随机水平；分数锚点 d′ 0→0、4→100。"
          },
          "hitRate": {
            "definition": "hits / matchCount。",
            "readingHint": "与 falseAlarmRate 联合阅读。"
          },
          "falseAlarmRate": {
            "definition": "falseAlarms / nonmatchCount。",
            "readingHint": "偏高提示反应标准偏松。"
          },
          "medianHitRtMs": {
            "definition": "命中试次（rtMs 非空）反应时中位数。",
            "readingHint": "描述性指标，不进入主结论。"
          },
          "matchCount": {
            "definition": "服务端序列中 seq[i]==seq[i−n] 的位置数（i≥n）。",
            "readingHint": "由设计决定；低于 6 触发 insufficientTargets。"
          },
          "nonmatchCount": {
            "definition": "服务端序列中非匹配位置数。",
            "readingHint": "与 matchCount 对照阅读。"
          }
        },
        configFields: [
          {
            "key": "nLevel",
            "label": "n 水平"
          },
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "targetRatio",
            "label": "目标比例"
          },
          {
            "key": "stimulusMs",
            "label": "音符时长（毫秒）"
          },
          {
            "key": "isiMs",
            "label": "静默间隔（毫秒）"
          },
          {
            "key": "toneFrequenciesHz",
            "label": "纯音频率集（Hz）"
          }
        ]
      }
    }
  },
]
