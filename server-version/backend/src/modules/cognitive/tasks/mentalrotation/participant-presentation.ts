import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "mentalrotation",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "心理旋转",
    "metrics": {
      "accuracy": {
        "label": "正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "angleCost": {
        "label": "大角度反应时代价",
        "explanation": "大角度条件减去小角度条件的正确反应中位时间。",
        "singleExplanation": "大角度条件减去小角度条件的正确反应中位时间。"
      },
      "medianCorrectRtMs": {
        "label": "典型正确反应时间",
        "explanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
        "singleExplanation": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。"
      },
      "mirrorErrorRate": {
        "label": "镜像项目错误率",
        "explanation": "镜像项目中判断错误的比例。",
        "singleExplanation": "镜像项目中判断错误的比例。"
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
        "participantConclusion": "本次体验版结果提示你在心理旋转中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用12 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在心理旋转中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用40 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在心理旋转中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用80 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "角度代价只在大小角度都有足够正确反应时解释，并与正确率同屏阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次内部几何旋转任务表现，不是完整空间智力、诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "转个角度，还是同一个图形吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "旋转判断中，你这次答对了 {accuracy}；答对时通常一次用了 {medianCorrectRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianCorrectRtMs"
        ]
      },
      "studentMetricKeys": [
        "accuracy",
        "medianCorrectRtMs",
        "mirrorErrorRate"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientAngleCoverage"
      ],
      "metricGates": {},
      "nextStep": "不同角度与设备可能影响作答；不以单一正确率概括空间能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracy",
          "mirrorErrorRate"
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
        "concept": "当图形换了方向，我们有时会在脑中把它转回来。任务观察不同旋转条件下的判断和用时。",
        "takeaway": "换个角度，再确认一次。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "读装配图、想象零件转向后的样子，需要空间变换。真实设计与操作还涉及知识和经验，本任务不用于判断职业适合度。",
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
          "medianCorrectRtMs": {
            "label": "答对时，通常一次用了多久",
            "explanation": "正确作答用时排序后的中间值，不会只挑最快一次。"
          },
          "mirrorErrorRate": {
            "label": "镜像判断中的错误比例",
            "explanation": "只描述本版图形材料中的镜像判断记录。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "二维图形心理旋转条件下的匹配",
        "procedure": "按冻结旋转角度与匹配条件核查判断，统计正确率、反应用时及旋转相关差异。",
        "interpretation": "旋转差值须连同正确率与角度覆盖解释；不直接推断一般空间能力或工程技能。",
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
          "angleCost": {
            "definition": "大角度条件减去小角度条件的正确反应中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianCorrectRtMs": {
            "definition": "典型正确反应时间：仅统计正确且达到有效反应时间门槛的试次，中位数越小表示本次正确判断通常更快。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "mirrorErrorRate": {
            "definition": "镜像项目中判断错误的比例。",
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
