import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
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
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "trailmaking",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "按顺序找目标",
    "metrics": {
      "completionTimeMs": {
        "label": "完成步骤累计用时",
        "explanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。",
        "singleExplanation": "只累计在时限内完成的正确步骤时长，包含该步骤此前的错误尝试时间；不计未完成步骤，不是整个测验的总用时。"
      },
      "errorCount": {
        "label": "错误尝试次数",
        "explanation": "选择错误目标的尝试次数。",
        "singleExplanation": "选择错误目标的尝试次数。"
      },
      "setShiftCostMs": {
        "label": "B、A每步平均用时差",
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
        "label": "找对下一步的平均用时",
        "explanation": "已完成正确步骤的平均时长。",
        "singleExplanation": "已完成正确步骤的平均时长。"
      },
      "completedStepCount": {
        "label": "实际完成步数",
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
        "participantConclusion": "这份报告描述本次按顺序找目标的作答记录。",
        "reportCaveats": [
          "A部分12目标，A练习4目标；含说明约2–3分钟为配置估计（未实测）。每步15秒意味着超时较多时正式段本身可接近3分钟，非硬性总时限。",
          "体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次按顺序找目标的作答记录。",
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次按顺序找目标的作答记录。",
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "开始前读清顺序。需要交替时，可以在心里轻声念“1、A、2、B”；比较记录时尽量保持设备和点击方式一致。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "让目光找到队伍里的下一位",
      "introduction": "在散开的目标中按顺序点击：A部分跟着数字走；有B部分时，数字和字母交替走。记录的是这次寻找、记顺序和操作的共同表现。",
      "summary": {
        "template": "这次完成了 {completedStepCount} 步；这些步骤累计用时 {completionTimeMs}，有 {errorCount} 次错点。",
        "metricKeys": [
          "completedStepCount",
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
      "nextStep": "开始前读清顺序。需要交替时，可以在心里轻声念“1、A、2、B”；比较记录时尽量保持设备和点击方式一致。",
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
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "A部分依次选择数字；B部分在数字和英文字母之间交替。用时也包含找位置和点击动作，不能把它全部解释成思考速度。",
        "takeaway": "先看实际完成了多少步、有没有错点或超时，再看用时。只有A部分时，没有B减A的切换时间差；没有数据不等于差值为0。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "在书架上依编号找书、在地图上依顺序找站点，都需要不断找“下一位”。这只是说明过程，不能用本次记录预测生活能力。",
        "scene": "rules",
        "frames": [
          {
            "title": "认清顺序",
            "text": "A部分按数字走，B部分数字与字母交替。"
          },
          {
            "title": "寻找下一位",
            "text": "找到下一个目标，再点击。"
          },
          {
            "title": "先数完成步数",
            "text": "部分步骤超时没完成时，累计用时不是整段总时间。"
          }
        ],
        "boundary": "体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。",
        "metricHelp": {
          "completionTimeMs": {
            "label": "完成步骤累计用时",
            "explanation": "只累计成功完成步骤的用时；超时未完成的步骤不计入此和，不是从开始到结束的挂钟总时长。"
          },
          "errorCount": {
            "label": "需要修正的操作记录",
            "explanation": "按当前任务规则统计的错误数量，不推断原因。"
          },
          "completedStepCount": {
            "label": "实际完成步数",
            "explanation": "本次实际完成的有效步骤数量。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "setShiftCostMs": {
            "label": "B、A每步平均用时差",
            "explanation": "B部分已完成步骤的平均用时减A部分已完成步骤的平均用时，并非B总时长减A总时长；缺一部分时不计算，负值照实保留。"
          },
          "meanCorrectStepTimeMs": {
            "label": "找对下一步的平均用时",
            "explanation": "已完成正确步骤的平均时长。"
          }
        }
      },
      "professional": {
        "construct": "顺序连接中的视觉搜索与规则转换",
        "procedure": "按冻结目标序列重放连接，分别核查条件完成时间与错误；按实际协议覆盖解释差异。 方法与文献核对：研究档A24目标+B24目标，8×6网格内种子洗牌位置，按点击目标逐步记录、每步15秒。Reitan(1958), DOI 10.2466/pms.1958.8.3.271，以及Bowie与Harvey(2006), DOI 10.1038/nprot.2006.390为原测试/施测文献；本项目是数字点击变式，不复制原纸笔布局或临床常模。本轮已核Bowie与Harvey作者上传协议：纸笔A/B各25目标，各有练习，连续计总时长，错误纠正仍计时，通常300秒停止。本项目仅A练习4目标、A/B各24目标、每步15秒超时后记录，与原协议不同；本项目差值是B每步平均用时减A每步平均用时，仍混合搜索、字母知识与动作因素。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
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
            "key": "form",
            "label": "任务部分"
          },
          {
            "key": "partAItemCount",
            "label": "A部分目标数"
          },
          {
            "key": "partBItemCount",
            "label": "B部分目标数"
          },
          {
            "key": "stepTimeoutMs",
            "label": "每步响应上限（毫秒）"
          }
        ]
      },
      "summaryByProfile": {
        "experience": {
          "metricKeys": [
            "completedStepCount",
            "completionTimeMs",
            "errorCount"
          ],
          "template": "这次短体验：完成了 {completedStepCount} 步；这些步骤累计用时 {completionTimeMs}，有 {errorCount} 次错点。 只描述本次记录，不能据此认定稳定能力。"
        }
      }
    }
  }
]
