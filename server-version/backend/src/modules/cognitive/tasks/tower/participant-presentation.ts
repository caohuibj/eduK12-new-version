import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "tower",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "塔式规划",
    "metrics": {
      "minimumMoveSolveRate": {
        "label": "最短步解题比例",
        "explanation": "以最少步数解出的题目占全部题目的比例。",
        "singleExplanation": "以最少步数解出的题目占全部题目的比例。"
      },
      "excessMoves": {
        "label": "已解题平均额外步数",
        "explanation": "已解题目相对最短解法多走的平均步数。",
        "singleExplanation": "已解题目相对最短解法多走的平均步数。"
      },
      "solveRate": {
        "label": "解题比例",
        "explanation": "达到目标圆盘状态的题目比例。",
        "singleExplanation": "达到目标圆盘状态的题目比例。"
      },
      "firstMoveLatencyMs": {
        "label": "首步计划时长",
        "explanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。",
        "singleExplanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。"
      },
      "ruleViolations": {
        "label": "规则违反次数",
        "explanation": "不符合圆盘移动规则的尝试次数。",
        "singleExplanation": "不符合圆盘移动规则的尝试次数。"
      },
      "noAttemptRate": {
        "label": "未尝试问题比例",
        "explanation": "没有尝试移动的题目比例。",
        "singleExplanation": "没有尝试移动的题目比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在塔式规划中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用4 道规划题。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在塔式规划中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用10 道规划题。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在塔式规划中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用18 道规划题。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "解题比例、额外步数和规则违反应分开阅读；首步时长只作方法信息。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部塔式任务表现，不是商业 Tower 测验、计划能力诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "先想一步，再动一步",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你解出了 {solveRate} 的关卡，其中按最少步数完成的比例是 {minimumMoveSolveRate}。",
        "metricKeys": [
          "solveRate",
          "minimumMoveSolveRate"
        ]
      },
      "studentMetricKeys": [
        "solveRate",
        "minimumMoveSolveRate",
        "excessMoves"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAttemptedProblems"
      ],
      "metricGates": {},
      "nextStep": "达到目标与达到最优解是两件事，不直接评价一般规划能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "solveRate",
          "minimumMoveSolveRate"
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
        "concept": "移动物件达到目标时，眼前可走的一步未必最省步骤。任务记录你的实际移动，帮助回顾这一次计划与执行。",
        "takeaway": "下一步之前，先看目标。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "安排操作顺序、规划有限空间里的搬移，会涉及步骤规划。此任务的内部关卡不能代表现实中的计划能力全貌。",
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
          "minimumMoveSolveRate": {
            "label": "用最少步数解出多少",
            "explanation": "本次关卡中按任务内最少步数解出的比例。"
          },
          "excessMoves": {
            "label": "比最少路径多走的步数",
            "explanation": "任务内的额外移动记录；要结合完成情况阅读。"
          },
          "solveRate": {
            "label": "解出了多少比例的关卡",
            "explanation": "本次关卡中成功达到目标的比例。"
          }
        }
      },
      "professional": {
        "construct": "约束移动任务中的规划与执行",
        "procedure": "按冻结关卡的合法移动规则重放提交动作，统计完成状态、实际步数和相关效率指标。",
        "interpretation": "步数与完成状态联合阅读；不要把未完成等同于规划缺陷，也不能从内部关卡推断岗位能力。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "minimumMoveSolveRate": {
            "definition": "以最少步数解出的题目占全部题目的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "excessMoves": {
            "definition": "已解题目相对最短解法多走的平均步数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "solveRate": {
            "definition": "达到目标圆盘状态的题目比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "firstMoveLatencyMs": {
            "definition": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "ruleViolations": {
            "definition": "不符合圆盘移动规则的尝试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "noAttemptRate": {
            "definition": "没有尝试移动的题目比例。",
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
    "testType": "tower",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "塔式规划",
    "metrics": {
      "minimumMoveSolveRate": {
        "label": "最短步解题比例",
        "explanation": "以最少步数解出的题目占全部题目的比例。",
        "singleExplanation": "以最少步数解出的题目占全部题目的比例。"
      },
      "excessMoves": {
        "label": "已解题平均额外步数",
        "explanation": "已解题目相对最短解法多走的平均步数。",
        "singleExplanation": "已解题目相对最短解法多走的平均步数。"
      },
      "solveRate": {
        "label": "解题比例",
        "explanation": "达到目标圆盘状态的题目比例。",
        "singleExplanation": "达到目标圆盘状态的题目比例。"
      },
      "firstMoveLatencyMs": {
        "label": "首步计划时长",
        "explanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。",
        "singleExplanation": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。"
      },
      "ruleViolations": {
        "label": "规则违反次数",
        "explanation": "不符合圆盘移动规则的尝试次数。",
        "singleExplanation": "不符合圆盘移动规则的尝试次数。"
      },
      "noAttemptRate": {
        "label": "未尝试问题比例",
        "explanation": "没有尝试移动的题目比例。",
        "singleExplanation": "没有尝试移动的题目比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "回看这次完成的4题；只描述本次表现。",
        "reportCaveats": [
          "体验约3–5分钟；研究约15–22分钟，已有估计而非实测。90秒是无操作保护，每次移动会重置，不是整关总时限。",
          "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "标准任务",
        "participantConclusion": "回看这次完成的10题；只描述本次表现。",
        "reportCaveats": [
          "体验约3–5分钟；研究约15–22分钟，已有估计而非实测。90秒是无操作保护，每次移动会重置，不是整关总时限。",
          "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "Shallice（1982）研究非例行任务中的规划；这里的圆盘三柱状态、难度配额、移动上限与无操作保护为自编，不能视为原Tower of London器材、完整协议或临床解释。",
        "reportCaveats": [
          "体验约3–5分钟；研究约15–22分钟，已有估计而非实测。90秒是无操作保护，每次移动会重置，不是整关总时限。",
          "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
          "常规时长为估计而非实测；未以本项目数据证明测量可靠性。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "动手前先找出挡住目标的圆盘，想好临时放哪里，再沿目标逐步检查。",
      "把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。 只描述本次记录，不换算IQ、同龄排名或诊断。 练习与正式使用同一内部素材池，可能再次遇到相同素材；熟悉效应需一起考虑。",
    "reportReading": {
      "version": "3.0.0",
      "title": "先想一想，再挪第一步",
      "introduction": "把圆盘从当前摆法移到目标摆法，像一次小型路线规划。报告分别看是否解出、用了几步，以及有没有碰到规则限制。",
      "summary": {
        "template": "在全部关卡中，这次达到目标的比例为 {solveRate}；其中以最少步数完成的关卡占全部关卡 {minimumMoveSolveRate}。",
        "metricKeys": [
          "solveRate",
          "minimumMoveSolveRate"
        ]
      },
      "studentMetricKeys": [
        "solveRate",
        "minimumMoveSolveRate",
        "excessMoves"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAttemptedProblems"
      ],
      "metricGates": {},
      "nextStep": "动手前先找出挡住目标的圆盘，想好临时放哪里，再沿目标逐步检查。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "solveRate",
          "minimumMoveSolveRate"
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
        "concept": "把圆盘从当前摆法移到目标摆法，像一次小型路线规划。报告分别看是否解出、用了几步，以及有没有碰到规则限制。",
        "takeaway": "动手前先找出挡住目标的圆盘，想好临时放哪里，再沿目标逐步检查。",
        "exampleTitle": "生活里，也会用到这样的思路",
        "example": "搬书时，目标书被压在下面，可能要先把上面的书临时挪开，再一步步整理好；多挪几次不等于“不会规划”。",
        "scene": "rules",
        "frames": [
          {
            "title": "看清任务",
            "text": "先看清本题给出的信息和需要完成的目标。"
          },
          {
            "title": "核对线索",
            "text": "把一个可能的办法与完整条件逐一核对。"
          },
          {
            "title": "留下记录",
            "text": "按本任务规则作答；报告回看这一次的选择与过程。"
          }
        ],
        "boundary": "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
        "metricHelp": {
          "minimumMoveSolveRate": {
            "label": "用最少步数解出多少",
            "explanation": "本次关卡中按任务内最少步数解出的比例。"
          },
          "excessMoves": {
            "label": "比最少路径多走的步数",
            "explanation": "任务内的额外移动记录；要结合完成情况阅读。"
          },
          "solveRate": {
            "label": "解出了多少比例的关卡",
            "explanation": "本次关卡中成功达到目标的比例。"
          }
        }
      },
      "professional": {
        "construct": "约束移动任务中的规划与执行",
        "procedure": "三柱、三圆盘，遵守顶盘先移和大盘不得压小盘；4/10/18关难度配额2/2/0、4/4/2、6/6/6。移动上限由最短步数与factor=3确定；90秒无操作保护。最短步解题率分母为全部关卡，额外步数只在已解关卡中平均；首步用时只在有移动的关卡取中位。 Shallice, Specific impairments of planning (1982), DOI 10.1098/rstb.1982.0082: https://pubmed.ncbi.nlm.nih.gov/6125971/ 当前练习从同一内部池取4题；研究档覆盖全池，存在练习刺激重现。练习记录不进入正式分母，但熟悉效应仍会影响后续表现。",
        "interpretation": "Shallice（1982）研究非例行任务中的规划；这里的圆盘三柱状态、难度配额、移动上限与无操作保护为自编，不能视为原Tower of London器材、完整协议或临床解释。",
        "confounders": [
          "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
          "体验约3–5分钟；研究约15–22分钟，已有估计而非实测。90秒是无操作保护，每次移动会重置，不是整关总时限。",
          "模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。"
        ],
        "metricNotes": {
          "minimumMoveSolveRate": {
            "definition": "以最少步数解出的题目占全部题目的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "excessMoves": {
            "definition": "已解题目相对最短解法多走的平均步数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "solveRate": {
            "definition": "达到目标圆盘状态的题目比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "firstMoveLatencyMs": {
            "definition": "从题目开始到第一次移动的典型等待时长，并不直接等同于计划能力。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "ruleViolations": {
            "definition": "不符合圆盘移动规则的尝试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "noAttemptRate": {
            "definition": "没有尝试移动的题目比例。",
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
      },
      "summaryByProfile": {
        "experience": {
          "template": "本次4关体验中，达到目标的比例为 {solveRate}。不以少量关卡推断固定规划能力。",
          "metricKeys": [
            "solveRate"
          ]
        }
      },
      "hiddenByProfile": {
        "experience": [
          "firstMoveLatencyMs"
        ]
      }
    }
  }
]
