import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "pairedassociate",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图形—位置配对学习",
    "metrics": {
      "correctByTrial": {
        "valueUnit": "count",
        "label": "各轮正确数",
        "explanation": "各学习轮次中图形位置配对正确的数量。",
        "singleExplanation": "各学习轮次中图形位置配对正确的数量。"
      },
      "learningSlope": {
        "label": "学习斜率",
        "explanation": "首末轮正确率之差除以轮次间隔，描述本次平均每轮变化。",
        "singleExplanation": "首末轮正确率之差除以轮次间隔，描述本次平均每轮变化。"
      },
      "trialsToCriterion": {
        "label": "达到标准所需轮次",
        "explanation": "首次达到 80% 正确率的学习轮次；未达到时不显示数值。",
        "singleExplanation": "首次达到 80% 正确率的学习轮次；未达到时不显示数值。"
      },
      "immediateAccuracy": {
        "label": "最终即时正确率",
        "explanation": "最后一轮即时配对作答的正确率。",
        "singleExplanation": "最后一轮即时配对作答的正确率。"
      },
      "delayedAccuracy": {
        "label": "延迟正确率",
        "explanation": "短延迟后配对作答的正确率；该阶段未完成时不显示数值。",
        "singleExplanation": "短延迟后配对作答的正确率；该阶段未完成时不显示数值。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图形—位置配对学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 对图形、2 轮学习。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图形—位置配对学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用12 对图形、3 轮学习。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图形—位置配对学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用18 对图形、4 轮学习及短延迟回忆。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "学习斜率、达到标准轮次与最终正确率应一起阅读；延迟缺失不按 0 计。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果来自内部非语言配对刺激，不等同 CANTAB PAL、临床记忆判断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "两个线索，怎样连在一起？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "刚学过的配对中，你这次答对了 {immediateAccuracy}。",
        "metricKeys": [
          "immediateAccuracy"
        ]
      },
      "studentMetricKeys": [
        "immediateAccuracy",
        "trialsToCriterion"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {
        "delayedAccuracy": [
          "delayedStageIncomplete"
        ]
      },
      "nextStep": "即时记录与延迟测试分开看，不推断没有测量的长期保持。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "immediateAccuracy",
          "delayedAccuracy"
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
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "把一个图形和它对应的位置联系起来，需要形成配对记忆。多轮记录可以让你看到，这一次哪些联系逐渐记住了。",
        "takeaway": "把线索连起来，把过程看清楚。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "学习新词与意思的对应、记住工具与存放位置，都包含建立联系的过程。本任务使用特定材料，不能替代学习能力评估。",
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
          "trialsToCriterion": {
            "label": "第几轮达到任务要求",
            "explanation": "达到当前任务正确比例要求的轮次；不是学习能力等级。"
          },
          "immediateAccuracy": {
            "label": "刚学过的内容，答对多少",
            "explanation": "在本次即时学习或回忆阶段，正确作答的比例。"
          }
        }
      },
      "professional": {
        "construct": "视觉配对关联学习",
        "procedure": "按冻结配对集合和学习轮次，统计每轮正确数、最终即时正确率及达到评分标准的轮次。",
        "interpretation": "结合材料数量阅读正确数；轮次变化不等于学习潜力。即时与延迟指标分开解释，缺失延迟结果不作补零。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "correctByTrial": {
            "definition": "各学习轮次中正确配对的数量。",
            "readingHint": "按冻结配对数量确定分母；即时学习与延迟再测分开解释。"
          },
          "learningSlope": {
            "definition": "首末轮正确率之差除以轮次间隔，描述本次平均每轮变化。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialsToCriterion": {
            "definition": "首次达到 80% 正确率的学习轮次；未达到时不显示数值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "immediateAccuracy": {
            "definition": "最后一轮即时配对作答的正确率。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "delayedAccuracy": {
            "definition": "短延迟后配对作答的正确率；该阶段未完成时不显示数值。",
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
