import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "cpt",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "连续执行任务 CPT-X",
    "metrics": {
      "dPrime": {
        "label": "目标辨别 d′",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "omissionRate": {
        "label": "目标遗漏率",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "commissionRate": {
        "label": "非目标误报率",
        "explanation": "误按比例：本来不应该按时发生按键的比例。",
        "singleExplanation": "误按比例：本来不应该按时发生按键的比例。"
      },
      "rtICV": {
        "label": "命中RT变异系数",
        "explanation": "反应稳定性：不同试次之间反应速度的波动程度。",
        "singleExplanation": "反应稳定性：不同试次之间反应速度的波动程度。"
      },
      "hitMedianRtMs": {
        "label": "目标命中中位RT"
      },
      "hitRtSdMs": {
        "label": "目标RT标准差"
      },
      "blockSlopeRt": {
        "label": "跨 block RT 斜率"
      },
      "blockSlopeOmission": {
        "label": "跨 block 遗漏斜率"
      },
      "perseverationRate": {
        "label": "极短反应比例"
      },
      "targetCount": {
        "label": "目标试次数"
      },
      "hitCount": {
        "label": "命中次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "单一反应时不能代表持续注意，请同时看遗漏与误报。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次持续注意任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "信号一闪而过，你有没有接住？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "需要回应的目标中，有 {omissionRate} 没有留下回应；不该回应的信号中，有 {commissionRate} 仍发生了回应。",
        "metricKeys": [
          "omissionRate",
          "commissionRate"
        ]
      },
      "studentMetricKeys": [
        "omissionRate",
        "commissionRate",
        "dPrime"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientTargets"
      ],
      "metricGates": {},
      "nextStep": "先核对目标规则和作答环境。一次记录不能用于注意力障碍判断。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "omissionRate",
          "commissionRate"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
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
        "concept": "在一段重复的信息流里，只对目标做出回应，需要持续观察。任务把漏掉目标与对非目标出手分开记录，帮助你看清这次作答的不同侧面。",
        "takeaway": "持续观察，不只是一直盯着。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "监控人员观察仪表、校对人员查找文本中的指定符号，都要在重复信息中识别目标。本任务的记录不能代替真实岗位考核或注意问题诊断。",
        "scene": "signal",
        "frames": [
          {
            "title": "信号出现",
            "text": "目标发生变化，观察从此刻开始。"
          },
          {
            "title": "看清再回应",
            "text": "先识别信号，再执行任务要求。"
          },
          {
            "title": "留下记录",
            "text": "记录本次用时，而不是给人贴标签。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "dPrime": {
            "label": "区分目标的记录",
            "explanation": "结合认出目标和误按计算的区分指标；可以为负，不是同龄人排名。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "commissionRate": {
            "label": "不该回应时，仍动了手",
            "explanation": "在不需要回应的信号中，仍作出回应的比例。"
          }
        }
      },
      "professional": {
        "construct": "持续操作范式中的目标辨别及响应维持",
        "procedure": "按目标和非目标条件统计命中、遗漏与误报，使用信号检测指标补充目标区分表现。",
        "interpretation": "命中率与误报率须联合阅读；还需考虑目标比例、记录量及中断，不能将一次任务表现视为长期注意能力。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "dPrime": {
            "definition": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "commissionRate": {
            "definition": "误按比例：本来不应该按时发生按键的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "rtICV": {
            "definition": "有效反应时标准差除以平均反应时。",
            "readingHint": "无量纲的相对离散度；显示百分数不意味着正确率。"
          },
          "hitMedianRtMs": {
            "definition": "按本次冻结任务定义记录“目标命中中位RT”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "hitRtSdMs": {
            "definition": "按本次冻结任务定义记录“目标RT标准差”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "blockSlopeRt": {
            "definition": "按本次冻结任务定义记录“跨 block RT 斜率”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "blockSlopeOmission": {
            "definition": "按本次冻结任务定义记录“跨 block 遗漏斜率”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "perseverationRate": {
            "definition": "按本次冻结任务定义记录“极短反应比例”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "targetCount": {
            "definition": "按本次冻结任务定义记录“目标试次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "hitCount": {
            "definition": "按本次冻结任务定义记录“命中次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          },
          {
            "key": "blockCount",
            "label": "区组数"
          }
        ]
      }
    }
  }
]
