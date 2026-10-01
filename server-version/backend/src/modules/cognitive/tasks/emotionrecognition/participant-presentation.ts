import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "emotionrecognition",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "六类情绪面孔分类",
    "metrics": {
      "accuracy": {
        "label": "总体分类正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "balancedAccuracy": {
        "label": "六类平衡正确率",
        "explanation": "先分别计算六类合成面孔的正确率，再取六类平均值。",
        "singleExplanation": "先分别计算六类合成面孔的正确率，再取六类平均值。"
      },
      "accuracyByEmotion": {
        "label": "各情绪类别正确率",
        "explanation": "六类合成面孔分别的分类正确率。",
        "singleExplanation": "六类合成面孔分别的分类正确率。"
      },
      "confusionMatrix": {
        "label": "情绪分类混淆矩阵",
        "explanation": "记录各目标类别被选择成不同类别的次数，只反映本任务合成刺激的分类情况。",
        "singleExplanation": "记录各目标类别被选择成不同类别的次数，只反映本任务合成刺激的分类情况。"
      },
      "medianRtMs": {
        "label": "反应时中位数",
        "explanation": "典型反应速度：多数有效反应所需的时间。",
        "singleExplanation": "典型反应速度：多数有效反应所需的时间。"
      },
      "omissionRate": {
        "label": "遗漏比例",
        "explanation": "遗漏比例：应该响应但没有响应的比例。",
        "singleExplanation": "遗漏比例：应该响应但没有响应的比例。"
      },
      "validResponseCount": {
        "label": "有效响应数",
        "explanation": "本次有效类别选择的次数。",
        "singleExplanation": "本次有效类别选择的次数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在六类情绪面孔分类中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用24 次，每类 4 次。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在六类情绪面孔分类中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用60 次，每类 10 次。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在六类情绪面孔分类中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用120 次，每类 20 次。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "本任务只描述对当前版本六类合成面孔的分类响应；不输出情绪识别能力、共情能力、人格、临床或文化能力结论。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次六类合成面孔分类表现，不是情绪能力、共情、人格、文化能力或临床判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "这组面孔，你读到了什么？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这组六类合成面孔，你总体答对了 {accuracy}；各类正确比例的平均值是 {balancedAccuracy}。",
        "metricKeys": [
          "balancedAccuracy",
          "accuracy"
        ]
      },
      "studentMetricKeys": [
        "balancedAccuracy",
        "accuracy",
        "validResponseCount"
      ],
      "processMetricKeys": [
        "validResponseCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientPerCategory"
      ],
      "metricGates": {},
      "nextStep": "只描述这组合成面孔分类，不判断共情、人格或一般情绪能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "balancedAccuracy",
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
        "concept": "图像里的表情分类，是把视觉线索和类别联系起来。这里使用系统生成的面孔，而不是现实中一个人的完整情绪。",
        "takeaway": "表情是线索，情绪还有情境。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "日常沟通要结合语气、背景和对方的话理解情绪。对这六合成图像类别的判断，不能评价共情、人格、文化理解或临床情绪能力。",
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
          "balancedAccuracy": {
            "label": "各类面孔平均判断正确",
            "explanation": "先看六类图像各自的正确比例，再取平均。"
          },
          "medianRtMs": {
            "label": "通常一次回应用了多久",
            "explanation": "把有效用时从短到长排好，取中间的那个；不会只挑最快的一次。"
          },
          "omissionRate": {
            "label": "需要回应时，没有留下回应",
            "explanation": "这是任务记录里的遗漏比例；不能说明没有回应的原因。"
          },
          "validResponseCount": {
            "label": "留下了多少有效回应",
            "explanation": "本次按任务要求完成的有效选择数量。"
          }
        }
      },
      "professional": {
        "construct": "六类合成面孔材料中的分类表现",
        "procedure": "按冻结合成面孔类别判定选择，总体正确率按全部正式试次统计；平衡正确率为六类条件正确率的均值。",
        "interpretation": "须考虑每类覆盖及类别不平衡；只能解释当前合成刺激分类，不将其命名为一般情绪识别能力。",
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
          "balancedAccuracy": {
            "definition": "六类面孔分别的正确率之均值。",
            "readingHint": "用于降低类别数量差异的影响，仅指本版合成刺激分类表现。"
          },
          "accuracyByEmotion": {
            "definition": "六类合成面孔分别的分类正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "confusionMatrix": {
            "definition": "记录各目标类别被选择成不同类别的次数，只反映本任务合成刺激的分类情况。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtMs": {
            "definition": "典型反应速度：多数有效反应所需的时间。",
            "readingHint": "与有效记录量、遗漏和提前反应联合阅读；不是最快一次，也不是跨情境速度等级。"
          },
          "omissionRate": {
            "definition": "遗漏比例：应该响应但没有响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validResponseCount": {
            "definition": "本次有效类别选择的次数。",
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
