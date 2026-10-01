import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "reversallearning",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "概率反转学习",
    "metrics": {
      "acquisitionAccuracy": {
        "label": "初始学习正确率",
        "explanation": "初始学习阶段选择当前优势符号的比例。",
        "singleExplanation": "初始学习阶段选择当前优势符号的比例。"
      },
      "reversalAccuracy": {
        "label": "反转学习正确率",
        "explanation": "规则反转后选择新优势符号的比例。",
        "singleExplanation": "规则反转后选择新优势符号的比例。"
      },
      "reversalCost": {
        "label": "反转准确率变化",
        "explanation": "初始学习正确率减去反转阶段正确率；需结合两阶段数据阅读。",
        "singleExplanation": "初始学习正确率减去反转阶段正确率；需结合两阶段数据阅读。"
      },
      "perseverativeErrorCount": {
        "label": "持续性错误次数",
        "explanation": "反转后仍选择原优势符号的次数。",
        "singleExplanation": "反转后仍选择原优势符号的次数。"
      },
      "trialsToAcquisitionCriterion": {
        "label": "初始学习达标所需次数",
        "explanation": "初始学习阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
        "singleExplanation": "初始学习阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。"
      },
      "trialsToReversalCriterion": {
        "label": "反转学习达标所需次数",
        "explanation": "反转阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
        "singleExplanation": "反转阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。"
      },
      "feedbackWinRate": {
        "label": "反馈获胜比例",
        "explanation": "有效选择中获得正向反馈的比例，受到任务的概率反馈机制影响。",
        "singleExplanation": "有效选择中获得正向反馈的比例，受到任务的概率反馈机制影响。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "validResponseCount": {
        "label": "有效响应次数",
        "explanation": "本次两个阶段的有效选择次数。",
        "singleExplanation": "本次两个阶段的有效选择次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在概率反转学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用40 次，学习与反转各 20 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在概率反转学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用120 次，学习与反转各 60 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在概率反转学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用240 次，学习与反转各 120 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "结果描述本次 acquisition/reversal 阶段的作答轨迹，不评价人格、风险偏好或因果机制。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次概率学习和规则反转任务表现，不是人格、风险偏好或临床判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "反馈变了，你怎样调整选择？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "规则变化前，你答对了 {acquisitionAccuracy}；变化后，正确比例是 {reversalAccuracy}。",
        "metricKeys": [
          "acquisitionAccuracy",
          "reversalAccuracy"
        ]
      },
      "studentMetricKeys": [
        "acquisitionAccuracy",
        "reversalAccuracy",
        "perseverativeErrorCount"
      ],
      "processMetricKeys": [
        "validResponseCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAcquisitionTrials",
        "insufficientReversalTrials"
      ],
      "metricGates": {},
      "nextStep": "反馈具有概率性，一次选择轨迹不能说明人格或风险偏好。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "acquisitionAccuracy",
          "reversalAccuracy"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "acquisition": "规则变化前阶段",
        "reversal": "规则变化后阶段",
        "criterion": "达标规则",
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
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "刚才带来结果的选择，下一段未必仍然如此。任务观察你如何随着反馈变化调整选择，记录只反映这次的学习过程。",
        "takeaway": "经验能帮忙，变化也要看见。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "操作规则更新后重新试探、根据新的反馈调整做法，都会涉及策略更新。本任务的反馈环境不同于现实决策，不能评价性格或适应力。",
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
          "acquisitionAccuracy": {
            "label": "规则变化前答对多少",
            "explanation": "只看变化前阶段中的正确比例。"
          },
          "reversalAccuracy": {
            "label": "规则变化后答对多少",
            "explanation": "只看反馈或规则变化后阶段中的正确比例。"
          },
          "perseverativeErrorCount": {
            "label": "继续沿用旧规则的记录",
            "explanation": "按任务规则统计的这类错误次数，不能据此判断性格。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "medianRtMs": {
            "label": "通常一次回应用了多久",
            "explanation": "把有效用时从短到长排好，取中间的那个；不会只挑最快的一次。"
          },
          "validResponseCount": {
            "label": "留下了多少有效回应",
            "explanation": "本次按任务要求完成的有效选择数量。"
          }
        }
      },
      "professional": {
        "construct": "反馈驱动选择中的反转学习",
        "procedure": "按冻结反馈序列与规则阶段重建选择结果，记录反转前后正确或适宜选择及恢复过程。",
        "interpretation": "须按阶段区分理解、探索和反转后恢复；特定概率反馈任务不构成人格、适应力或临床结论。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "acquisitionAccuracy": {
            "definition": "初始学习阶段选择当前优势符号的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "reversalAccuracy": {
            "definition": "规则反转后选择新优势符号的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "reversalCost": {
            "definition": "初始学习正确率减去反转阶段正确率；需结合两阶段数据阅读。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "perseverativeErrorCount": {
            "definition": "反转后仍选择原优势符号的次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialsToAcquisitionCriterion": {
            "definition": "初始学习阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialsToReversalCriterion": {
            "definition": "反转阶段首次达到连续正确门槛所需的试次数；未达到时不显示数值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "feedbackWinRate": {
            "definition": "有效选择中获得正向反馈的比例，受到任务的概率反馈机制影响。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtMs": {
            "definition": "典型反应速度：多数有效反应所需的时间。",
            "readingHint": "与有效记录量、遗漏和提前反应联合阅读；不是最快一次，也不是跨情境速度等级。"
          },
          "validResponseCount": {
            "definition": "本次两个阶段的有效选择次数。",
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
