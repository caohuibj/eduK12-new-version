import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "BART 泵压任务",
    "metrics": {
      "adjustedPumps": {
        "label": "Adjusted pumps"
      },
      "explosionCount": {
        "label": "爆破次数"
      },
      "cashoutCount": {
        "label": "现金化次数"
      },
      "meanPumpsAllCompleted": {
        "label": "已完成 balloon 平均泵压"
      },
      "cashoutRate": {
        "label": "现金化比例"
      },
      "completedBalloonCount": {
        "label": "完成 balloon 数"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Adjusted pumps、爆破次数和现金化次数应作为本次任务内的描述性指标阅读，不形成风险高低或好坏等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次虚拟 balloon 任务中的泵压、爆破和现金化行为，不是风险偏好、冲动性、人格或临床判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "继续一步，还是收下已有的成果？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次收取了 {cashoutCount} 个气球，爆掉了 {explosionCount} 个；在成功收取的气球中，平均充气 {adjustedPumps} 次。",
        "metricKeys": [
          "adjustedPumps",
          "cashoutCount",
          "explosionCount"
        ]
      },
      "studentMetricKeys": [
        "adjustedPumps",
        "cashoutCount",
        "explosionCount"
      ],
      "processMetricKeys": [
        "completedBalloonCount",
        "cashoutCount",
        "explosionCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedBalloons",
        "insufficientCashoutBalloons",
        "invalidOutcome"
      ],
      "metricGates": {},
      "nextStep": "平均加压数只纳入规定的兑现轮次，不用它定义风险人格。",
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
      "illustration": "rules",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "cashoutCount",
          "explosionCount"
        ]
      },
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "气球每多充一次会增加收益，也可能爆掉。任务把充气、收取和爆裂记录分开，让你回顾这一次怎样作选择。",
        "takeaway": "继续与收取，是两种选择。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "有些现实决策也要在继续尝试和保留已有结果之间权衡，但这里的奖励与风险是任务设置。本记录不判断冒险性格、理财能力或现实风险偏好。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "adjustedPumps": {
            "label": "收取成功时，平均充了多少次",
            "explanation": "只看成功收取的气球，所以也要看收取和爆裂数量。"
          },
          "explosionCount": {
            "label": "爆掉了多少个气球",
            "explanation": "本次发生爆裂的气球数量；不是性格标签。"
          },
          "cashoutCount": {
            "label": "收取了多少个气球",
            "explanation": "本次选择收下已有收益的气球数量。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "气球模拟任务中的收益—风险选择过程",
        "procedure": "按冻结气球阈值重建爆裂与收取结果；分别统计已完成气球、收取/爆裂数量与充气记录，核对具体评分版本。",
        "interpretation": "联合阅读完成与收取比例；adjustedPumps 仅基于成功收取的气球，不能忽略选择性。旧1.0与1.1的质量门槛差异不得混用。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "adjustedPumps": {
            "definition": "成功收取气球的充气次数均值。",
            "readingHint": "这是选择性条件均值；应与成功收取数量及爆裂、完成比例一起阅读。"
          },
          "explosionCount": {
            "definition": "按本次冻结任务定义记录“爆破次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "cashoutCount": {
            "definition": "按本次冻结任务定义记录“现金化次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanPumpsAllCompleted": {
            "definition": "按本次冻结任务定义记录“已完成 balloon 平均泵压”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "cashoutRate": {
            "definition": "按本次冻结任务定义记录“现金化比例”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "completedBalloonCount": {
            "definition": "按本次冻结任务定义记录“完成 balloon 数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
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
            "key": "balloonCount",
            "label": "气球数量"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "BART 泵压任务",
    "metrics": {
      "adjustedPumps": {
        "label": "现金化气球平均泵压",
        "explanation": "仅在主动收取积分的气球中计算平均充气次数。",
        "singleExplanation": "仅在主动收取积分的气球中计算平均充气次数。"
      },
      "explosionCount": {
        "label": "爆破次数",
        "explanation": "本次充气达到爆破阈值的气球数。",
        "singleExplanation": "本次充气达到爆破阈值的气球数。"
      },
      "cashoutCount": {
        "label": "现金化次数",
        "explanation": "主动结束充气并收取虚拟积分的气球数。",
        "singleExplanation": "主动结束充气并收取虚拟积分的气球数。"
      },
      "meanPumpsAllCompleted": {
        "label": "已完成气球平均充气次数",
        "explanation": "所有已完成气球的平均充气次数，包含爆破气球。",
        "singleExplanation": "所有已完成气球的平均充气次数，包含爆破气球。"
      },
      "cashoutRate": {
        "label": "现金化比例",
        "explanation": "已完成气球中主动收取积分的比例。",
        "singleExplanation": "已完成气球中主动收取积分的比例。"
      },
      "completedBalloonCount": {
        "label": "完成气球数",
        "explanation": "通过收取积分或爆破结束的气球数。",
        "singleExplanation": "通过收取积分或爆破结束的气球数。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在BART 泵压任务中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用10 个气球。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在BART 泵压任务中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用30 个气球。结果应结合完成量、充气与收取行为和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在BART 泵压任务中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用50 个气球。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "平均充气次数、爆破和主动收取次数一起描述本次任务行为，不形成风险高低或好坏等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次虚拟气球任务中的充气、爆破和收取行为，不是风险偏好、冲动性、人格或临床判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "继续一步，还是收下已有的成果？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次收取了 {cashoutCount} 个气球，爆掉了 {explosionCount} 个；在成功收取的气球中，平均充气 {adjustedPumps} 次。",
        "metricKeys": [
          "adjustedPumps",
          "cashoutCount",
          "explosionCount"
        ]
      },
      "studentMetricKeys": [
        "adjustedPumps",
        "cashoutCount",
        "explosionCount"
      ],
      "processMetricKeys": [
        "completedBalloonCount",
        "cashoutCount",
        "explosionCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedBalloons",
        "insufficientCashoutBalloons",
        "invalidOutcome"
      ],
      "metricGates": {},
      "nextStep": "平均加压数只纳入规定的兑现轮次，不用它定义风险人格。",
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
      "illustration": "rules",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "cashoutCount",
          "explosionCount"
        ]
      },
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "气球每多充一次会增加收益，也可能爆掉。任务把充气、收取和爆裂记录分开，让你回顾这一次怎样作选择。",
        "takeaway": "继续与收取，是两种选择。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "有些现实决策也要在继续尝试和保留已有结果之间权衡，但这里的奖励与风险是任务设置。本记录不判断冒险性格、理财能力或现实风险偏好。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "adjustedPumps": {
            "label": "收取成功时，平均充了多少次",
            "explanation": "只看成功收取的气球，所以也要看收取和爆裂数量。"
          },
          "explosionCount": {
            "label": "爆掉了多少个气球",
            "explanation": "本次发生爆裂的气球数量；不是性格标签。"
          },
          "cashoutCount": {
            "label": "收取了多少个气球",
            "explanation": "本次选择收下已有收益的气球数量。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "气球模拟任务中的收益—风险选择过程",
        "procedure": "按冻结气球阈值重建爆裂与收取结果；分别统计已完成气球、收取/爆裂数量与充气记录，核对具体评分版本。",
        "interpretation": "联合阅读完成与收取比例；adjustedPumps 仅基于成功收取的气球，不能忽略选择性。旧1.0与1.1的质量门槛差异不得混用。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "adjustedPumps": {
            "definition": "成功收取气球的充气次数均值。",
            "readingHint": "这是选择性条件均值；应与成功收取数量及爆裂、完成比例一起阅读。"
          },
          "explosionCount": {
            "definition": "本次充气达到爆破阈值的气球数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "cashoutCount": {
            "definition": "主动结束充气并收取虚拟积分的气球数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanPumpsAllCompleted": {
            "definition": "所有已完成气球的平均充气次数，包含爆破气球。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "cashoutRate": {
            "definition": "已完成气球中主动收取积分的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "completedBalloonCount": {
            "definition": "通过收取积分或爆破结束的气球数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
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
            "key": "balloonCount",
            "label": "气球数量"
          }
        ]
      }
    }
  }
]
