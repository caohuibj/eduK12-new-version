import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "trailmaking",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Trail Making 视觉搜索",
    "metrics": {
      "completionTimeMs": {
        "label": "累计正确步骤时长",
        "explanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。",
        "singleExplanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。"
      },
      "errorCount": {
        "label": "错误尝试次数",
        "explanation": "选择错误目标的尝试次数。",
        "singleExplanation": "选择错误目标的尝试次数。"
      },
      "setShiftCostMs": {
        "label": "规则切换时间差",
        "explanation": "B 部分平均正确步骤时间减去 A 部分平均正确步骤时间；仅 A 部分时不提供。",
        "singleExplanation": "B 部分平均正确步骤时间减去 A 部分平均正确步骤时间；仅 A 部分时不提供。"
      },
      "partACompletionTimeMs": {
        "label": "A 部分累计正确步骤时长",
        "explanation": "A 部分在时限内完成的正确步骤时长之和。",
        "singleExplanation": "A 部分在时限内完成的正确步骤时长之和。"
      },
      "partBCompletionTimeMs": {
        "label": "B 部分累计正确步骤时长",
        "explanation": "B 部分在时限内完成的正确步骤时长之和。",
        "singleExplanation": "B 部分在时限内完成的正确步骤时长之和。"
      },
      "meanCorrectStepTimeMs": {
        "label": "平均正确步骤时间",
        "explanation": "已完成正确步骤的平均时长。",
        "singleExplanation": "已完成正确步骤的平均时长。"
      },
      "completedStepCount": {
        "label": "完成步骤数",
        "explanation": "在时限内选择正确目标的步骤数。",
        "singleExplanation": "在时限内选择正确目标的步骤数。"
      },
      "errorRate": {
        "label": "错误尝试比例",
        "explanation": "错误目标尝试占全部目标尝试的比例。",
        "singleExplanation": "错误目标尝试占全部目标尝试的比例。"
      },
      "omissionRate": {
        "label": "遗漏步骤比例",
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
        "participantConclusion": "本次体验版结果提示你在Trail Making 视觉搜索中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用A 部分 12 个目标。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档不测量 A/B 规则切换代价。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在Trail Making 视觉搜索中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用A、B 各 12 个目标。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在Trail Making 视觉搜索中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用A、B 各 24 个目标。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "累计正确步骤时长应与错误尝试、A/B 部分和设备/指针信息一起阅读；它不是从任务开始到结束的端到端用时。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次视觉搜索、动作速度和规则切换任务表现，不是 motor 能力诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "跟着顺序，连接下一步",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你用了 {completionTimeMs} 完成连接，留下了 {errorCount} 次需要修正的记录。",
        "metricKeys": [
          "completionTimeMs",
          "errorCount"
        ]
      },
      "studentMetricKeys": [
        "completionTimeMs",
        "errorCount",
        "completedStepCount"
      ],
      "processMetricKeys": [
        "completedStepCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedSteps"
      ],
      "metricGates": {},
      "nextStep": "时间与纠错过程一起看；不套用临床判断标准。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "partACompletionTimeMs",
          "partBCompletionTimeMs"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "沿着指定顺序连接目标，需要同时寻找位置和保持规则。任务用实际连接记录描述这次完成过程。",
        "takeaway": "沿着规则，找到下一步。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "按流程查找下一项、依顺序核对一串目标，都包含视觉搜索与规则保持。本任务不是临床连线测验的等价替代。",
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
          "completionTimeMs": {
            "label": "这次完成用了多久",
            "explanation": "按本任务规定记录的完成时间。"
          },
          "errorCount": {
            "label": "需要修正的操作记录",
            "explanation": "按当前任务规则统计的错误数量，不推断原因。"
          },
          "completedStepCount": {
            "label": "完成了多少步",
            "explanation": "本次实际完成的有效步骤数量。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "顺序连接中的视觉搜索与规则转换",
        "procedure": "按冻结目标序列重放连接，分别核查条件完成时间与错误；按实际协议覆盖解释差异。",
        "interpretation": "时间差需要完成状态和条件覆盖支持。不要将内部连线任务转换为临床 TMT 分数或诊断。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "completionTimeMs": {
            "definition": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "errorCount": {
            "definition": "选择错误目标的尝试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "setShiftCostMs": {
            "definition": "B 部分平均正确步骤时间减去 A 部分平均正确步骤时间；仅 A 部分时不提供。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "partACompletionTimeMs": {
            "definition": "A 部分在时限内完成的正确步骤时长之和。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "partBCompletionTimeMs": {
            "definition": "B 部分在时限内完成的正确步骤时长之和。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanCorrectStepTimeMs": {
            "definition": "已完成正确步骤的平均时长。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "completedStepCount": {
            "definition": "在时限内选择正确目标的步骤数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "errorRate": {
            "definition": "错误目标尝试占全部目标尝试的比例。",
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
          }
        ]
      }
    }
  }
]
