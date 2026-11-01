import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    schemaVersion: 1,
    presentationVersion: "1.0.1",
    testType: "timecopy",
    engineVersion: "1.0.1",
    scoringVersion: "1.0.0",
    title: "时间间隔复制",
    metrics: {
      "meanAbsErrorRatio": {
        "label": "平均相对误差",
        "explanation": "平均相对误差：你复制的时长与目标时长平均差多少（相对目标的比例），越小越准。",
        "singleExplanation": "平均相对误差：复制的时长与目标时长平均差多少。"
      },
      "biasRatio": {
        "label": "方向偏差",
        "explanation": "方向偏差：整体上你复制得偏长还是偏短；正值表示平均偏长，负值表示平均偏短；接近 0 也可能是长短偏差相互抵消。",
        "singleExplanation": "方向偏差：整体上你复制得偏长还是偏短。"
      },
      "withinTwentyRate": {
        "label": "20%内命中率",
        "explanation": "20%内命中率：复制误差不超过目标时长 20% 的试次比例。",
        "singleExplanation": "20%内命中率：复制误差不超过目标时长 20% 的试次比例。"
      },
      "medianReproductionMs": {
        "label": "复制时长中位数",
        "explanation": "复制时长中位数：各试次复制出的时长的典型值。",
        "singleExplanation": "复制时长中位数：各试次复制出的时长的典型值。"
      }
    },
    experienceHeadline: "meanAbsErrorRatio",
    hiddenMetrics: [],
    suppressTips: false,
    protocols: {},
    practicalTips: ["心里默数或感受节奏都可以，选一种并保持一致。", "复制时不要看表，凭感觉按下结束。"],
    singleHiddenMetrics: [],
    disclaimer: "结果只描述本次时间复制表现，不是注意力、时间管理或年龄常模判断。",
    reportReading: {
      version: "1.0.1",
      title: "你心里的秒表有多准？",
      introduction: "从这次作答出发，读懂一个与你有关的认知过程。",
      summary: {
        template: "这一次，你复制的时长平均偏离目标 {meanAbsErrorRatio}；整体方向偏差为 {biasRatio}。",
        metricKeys: ["meanAbsErrorRatio", "biasRatio"]
      },
      summaryByProfile: {
        experience: {
          template: "这次简短体验中，你复制的时长平均偏离目标 {meanAbsErrorRatio}；轮次较少，方向偏差容易受个别试次影响。",
          metricKeys: ["meanAbsErrorRatio"]
        }
      },
      studentMetricKeys: ["meanAbsErrorRatio", "withinTwentyRate", "biasRatio"],
      processMetricKeys: [],
      withholdFlags: ["legacyUninterpretable", "emptyResponses", "excessiveDeviation"],
      metricGates: {
        "biasRatio": ["emptyResponses"],
        "withinTwentyRate": ["emptyResponses"]
      },
      nextStep: "先看平均误差，再看是整体偏长还是偏短；再回想自己是否默数或跟随节奏；方向偏差接近 0 也可能是长短误差抵消。",
      chart: {
        "kind": "metrics",
        "metricKeys": ["meanAbsErrorRatio", "biasRatio"]
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
        concept: "每题先看一段光亮起又熄灭——记住它亮了多久。然后由你来当秒表：点开始，凭感觉觉得到了同样的时长，再点结束。这里看的是你内部时间感的准头。",
        takeaway: "可以留意自己怎样估计时间：默数、节奏和当时的专注程度都可能影响这次结果。",
        exampleTitle: "走出任务：生活里的一个例子",
        example: "把握煮蛋的时间、留出赶车的时间、控制演讲节奏，都在用内部计时。这只是时间感知的一小部分，不代表你的时间管理能力。",
        scene: "sequence",
        frames: [
          {
            "title": "看光亮",
            "text": "记住光亮持续了多久。"
          },
          {
            "title": "点开始",
            "text": "从你按下那一刻开始计时。"
          },
          {
            "title": "点结束",
            "text": "觉得到了同样的时长就按结束。"
          }
        ],
        boundary: "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        metricHelp: {
          "meanAbsErrorRatio": {
            "label": "平均差多远",
            "explanation": "复制时长与目标的平均相对差距，越小越准。"
          },
          "biasRatio": {
            "label": "整体偏长还是偏短",
            "explanation": "正值表示平均复制偏长，负值表示平均偏短；接近 0 不等于每次都准确。"
          },
          "withinTwentyRate": {
            "label": "贴得很近的比例",
            "explanation": "误差不超过目标 20% 的试次比例。"
          }
        }
      },
      professional: {
        construct: "时间间隔复制（reproduction）",
        procedure: "每试次呈现 targetMin..targetMax 内随机目标间隔（视觉光条），随后两击复制（开始/结束），复制时长由 maxResponseMs 封顶；相对误差 = (复制 − 目标)/目标，方向偏差为其有符号均值。",
        interpretation: "平均相对误差越低越准；方向偏差受策略（默数/节律）影响，属个体差异而非纯误差，不构成能力等级。",
        confounders: [
          "默数与节律策略改变计时方式。",
          "设备输入延迟影响起止时间记录。",
          "本报告不提供经过验证的人口常模、诊断、注意力或时间管理能力等级结论。"
        ],
        metricNotes: {
          "meanAbsErrorRatio": {
            "definition": "|复制 − 目标|/目标 的算术平均。",
            "readingHint": "越低越准；达到 1 触发误差过量标记。"
          },
          "biasRatio": {
            "definition": "(复制 − 目标)/目标 的有符号均值。",
            "readingHint": "与平均误差同读；不代表每次都偏。"
          },
          "withinTwentyRate": {
            "definition": "相对误差不超过 0.2 的试次比例。",
            "readingHint": "描述性命中率，不是及格线。"
          },
          "medianReproductionMs": {
            "definition": "有效复制时长的中位数。",
            "readingHint": "与目标范围对照阅读。"
          }
        },
        configFields: [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "targetMinMs",
            "label": "目标下限（毫秒）"
          },
          {
            "key": "targetMaxMs",
            "label": "目标上限（毫秒）"
          }
        ]
      }
    }
  },
  // Report 3.0.0: selected explicitly by a new draft config; legacy entries above stay unchanged.
{
  "schemaVersion": 1,
  "presentationVersion": "3.0.0",
  "testType": "timecopy",
  "engineVersion": "1.0.1",
  "scoringVersion": "1.0.0",
  "title": "把刚才的时长再按一遍",
  "metrics": {
    "meanAbsErrorRatio": {
      "label": "平均偏离目标的比例",
      "explanation": "每次先算|复制时长−目标时长|/目标时长，再对未中断试次求平均；不是毫秒。",
      "singleExplanation": "每次先算|复制时长−目标时长|/目标时长，再对未中断试次求平均；不是毫秒。"
    },
    "biasRatio": {
      "label": "偏长或偏短的平均比例",
      "explanation": "带符号的相对误差平均：正为偏长，负为偏短；正负可能相抵。",
      "singleExplanation": "带符号的相对误差平均：正为偏长，负为偏短；正负可能相抵。"
    },
    "withinTwentyRate": {
      "label": "落在目标±20%内的比例",
      "explanation": "分母为可计入的未中断复制；20%为项目描述范围，没有常模合格含义。",
      "singleExplanation": "分母为可计入的未中断复制；20%为项目描述范围，没有常模合格含义。"
    },
    "medianReproductionMs": {
      "label": "复制时长中位数",
      "explanation": "复制时长中位数：各试次复制出的时长的典型值。",
      "singleExplanation": "复制时长中位数：各试次复制出的时长的典型值。"
    }
  },
  "experienceHeadline": "meanAbsErrorRatio",
  "hiddenMetrics": [],
  "suppressTips": false,
  "protocols": {
    "experience": {
      "tier": "PILOT",
      "profileLabel": "简短体验",
      "participantConclusion": "先看色条持续一段时间，再按开始、结束，尽量重现它。报告记录每次偏离目标多少，以及整体偏长还是偏短。",
      "reportCaveats": [
        "本次正式任务共6次时长重现。另有1次练习，最多尝试2次。",
        "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
        "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
        "属于时间重现范式。Jazayeri 与 Shadlen 2010用两次闪光给出间隔、Set后一次按键重现并比较三种时间先验；本版用持续色条及两次点击，没有这些先验条件或约500次学习过程，不用于拟合该论文的机制结论。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    },
    "standard": {
      "tier": "PILOT",
      "profileLabel": "常规任务",
      "participantConclusion": "先看色条持续一段时间，再按开始、结束，尽量重现它。报告记录每次偏离目标多少，以及整体偏长还是偏短。",
      "reportCaveats": [
        "本次正式任务共10次时长重现。另有1次练习，最多尝试2次。",
        "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
        "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
        "属于时间重现范式。Jazayeri 与 Shadlen 2010用两次闪光给出间隔、Set后一次按键重现并比较三种时间先验；本版用持续色条及两次点击，没有这些先验条件或约500次学习过程，不用于拟合该论文的机制结论。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    },
    "research": {
      "tier": "PILOT",
      "profileLabel": "研究变式",
      "participantConclusion": "先看色条持续一段时间，再按开始、结束，尽量重现它。报告记录每次偏离目标多少，以及整体偏长还是偏短。",
      "reportCaveats": [
        "本次正式任务共20次时长重现。另有1次练习，最多尝试2次。",
        "体验约1–2分钟；研究约2–4分钟（流程估计，非实测）。",
        "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
        "属于时间重现范式。Jazayeri 与 Shadlen 2010用两次闪光给出间隔、Set后一次按键重现并比较三种时间先验；本版用持续色条及两次点击，没有这些先验条件或约500次学习过程，不用于拟合该论文的机制结论。",
        "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
      ],
      "showProductIndex": false
    }
  },
  "practicalTips": [
    "可以选一种心里计时方法并保持一致，再看看短间隔和长间隔是否有不同感受；这不是训练效果证明。"
  ],
  "singleHiddenMetrics": [],
  "disclaimer": "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
  "reportReading": {
    "version": "3.0.0",
    "title": "刚才那一小段时间，你会怎样重现？",
    "introduction": "先看色条持续一段时间，再按开始、结束，尽量重现它。报告记录每次偏离目标多少，以及整体偏长还是偏短。",
    "summary": {
      "template": "平均偏离目标时长的比例为 {meanAbsErrorRatio}；带方向的平均偏差为 {biasRatio}；落在目标±20%内的比例为 {withinTwentyRate}。",
      "metricKeys": [
        "meanAbsErrorRatio",
        "biasRatio",
        "withinTwentyRate"
      ]
    },
    "summaryByProfile": {
      "experience": {
        "template": "平均偏离目标时长的比例为 {meanAbsErrorRatio}；带方向的平均偏差为 {biasRatio}；落在目标±20%内的比例为 {withinTwentyRate}。",
        "metricKeys": [
          "meanAbsErrorRatio",
          "biasRatio",
          "withinTwentyRate"
        ]
      }
    },
    "studentMetricKeys": [
      "meanAbsErrorRatio",
      "biasRatio",
      "withinTwentyRate"
    ],
    "processMetricKeys": [],
    "withholdFlags": [
      "legacyUninterpretable",
      "emptyResponses",
      "excessiveDeviation"
    ],
    "metricGates": {
      "biasRatio": [
        "emptyResponses"
      ],
      "withinTwentyRate": [
        "emptyResponses"
      ]
    },
    "nextStep": "可以选一种心里计时方法并保持一致，再看看短间隔和长间隔是否有不同感受；这不是训练效果证明。",
    "chart": {
      "kind": "metrics",
      "metricKeys": [
        "meanAbsErrorRatio",
        "withinTwentyRate"
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
    "illustration": "sequence",
    "popular": {
      "conceptTitle": "这个小游戏在观察什么",
      "concept": "先看色条持续一段时间，再按开始、结束，尽量重现它。报告记录每次偏离目标多少，以及整体偏长还是偏短。",
      "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
      "exampleTitle": "生活里也会遇到",
      "example": "听完一个短节拍再轻敲两下，间隔未必刚好相同。默数、节奏和注意到按键的时刻都可能影响结果。",
      "scene": "sequence",
      "frames": [
        {
          "title": "任务怎样进行",
          "text": "6 / 10 / 20次；目标1–3秒；另有1次练习，最多2次尝试；复制阶段最多10秒。"
        },
        {
          "title": "大概需要多久",
          "text": "体验约1–2分钟；研究约2–4分钟。这是按流程估计，尚无本轮实测分布。"
        },
        {
          "title": "怎样读这次记录",
          "text": "可以选一种心里计时方法并保持一致，再看看短间隔和长间隔是否有不同感受；这不是训练效果证明。"
        }
      ],
      "boundary": "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
      "metricHelp": {
        "meanAbsErrorRatio": {
          "label": "平均偏离目标的比例",
          "explanation": "每次先算|复制时长−目标时长|/目标时长，再对未中断试次求平均；不是毫秒。"
        },
        "biasRatio": {
          "label": "偏长或偏短的平均比例",
          "explanation": "带符号的相对误差平均：正为偏长，负为偏短；正负可能相抵。"
        },
        "withinTwentyRate": {
          "label": "落在目标±20%内的比例",
          "explanation": "分母为可计入的未中断复制；20%为项目描述范围，没有常模合格含义。"
        }
      }
    },
    "professional": {
      "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
      "procedure": "6 / 10 / 20次；目标1–3秒；另有1次练习，最多2次尝试；复制阶段最多10秒。 属于时间重现范式。Jazayeri 与 Shadlen 2010用两次闪光给出间隔、Set后一次按键重现并比较三种时间先验；本版用持续色条及两次点击，没有这些先验条件或约500次学习过程，不用于拟合该论文的机制结论。",
      "interpretation": "6次体验只给粗略记录。鼠标、触屏、默数和设备延迟都会影响结果；偏离20%以内只是本项目的统计范围，不是合格线或注意力诊断。",
      "confounders": [
        "默数与节律策略改变计时方式。",
        "设备输入延迟影响起止时间记录。",
        "本报告不提供经过验证的人口常模、诊断、注意力或时间管理能力等级结论。",
        "设备与输入方式",
        "练习、熟悉和这次有效观察量"
      ],
      "metricNotes": {
        "meanAbsErrorRatio": {
          "definition": "每次先算|复制时长−目标时长|/目标时长，再对未中断试次求平均；不是毫秒。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "biasRatio": {
          "definition": "带符号的相对误差平均：正为偏长，负为偏短；正负可能相抵。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "withinTwentyRate": {
          "definition": "分母为可计入的未中断复制；20%为项目描述范围，没有常模合格含义。",
          "readingHint": "保留原计分；只按此分母与任务条件解释。"
        },
        "medianReproductionMs": {
          "definition": "有效复制时长的中位数。",
          "readingHint": "与目标范围对照阅读。"
        }
      },
      "configFields": [
        {
          "key": "totalTrials",
          "label": "计划正式试次数"
        },
        {
          "key": "targetMinMs",
          "label": "目标下限（毫秒）"
        },
        {
          "key": "targetMaxMs",
          "label": "目标上限（毫秒）"
        }
      ]
    },
    "hiddenByProfile": {
      "experience": []
    }
  }
}
]
