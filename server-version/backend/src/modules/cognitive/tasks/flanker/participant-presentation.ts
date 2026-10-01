import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "flanker",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Flanker 箭头干扰",
    "metrics": {
      "flankerEffectMs": {
        "label": "干扰反应时间差",
        "explanation": "干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。",
        "singleExplanation": "干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。"
      },
      "incongruentAccuracy": {
        "label": "不一致条件正确率",
        "explanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。"
      },
      "congruentAccuracy": {
        "label": "一致条件正确率",
        "explanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。"
      },
      "errorCost": {
        "label": "准确率干扰差",
        "explanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
        "singleExplanation": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。"
      },
      "accuracy": {
        "label": "总体准确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "medianRtCongruent": {
        "label": "一致条件典型反应时间",
        "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
        "singleExplanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
      },
      "medianRtIncongruent": {
        "label": "不一致条件典型反应时间",
        "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
        "singleExplanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
      },
      "omissionRate": {
        "label": "未反应比例",
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
        "participantConclusion": "本次体验版结果提示你在Flanker 箭头干扰中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 个平衡试次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在Flanker 箭头干扰中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用80 个平衡试次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在Flanker 箭头干扰中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用160 个平衡试次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "干扰效应必须与两种条件的准确率一起解释，避免速度—准确权衡误读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次箭头干扰任务表现，不是临床诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "周围很热闹，目标仍在中间",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "有周边干扰时，你这次答对了 {incongruentAccuracy}；两种提示情况下的通常用时相差 {flankerEffectMs}。",
        "metricKeys": [
          "flankerEffectMs",
          "incongruentAccuracy"
        ]
      },
      "studentMetricKeys": [
        "flankerEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCongruentTrials",
        "insufficientIncongruentTrials"
      ],
      "metricGates": {},
      "nextStep": "先确认操作规则，再一起阅读用时差与正确率。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "congruentAccuracy",
          "incongruentAccuracy"
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
        "concept": "当周围的信息和目标指向不同方向，就容易产生干扰。这个任务比较两种情况，观察你这次把注意放回目标的过程。",
        "takeaway": "关注目标，也认识干扰。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "在密集标识里寻找指定方向、在表格中核对目标列，需要区分目标与周边信息。本任务不代表真实工作中的抗干扰水平。",
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
          "flankerEffectMs": {
            "label": "周边干扰带来的用时差",
            "explanation": "两种周边提示情况下典型用时的差；不是能力分数。"
          },
          "incongruentAccuracy": {
            "label": "有干扰时，判断正确多少",
            "explanation": "当周围线索或字义与目标冲突时，判断正确的比例。"
          },
          "congruentAccuracy": {
            "label": "没有冲突时，判断正确多少",
            "explanation": "当线索与目标一致时，判断正确的比例。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          }
        }
      },
      "professional": {
        "construct": "侧翼干扰条件下的目标选择",
        "procedure": "按一致/不一致侧翼条件统计正确率和正确反应 RT；条件差值描述本次干扰表现。",
        "interpretation": "结合不一致条件正确率、记录覆盖及速度—准确率权衡解释差值，不把低正确率直接视为技术性无效。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "flankerEffectMs": {
            "definition": "干扰反应时间差：不一致条件相对一致条件增加的典型正确反应时间；应与两种条件的正确率一起阅读。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "incongruentAccuracy": {
            "definition": "不一致条件正确率：干扰信息与目标信息方向或含义不一致时，仍按目标规则正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "congruentAccuracy": {
            "definition": "一致条件正确率：干扰信息与目标信息一致时正确作答的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "errorCost": {
            "definition": "准确率干扰差：一致条件正确率与不一致条件正确率之间的差异，应结合反应时间一起阅读。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtCongruent": {
            "definition": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtIncongruent": {
            "definition": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
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
