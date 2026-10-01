import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "matrix",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "矩阵规则推理",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "accuracyByRuleFamily": {
        "valueUnit": "ratio",
        "valueLabels": {
          "progression": "递进规律",
          "alternation": "交替规律",
          "combination": "组合规律"
        },
        "label": "各规则族正确率",
        "explanation": "按图形规则类别分别统计正确率。",
        "singleExplanation": "按图形规则类别分别统计正确率。"
      },
      "reachedDifficulty": {
        "label": "达到的最高难度",
        "explanation": "本次正确完成题目所达到的最高内部难度，不是智力等级。",
        "singleExplanation": "本次正确完成题目所达到的最高内部难度，不是智力等级。"
      },
      "medianRtMs": {
        "label": "正确反应中位时长",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      }
    },
    "hiddenMetrics": [
      "reachedDifficulty"
    ],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在矩阵规则推理中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 道题。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在矩阵规则推理中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用16 道题。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在矩阵规则推理中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用24 道题。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "正确率按规则族和难度覆盖一起阅读，不换算 IQ 或智力等级。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部矩阵规则任务表现，不是 Raven、IQ、临床判断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "从图形之间，发现一条规律",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "本次图形规律题正确率为 {accuracy}。",
        "metricKeys": [
          "accuracy"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "reachedDifficulty"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "题目内容与难度会影响记录；这里不提供智商或一般推理能力等级。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy"
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
        "concept": "观察一组图形怎样变化，再找到符合规律的选项。不同规律类别的记录分开看，可以帮助你回顾这次判断的过程。",
        "takeaway": "找到规律，也要说明规律。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "阅读模式图、寻找变化规则，都用到关系观察与推理。这里是系统内部的图形题，不是智商测验，也不换算 IQ。",
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
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "medianRtMs": {
            "label": "通常一次回应用了多久",
            "explanation": "把有效用时从短到长排好，取中间的那个；不会只挑最快的一次。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "内部矩阵规则材料中的关系推理",
        "procedure": "按冻结题目规则与答案判定正确性，统计总体及规则族正确率；题目内部难度只用于该材料体系。",
        "interpretation": "按规则族覆盖阅读正确率；本任务不是 Raven 或标准化智力测验，内部难度不得转换为 IQ 或年龄等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyByRuleFamily": {
            "definition": "按图形规则类别分别统计正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "reachedDifficulty": {
            "definition": "本次正确完成题目所达到的最高内部难度，不是智力等级。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtMs": {
            "definition": "典型反应速度：多数有效反应所需的时间。",
            "readingHint": "与有效记录量、遗漏和提前反应联合阅读；不是最快一次，也不是跨情境速度等级。"
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
