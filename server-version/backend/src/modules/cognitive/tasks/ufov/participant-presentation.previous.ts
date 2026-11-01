import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.1",
    testType: "ufov",
    engineVersion: "1.0.1",
    scoringVersion: "1.0.0",
    title: "有用视野",
    metrics: {
      "dualCorrectRate": {
        "label": "双重正确率",
        "explanation": "双重正确率：中心判别和周边定位两题都答对的比例。",
        "singleExplanation": "双重正确率：中心和周边两题都答对的比例。"
      },
      "centralAccuracy": {
        "label": "中心判别正确率",
        "explanation": "中心判别正确率：中心的图形是圆形还是三角形，答对的比例。",
        "singleExplanation": "中心判别正确率：中心图形答对的比例。"
      },
      "peripheralAccuracy": {
        "label": "周边定位正确率",
        "explanation": "周边定位正确率：周边亮点出现的位置，点对的比例。",
        "singleExplanation": "周边定位正确率：周边亮点位置点对的比例。"
      },
      "dualCorrectCount": {
        "label": "双重正确数"
      },
      "medianRtMs": {
        "label": "有效作答用时中位数"
      }
    },
    experienceHeadline: "dualCorrectRate",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["眼睛盯住中心图形，余光注意周边亮点。", "先答中心的，再点周边的，两题都别漏。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次双重任务的表现，不是注意力诊断、驾驶能力评估或年龄常模判断。",
    reportReading: {
      version: "1.0.1",
      title: "中心和余光，你能同时顾到吗？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你中心加周边两题都答对的比例是 {dualCorrectRate}；中心判别正确率是 {centralAccuracy}。",
        metricKeys: ["dualCorrectRate", "centralAccuracy"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你两题都答对的比例是 {dualCorrectRate}；体验版仅供体验。",
          metricKeys: ["dualCorrectRate"]
        }
      },
      studentMetricKeys: ["dualCorrectRate", "centralAccuracy", "peripheralAccuracy"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "insufficientValidRt", "lowAccuracy"],
      metricGates: {},
      nextStep: "把中心、周边和两者同时正确的比例放在一起看。一次差异可能受刺激辨识、位置记忆、作答顺序或设备影响，不能据此判断注意功能缺陷。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["centralAccuracy", "peripheralAccuracy"]
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
        concept: "眼睛盯住屏幕中心的图形，同时用余光注意周边闪过的亮点。图形消失后，你要回答两个问题：中心是什么形状？亮点在哪个方向？本任务只记录固定时长和固定屏幕位置下的中心判别与周边定位，不能测出余光范围或视野大小。",
        takeaway: "在本次固定呈现条件下，看看中心和周边的答案各记录了什么。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "开车看前方路牌时留意旁边行人、打球时看球又注意队友位置，都是分配注意。这个任务只测其中一小部分，不代表你的驾驶能力或运动能力。",
        scene: "signal",
        frames: [
          {
            "title": "盯中心",
            "text": "眼睛始终看中心图形。"
          },
          {
            "title": "余光注意",
            "text": "周边亮了一下——在哪个方向？"
          },
          {
            "title": "两题都答",
            "text": "先答中心形状，再点周边位置。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、驾驶资格或同龄人排名。",
        metricHelp: {
          "dualCorrectRate": {
            "label": "两题都对了多少",
            "explanation": "中心判别和周边定位同时答对的比例。"
          },
          "centralAccuracy": {
            "label": "中心答对了多少",
            "explanation": "中心图形判别正确的比例。"
          },
          "peripheralAccuracy": {
            "label": "周边点对了多少",
            "explanation": "周边亮点位置选对的比例。"
          }
        }
      },
      professional: {
        construct: "分配注意下的中心-周边同时加工（UFOV 简化版）",
        procedure: "每试次同时呈现中心图形（圆/三角 2AFC）与周边亮点（8 等分径向位置 1/8），持续 stimulusMs 后消失；参与者先做中心判别再做周边定位；服务端按 seed+trialIndex 重建刺激并推导正确性。",
        interpretation: "双重正确率为主要指标；中心与周边单项正确率可对照描述，但不能凭一次差异区分注意分配与基本判别问题；本版本未做自适应偏心率收缩，不能推断 UFOV 大小。",
        confounders: [
          "屏幕尺寸影响周边位置的视角偏心率。",
          "中心与周边任务的作答顺序固定（先中心后周边），顺序效应存在。",
          "本报告不提供经过验证的人口常模、诊断、注意力等级或驾驶安全结论。"
        ],
        metricNotes: {
          "dualCorrectRate": {
            "definition": "中心与周边同时正确且未中断的试次 / 计划总试次；中断试次保留在分母。",
            "readingHint": "主要指标；两题独立计分后合并。"
          },
          "centralAccuracy": {
            "definition": "未中断且中心图形判别正确的试次 / 计划总试次。",
            "readingHint": "与周边正确率对照阅读。"
          },
          "peripheralAccuracy": {
            "definition": "未中断且周边位置选对的试次 / 计划总试次。",
            "readingHint": "与中心正确率对照阅读。"
          },
          "dualCorrectCount": {
            "definition": "双重正确试次数。",
            "readingHint": "受总试次影响，跨 profile 不可比。"
          },
          "medianRtMs": {
            "definition": "有效作答（至少一项正确且 rtMs ≥ validRtFloorMs）的用时中位数。",
            "readingHint": "用时从刺激出现起算，包含展示和两题顺序作答；仅作描述，不能视为纯视觉反应时。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "stimulusMs",
            "label": "刺激呈现时长（毫秒）"
          }
        ]
      }
    }
  },
]
