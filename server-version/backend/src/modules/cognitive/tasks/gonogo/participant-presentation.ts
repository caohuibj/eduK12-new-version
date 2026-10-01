import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "gonogo",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Go/No-Go",
    "metrics": {
      "commissionRate": {
        "label": "No-Go 误按率",
        "explanation": "误按比例：本来不应该按时发生按键的比例。",
        "singleExplanation": "误按比例：本来不应该按时发生按键的比例。"
      },
      "dPrime": {
        "label": "信号检测敏感度 d′",
        "explanation": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
        "singleExplanation": "目标辨别敏感度：区分目标和非目标表现的信号检测指标。"
      },
      "goMedianRtMs": {
        "label": "Go 正确反应中位RT"
      },
      "hitRate": {
        "label": "Go 命中率"
      },
      "omissionRate": {
        "label": "Go 遗漏率",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "commissionErrors": {
        "label": "No-Go 误按次数"
      },
      "goTrialCount": {
        "label": "Go 试次数"
      },
      "nogoTrialCount": {
        "label": "No-Go 试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Go RT 只解释速度—准确权衡，不能单独代表抑制能力。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次反应抑制任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "该出手时出手，该等待时等待",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "需要出手的信号中，你认出了 {hitRate}；需要等待的信号中，有 {commissionRate} 仍发生了回应。",
        "metricKeys": [
          "commissionRate",
          "hitRate"
        ]
      },
      "studentMetricKeys": [
        "commissionRate",
        "hitRate",
        "omissionRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientNoGoTrials"
      ],
      "metricGates": {},
      "nextStep": "误按与未响应的分母不同，先阅读任务规则，不据此评价性格。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
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
        "Go": "回应信号条件",
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
      "illustration": "stop",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "这个任务有两种信号：一种需要回应，另一种需要等待。它看的是你有没有跟着规则行动；没有回应和回应错了，是两类不同的记录。",
        "takeaway": "先分清信号，再决定动作。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "质检员只对符合条件的异常做标记、球员判断是否起跑，都要把行动和等待分开。本任务不用于判断冲动性或岗位适合度。",
        "scene": "stop",
        "frames": [
          {
            "title": "准备行动",
            "text": "按正常信号准备回应。"
          },
          {
            "title": "收到暂停",
            "text": "在少数试次里，动作需要中止。"
          },
          {
            "title": "看两类记录",
            "text": "回应与停止分开阅读。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "commissionRate": {
            "label": "不该回应时，仍动了手",
            "explanation": "在不需要回应的信号中，仍作出回应的比例。"
          },
          "dPrime": {
            "label": "区分目标的记录",
            "explanation": "结合认出目标和误按计算的区分指标；可以为负，不是同龄人排名。"
          },
          "hitRate": {
            "label": "需要回应时，认出了多少",
            "explanation": "在需要回应的信号中，正确作出回应的比例。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "Go/No-Go 范式中的反应执行与反应抑制",
        "procedure": "依据 Go/No-Go 试次类型区分命中、遗漏、误按与正确拒绝；各比例使用对应条件的试次数为分母。",
        "interpretation": "分别阅读遗漏和误按，不以单一错误比例概括个体。核查类别覆盖、有效反应与中断，避免把未响应原因归结为注意或动机。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "commissionRate": {
            "definition": "误按比例：本来不应该按时发生按键的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "dPrime": {
            "definition": "目标辨别敏感度：区分目标与非目标表现的信号检测指标。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "goMedianRtMs": {
            "definition": "按本次冻结任务定义记录“Go 正确反应中位RT”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "hitRate": {
            "definition": "按本次冻结任务定义记录“Go 命中率”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "commissionErrors": {
            "definition": "按本次冻结任务定义记录“No-Go 误按次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "goTrialCount": {
            "definition": "按本次冻结任务定义记录“Go 试次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "nogoTrialCount": {
            "definition": "按本次冻结任务定义记录“No-Go 试次数”。",
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
