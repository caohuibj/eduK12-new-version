import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "visualwm",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "视觉工作记忆",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。",
        "singleExplanation": "总体正确率：判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。"
      },
      "hitRate": {
        "label": "变化命中率",
        "explanation": "变化命中率：颜色确实变了时，你正确报告“变了”的比例。",
        "singleExplanation": "变化命中率：颜色变了时正确报告“变了”的比例。"
      },
      "falseAlarmRate": {
        "label": "变化误报率",
        "explanation": "变化误报率：颜色没变时，你错误报告“变了”的比例。",
        "singleExplanation": "变化误报率：颜色没变时错误报告“变了”的比例。"
      },
      "medianRtMs": {
        "label": "作答中位用时"
      },
      "correctCount": {
        "label": "正确试次数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "再尝试前，可以先回看“相同”和“改变”的操作说明。",
      "颜色辨认、设备和作答方式会影响记录，适合把准确率与用时一起阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次视觉工作记忆表现，不是记忆诊断或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "颜色变了吗？你如何判断刚才的颜色？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的总体正确率是 {accuracy}；变化命中率是 {hitRate}。",
        "metricKeys": [
          "accuracy",
          "hitRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的总体正确率是 {accuracy}；体验版仅供体验。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "hitRate",
        "falseAlarmRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {},
      "nextStep": "先看本次记录是否完整，再结合命中率与误报率阅读。命中率与误报率都高可能与偏向选择“改变”有关，不能仅凭这一次记录断言你在猜测。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
        "concept": "几个彩色方块同时闪现，消失片刻后整组再次出现，其中一个带深色边框，颜色可能变了。你要判断它是变了还是没变。这个任务观察短暂保持颜色并作出变化判断的表现，不直接测量能记住多少信息。",
        "takeaway": "看一眼就记住，不用嘴说也能记得住。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "进入一个房间后闭上眼，你能记住几件家具的颜色？看完一张地图后，你能记住几条路线？这些都需要视觉记忆。它只是记忆能力的一小部分，不代表你的记忆或智力全貌。",
        "scene": "signal",
        "frames": [
          {
            "title": "看方块",
            "text": "记住每个位置的颜色。"
          },
          {
            "title": "等一等",
            "text": "方块消失，靠记忆保持。"
          },
          {
            "title": "做判断",
            "text": "其中一个颜色变了吗？"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "判断对了多少",
            "explanation": "判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。"
          },
          "hitRate": {
            "label": "变了的抓到了多少",
            "explanation": "颜色确实变了时正确报告“变了”的比例。"
          },
          "falseAlarmRate": {
            "label": "没变的说变了多少",
            "explanation": "颜色没变时错误报告“变了”的比例。"
          }
        }
      },
      "professional": {
        "construct": "颜色保持与变化判断（当前全阵列探测变式）",
        "procedure": "每试次呈现 setSize 个彩色方块（等距排列在圆周上）持续 studyMs，空白保持 retentionMs，然后重呈全阵列，并以深色边框标出一个探测位置（同色或变色）；参与者判断“相同”或“改变”；服务端按 seed+index 重建刺激。",
        "interpretation": "命中率与误报率按信号检测框架同读；准确率受集合大小分布影响；不提供 Cowan's K 等容量估计（需更大样本）。",
        "confounders": [
          "颜色显示的屏幕校准差异影响颜色辨别。",
          "言语编码策略（给颜色命名）会改变任务性质。",
          "本报告不提供经过验证的人口常模、诊断、记忆容量或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确判断 / 总试次。",
            "readingHint": "主要指标；受集合大小分布影响。"
          },
          "hitRate": {
            "definition": "变化试次中正确报告“改变”的比例。",
            "readingHint": "与误报率按信号检测框架同读。"
          },
          "falseAlarmRate": {
            "definition": "未变试次中错误报告“改变”的比例。",
            "readingHint": "低误报+高命中 = 记忆准确；低误报+低命中 = 保守偏向。"
          },
          "medianRtMs": {
            "definition": "可核非中断作答中，rtMs ≥ validRtFloorMs 的反应时中位数，包括正确和错误作答。",
            "readingHint": "与正确率同读。"
          },
          "correctCount": {
            "definition": "正确判断的试次数。",
            "readingHint": "受总试次影响，跨 profile 不可比。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "studyMs",
            "label": "学习阶段时长（毫秒）"
          },
          {
            "key": "retentionMs",
            "label": "保持间隔（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "visualwm",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "短暂看过颜色，还能发现变化吗",
    "metrics": {
      "accuracy": {
        "label": "全计划题目的判断正确率",
        "explanation": "总体正确率：判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。",
        "singleExplanation": "总体正确率：判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。"
      },
      "hitRate": {
        "label": "变化题中发现变化的比例",
        "explanation": "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。",
        "singleExplanation": "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。"
      },
      "falseAlarmRate": {
        "label": "未变题中误报改变的比例",
        "explanation": "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。",
        "singleExplanation": "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。"
      },
      "medianRtMs": {
        "label": "已答有效判断的典型用时",
        "explanation": "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。 不是仅正确反应用时；颜色显示与输入设备也会影响记录。",
        "singleExplanation": "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。 不是仅正确反应用时；颜色显示与输入设备也会影响记录。"
      },
      "correctCount": {
        "label": "正确试次数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "同时看发现变化和误报，不只追求按得快。当前练习复用了正式首题，应把短版结果视为受熟悉效应影响的体验。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次视觉工作记忆表现，不是记忆诊断或年龄常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "短暂看过颜色，还能发现变化吗",
      "introduction": "像短暂看见一组彩色便签后核对变化，这里记录本次颜色判断，不是视力或记忆容量诊断。",
      "summary": {
        "template": "这一次，你的总体正确率是 {accuracy}；变化命中率是 {hitRate}。",
        "metricKeys": [
          "accuracy",
          "hitRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的总体正确率是 {accuracy}；体验版仅供体验。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "hitRate",
        "falseAlarmRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {},
      "nextStep": "同时看发现变化和误报，不只追求按得快。当前练习复用了正式首题，应把短版结果视为受熟悉效应影响的体验。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
        "concept": "像短暂看见一组彩色便签后核对变化，这里记录本次颜色判断，不是视力或记忆容量诊断。",
        "takeaway": "发现真变化与少报假变化，都要一起看。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "命中是发现了真的变化，误报是未变却按了改变。屏幕颜色与命名策略也会影响表现。",
        "scene": "signal",
        "frames": [
          {
            "title": "看方块",
            "text": "记住每个位置的颜色。"
          },
          {
            "title": "等一等",
            "text": "方块消失，靠记忆保持。"
          },
          {
            "title": "做判断",
            "text": "其中一个颜色变了吗？"
          }
        ],
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "accuracy": {
            "label": "全计划题目的判断正确率",
            "explanation": "总体正确率：判断正确次数占计划正式试次数的比例；中断或缺答不能当成已完成判断。"
          },
          "hitRate": {
            "label": "变化题中发现变化的比例",
            "explanation": "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。"
          },
          "falseAlarmRate": {
            "label": "未变题中误报改变的比例",
            "explanation": "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。"
          }
        }
      },
      "professional": {
        "construct": "环形颜色阵列、带位置线索的变化判断项目变式",
        "procedure": "每试次呈现 setSize 个彩色方块（等距排列在圆周上）持续 studyMs，空白保持 retentionMs，然后重呈全阵列，并以深色边框标出一个探测位置（同色或变色）；参与者判断“相同”或“改变”；服务端按 seed+index 重建刺激。",
        "interpretation": "正确率以全计划题数为分母，命中与误报以未中断且已答的各类题为分母。当前练习复用正式首题，短版有熟悉效应；不计算容量K或d′，不沿用原论文容量阈值。",
        "confounders": [
          "颜色显示的屏幕校准差异影响颜色辨别。",
          "言语编码策略（给颜色命名）会改变任务性质。",
          "本报告不提供经过验证的人口常模、诊断、记忆容量或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确判断 / 总试次。",
            "readingHint": "主要指标；受集合大小分布影响。"
          },
          "hitRate": {
            "definition": "未中断且已答的变化题中，正确报告改变的比例。",
            "readingHint": "机会数少时比例易波动；某类无有效题时为 null。"
          },
          "falseAlarmRate": {
            "definition": "未中断且已答的未变题中，错误报告改变的比例。",
            "readingHint": "不要只看命中而忽略误报。"
          },
          "medianRtMs": {
            "definition": "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。",
            "readingHint": "不是仅正确反应用时；颜色显示与输入设备也会影响记录。"
          },
          "correctCount": {
            "definition": "正确判断的试次数。",
            "readingHint": "受总试次影响，跨 profile 不可比。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "studyMs",
            "label": "学习阶段时长（毫秒）"
          },
          {
            "key": "retentionMs",
            "label": "保持间隔（毫秒）"
          }
        ]
      },
      "qualityLabels": {
        "insufficientValidRt": "有效已答反应不足（包括错误作答）"
      }
    }
  }
]
