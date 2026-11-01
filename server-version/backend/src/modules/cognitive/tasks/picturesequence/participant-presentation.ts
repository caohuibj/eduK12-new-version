import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "picturesequence",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "图片序列学习",
    "metrics": {
      "adjacentPairScore": {
        "label": "相邻顺序得分",
        "explanation": "最后一轮中相邻图片顺序正确的比例。",
        "singleExplanation": "最后一轮中相邻图片顺序正确的比例。"
      },
      "positionScore": {
        "label": "位置得分",
        "explanation": "最后一轮中图片处于正确位置的比例。",
        "singleExplanation": "最后一轮中图片处于正确位置的比例。"
      },
      "learningGain": {
        "label": "学习增益",
        "explanation": "最后一轮与第一轮的相邻顺序正确率之差。",
        "singleExplanation": "最后一轮与第一轮的相邻顺序正确率之差。"
      },
      "delayedRetention": {
        "label": "延迟保持变化",
        "explanation": "短延迟排序与最后一轮即时排序的相邻顺序正确率之差；未完成时不显示数值。",
        "singleExplanation": "短延迟排序与最后一轮即时排序的相邻顺序正确率之差；未完成时不显示数值。"
      },
      "adjacentPairScoreByRound": {
        "valueUnit": "ratio",
        "label": "各轮相邻顺序得分",
        "explanation": "按学习轮次列出相邻图片顺序正确的比例。",
        "singleExplanation": "按学习轮次列出相邻图片顺序正确的比例。"
      },
      "positionScoreByRound": {
        "valueUnit": "ratio",
        "label": "各轮位置得分",
        "explanation": "按学习轮次列出图片处于正确位置的比例。",
        "singleExplanation": "按学习轮次列出图片处于正确位置的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在图片序列学习中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用6 张图片、2 轮即时排序。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在图片序列学习中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用12 张图片、3 轮即时排序。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在图片序列学习中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用15 张图片、3 轮学习及短延迟排序。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "延迟保持只有在科研档延迟阶段实际完成时展示；缺失不等于低分。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "使用内部自制场景刺激，只反映本次序列学习表现，不等同 NIH PSM、临床诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "先后有顺序，故事才连得起来",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "最后一轮，你放对了 {positionScore} 的图片位置，记对了 {adjacentPairScore} 的相邻顺序。",
        "metricKeys": [
          "adjacentPairScore",
          "positionScore"
        ]
      },
      "studentMetricKeys": [
        "adjacentPairScore",
        "positionScore",
        "learningGain"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyResponse"
      ],
      "metricGates": {
        "delayedRetention": [
          "delayedStageIncomplete"
        ]
      },
      "nextStep": "相邻关系得分不同于整条序列正确率；只阅读本次实际测量的阶段。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "adjacentPairScore",
          "positionScore"
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
        "concept": "记住一组图片，还要把它们放回原来的先后。任务既看图片的位置，也看相邻图片的顺序，并保留每一轮的变化。",
        "takeaway": "记住内容，也记住它怎样发生。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "回忆一次操作演示的步骤、整理事件的先后，都会涉及顺序信息。本任务不评判生活记忆或学习潜力。",
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
          "adjacentPairScore": {
            "label": "相邻图片的顺序记对多少",
            "explanation": "最终一轮中，相邻图片先后关系正确的比例。"
          },
          "positionScore": {
            "label": "图片的位置放对多少",
            "explanation": "最终一轮中，图片放在正确位置的比例。"
          },
          "learningGain": {
            "label": "这几轮，正确比例改变多少",
            "explanation": "最后一轮与第一轮的正确比例差；不是学习潜力分数。"
          }
        }
      },
      "professional": {
        "construct": "图片序列学习中的位置及相邻关系记忆",
        "procedure": "即时学习轮次分别计算位置正确与相邻对正确比例；最终轮及轮次变化按现有评分器定义保留。",
        "interpretation": "位置正确和相邻对正确是不同指标；学习变化仅反映已测轮次。未测或未完成的延迟阶段不解释为长期遗忘。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "adjacentPairScore": {
            "definition": "最后一轮中相邻图片顺序正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "positionScore": {
            "definition": "最后一轮中图片处于正确位置的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "learningGain": {
            "definition": "最后一轮与第一轮的相邻顺序正确率之差。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "delayedRetention": {
            "definition": "短延迟排序与最后一轮即时排序的相邻顺序正确率之差；未完成时不显示数值。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "adjacentPairScoreByRound": {
            "definition": "按学习轮次列出相邻图片顺序正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "positionScoreByRound": {
            "definition": "按学习轮次列出图片处于正确位置的比例。",
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
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "picturesequence",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "把一组图片重新排成顺序",
    "metrics": {
      "adjacentPairScore": {
        "label": "最后一轮相邻顺序正确比例",
        "explanation": "最后一轮中相邻图片顺序正确的比例。",
        "singleExplanation": "最后一轮中相邻图片顺序正确的比例。"
      },
      "positionScore": {
        "label": "最后一轮位置正确比例",
        "explanation": "最后一轮中图片处于正确位置的比例。",
        "singleExplanation": "最后一轮中图片处于正确位置的比例。"
      },
      "learningGain": {
        "label": "首末轮的变化",
        "explanation": "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。",
        "singleExplanation": "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。"
      },
      "delayedRetention": {
        "label": "短延迟与最后即时轮的比例差",
        "explanation": "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。 本研究档等待仅30秒；负值不代表异常遗忘。",
        "singleExplanation": "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。 本研究档等待仅30秒；负值不代表异常遗忘。"
      },
      "adjacentPairScoreByRound": {
        "valueUnit": "ratio",
        "label": "各轮相邻顺序得分",
        "explanation": "按学习轮次列出相邻图片顺序正确的比例。",
        "singleExplanation": "按学习轮次列出相邻图片顺序正确的比例。"
      },
      "positionScoreByRound": {
        "valueUnit": "ratio",
        "label": "各轮位置得分",
        "explanation": "按学习轮次列出图片处于正确位置的比例。",
        "singleExplanation": "按学习轮次列出图片处于正确位置的比例。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这里描述本次任务记录，不代表稳定能力。",
        "reportCaveats": [
          "体验版采用6 张图片、2 轮即时排序。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这里描述本次任务记录，不代表稳定能力。",
        "reportCaveats": [
          "正式版采用12 张图片、3 轮即时排序。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。本档没有延迟回忆指标。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这里描述本次任务记录，不代表稳定能力。",
        "reportCaveats": [
          "研究版采用15 张图片、3 轮学习及短延迟排序。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "对照最后一轮与前几轮，看自己更容易记住相邻关系，还是固定位置。少量题目不代表日常记忆水平。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "使用内部自制场景刺激，只反映本次序列学习表现，不等同 NIH PSM、临床诊断或人口常模。",
    "reportReading": {
      "version": "3.0.0",
      "title": "把一组图片重新排成顺序",
      "introduction": "像复述一段小故事的先后顺序，这里看的是学习后还原这组卡片的表现。",
      "summary": {
        "template": "最后一轮，你放对了 {positionScore} 的图片位置，记对了 {adjacentPairScore} 的相邻顺序。",
        "metricKeys": [
          "adjacentPairScore",
          "positionScore"
        ]
      },
      "studentMetricKeys": [
        "adjacentPairScore",
        "positionScore",
        "learningGain"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "emptyResponse"
      ],
      "metricGates": {
        "delayedRetention": [
          "delayedStageIncomplete"
        ]
      },
      "nextStep": "对照最后一轮与前几轮，看自己更容易记住相邻关系，还是固定位置。少量题目不代表日常记忆水平。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "adjacentPairScore",
          "positionScore"
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
        "concept": "像复述一段小故事的先后顺序，这里看的是学习后还原这组卡片的表现。",
        "takeaway": "既看卡片各在第几位，也看谁紧挨着谁。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "例如先整理书包、再出门、最后到校；题目用自制卡片，当前是整板展示而非逐图讲故事。",
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
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "adjacentPairScore": {
            "label": "最后一轮相邻顺序正确比例",
            "explanation": "最后一轮中相邻图片顺序正确的比例。"
          },
          "positionScore": {
            "label": "最后一轮位置正确比例",
            "explanation": "最后一轮中图片处于正确位置的比例。"
          },
          "learningGain": {
            "label": "首末轮的变化",
            "explanation": "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。"
          }
        }
      },
      "professional": {
        "construct": "整组图片排序的项目试测",
        "procedure": "整组自制图片、文字与序号同时学习，每项折合900毫秒；随后重排顺序。目标顺序固定，候选位置按种子洗牌；研究档三轮后等30秒再排序。",
        "interpretation": "主要比例取最后学习轮，不是跨轮平均。首末变化和短延迟变化仅是本次比例差；不能等同学习速度、长期保持率或临床遗忘。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "adjacentPairScore": {
            "definition": "最后一轮中相邻图片顺序正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "positionScore": {
            "definition": "最后一轮中图片处于正确位置的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "learningGain": {
            "definition": "最后学习轮相邻对比例减第一轮比例。",
            "readingHint": "不等同经过验证的学习速度。"
          },
          "delayedRetention": {
            "definition": "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。",
            "readingHint": "本研究档等待仅30秒；负值不代表异常遗忘。"
          },
          "adjacentPairScoreByRound": {
            "definition": "按学习轮次列出相邻图片顺序正确的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "positionScoreByRound": {
            "definition": "按学习轮次列出图片处于正确位置的比例。",
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
