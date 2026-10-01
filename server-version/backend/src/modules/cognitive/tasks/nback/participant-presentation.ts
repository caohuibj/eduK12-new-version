import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "nback",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "N-Back 工作记忆更新",
    "metrics": {
      "dPrimeByN": {
        "label": "各 N 水平 d′",
        "explanation": "各 N 难度的目标辨别敏感度；不同 N 应分开阅读。",
        "singleExplanation": "各 N 难度的目标辨别敏感度；不同 N 应分开阅读。"
      },
      "maxReliableN": {
        "label": "达到质量门槛的最高 N",
        "explanation": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。",
        "singleExplanation": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。"
      },
      "hitRateByN": {
        "valueUnit": "ratio",
        "label": "各 N 命中率"
      },
      "falseAlarmRateByN": {
        "valueUnit": "ratio",
        "label": "各 N 误报率"
      },
      "medianRtByN": {
        "valueUnit": "ms",
        "label": "各 N 正确反应中位RT"
      },
      "loadCostDPrime": {
        "label": "高负荷相对低负荷的 d′ 下降"
      }
    },
    "experienceHeadline": "dPrimeByN",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "maxReliableN 只是本次配置内表现，不是标准化工作记忆等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次工作记忆更新任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "信息在更新，你记住哪一步？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你在回看 {maxReliableN} 步的难度下达到任务要求。它只描述本次记录，不是记忆等级。",
        "metricKeys": [
          "maxReliableN"
        ]
      },
      "studentMetricKeys": [
        "maxReliableN"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientTargetsByN"
      ],
      "metricGates": {},
      "nextStep": "不同难度不可直接混成能力总分；详细解读保留按难度的命中与误报。",
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
      "illustration": "sequence",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "dPrimeByN"
        ],
        "pointUnit": "d-prime"
      },
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "一边接收新信息，一边回看前面的内容，需要不断更新脑中的记录。1-back 回看一步，2-back 回看两步；不同难度要分别阅读。",
        "takeaway": "记住眼前，也要跟上变化。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "听到新指令后更新待办、按新的位置继续追踪目标，都需要更新信息。本任务的回看难度不是智力或工作记忆等级。",
        "scene": "sequence",
        "frames": [
          {
            "title": "接收信息",
            "text": "看到一组内容与它的先后。"
          },
          {
            "title": "保留与整理",
            "text": "在脑中留下线索，按要求处理。"
          },
          {
            "title": "复现与核对",
            "text": "比较本次答案与任务规则。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "maxReliableN": {
            "label": "这次达到要求的回看步数",
            "explanation": "只指这次任务中的评分要求，不是记忆等级。"
          }
        }
      },
      "professional": {
        "construct": "N-back 范式中的工作记忆更新与目标辨别",
        "procedure": "各 N 水平分别计算命中、误报、正确反应中位 RT 与 d′；d′ 使用 (hits+0.5)/(targets+1) 和 (falseAlarms+0.5)/(nontargets+1) 的校正比例。",
        "interpretation": "按 N 分开解释 d′、命中与误报。maxReliableN 是配置内评分门槛，不是人口常模等级；目标不足的条件应先核查。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "dPrimeByN": {
            "definition": "各 N 条件 d′=Φ⁻¹((hits+0.5)/(targets+1))−Φ⁻¹((falseAlarms+0.5)/(nontargets+1))。",
            "readingHint": "按难度分开审阅；负值保留；需结合目标数量、命中与误报。"
          },
          "maxReliableN": {
            "definition": "本次配置内达到评分门槛的最高 N 难度，不是标准化能力等级。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "hitRateByN": {
            "definition": "各 N 条件命中次数除以该条件目标试次数。",
            "readingHint": "命中率必须和误报率并读；不能把所有难度混成同一比例。"
          },
          "falseAlarmRateByN": {
            "definition": "各 N 条件误报次数除以该条件非目标试次数。",
            "readingHint": "与命中联合解读，排除仅靠偏向某个按键获得的表面优势。"
          },
          "medianRtByN": {
            "definition": "各 N 条件有效正确反应时的中位数。",
            "readingHint": "仅在相同难度及响应规则内比较。"
          },
          "loadCostDPrime": {
            "definition": "按本次冻结任务定义记录“高负荷相对低负荷的 d′ 下降”。",
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
          },
          {
            "key": "startLength",
            "label": "起始序列长度"
          },
          {
            "key": "maxLength",
            "label": "配置长度上限"
          },
          {
            "key": "trialsPerLevel",
            "label": "每长度尝试数"
          },
          {
            "key": "nLevels",
            "label": "N-back 难度"
          },
          {
            "key": "trialCountByN",
            "label": "各 N 计划试次数"
          },
          {
            "key": "learningRounds",
            "label": "即时学习轮数"
          },
          {
            "key": "pairCount",
            "label": "配对数量"
          },
          {
            "key": "delayedEnabled",
            "label": "是否包含延迟阶段"
          }
        ]
      }
    }
  }
]
