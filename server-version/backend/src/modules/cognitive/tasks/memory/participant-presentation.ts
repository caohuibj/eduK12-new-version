import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "memory",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "数字广度顺背",
    "metrics": {
      "maxSpan": {
        "label": "最长正确序列",
        "explanation": "本次按原顺序正确复现的最长数字序列；不是一般记忆能力等级。",
        "displayUnit": "位"
      },
      "levelsPassed": {
        "label": "通过的长度级数",
        "explanation": "本次至少有一次正确复现的序列长度级数。",
        "singleExplanation": "本次至少有一次正确复现的序列长度级数。"
      },
      "firstTryPassCount": {
        "label": "首次尝试正确的级数",
        "explanation": "每个长度首次尝试就正确复现的级数。",
        "singleExplanation": "每个长度首次尝试就正确复现的级数。"
      },
      "medianResponseDurationMs": {
        "label": "典型作答时长",
        "explanation": "本次输入序列所需时长的中位数，不是记忆能力等级。",
        "singleExplanation": "本次输入序列所需时长的中位数，不是记忆能力等级。"
      },
      "trialCount": {
        "label": "实际完成试次数",
        "explanation": "本次实际记录的尝试数量，须结合层级与中断情况。",
        "singleExplanation": "本次实际记录的尝试数量，须结合层级与中断情况。",
        "displayUnit": "次"
      },
      "interruptedCount": {
        "label": "中断试次数",
        "displayUnit": "次"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": [],
    "singleHiddenMetrics": [],
    "disclaimer": "maxSpan 是本次任务容量指标，不是标准化记忆等级。",
    "reportReading": {
      "version": "1.1.0",
      "title": "短暂记住，也是一种日常功夫",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你按原顺序正确记住的最长一串是 {maxSpan}。这是本次记录，不是你记忆的固定上限。",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "studentMetricKeys": [
        "maxSpan",
        "trialCount"
      ],
      "processMetricKeys": [
        "trialCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable"
      ],
      "metricGates": {},
      "nextStep": "先确认理解数字出现和输入的规则。无需为了数字反复刷分。",
      "chart": {
        "kind": "memory_lengths",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "maxSpan": "本次最长正确序列长度",
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
        "concept": "临时记住一串数字，并按原顺序说出来，需要在脑中短暂保留信息。这个任务看的是这次复述的正确长度，和“长期记得牢”不是同一件事。",
        "takeaway": "记住多少，要连同顺序一起看。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "听到一串取件码、记住刚说出的号码，会用到短时保持信息的过程。生活中的记忆还可以借助笔记与分组；本任务长度不是学习成绩或一般记忆能力。",
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
          "maxSpan": {
            "label": "这次最长记住的序列",
            "explanation": "按任务要求正确复现的最长一串；不代表你日常记忆的固定上限。"
          },
          "trialCount": {
            "label": "本次尝试",
            "explanation": "本次实际记录的正式尝试数量。"
          }
        }
      },
      "professional": {
        "construct": "数字顺序广度任务中的短时序列保持",
        "procedure": "按冻结的起始长度、级内尝试与升级/停止规则进行顺序复述。最长正确序列取自本次正式记录；达到配置上限表示测量范围受限。",
        "interpretation": "结合各长度尝试分母、正确复述数及中断情况阅读 maxSpan；不将配置内广度映射为标准化记忆等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "maxSpan": {
            "definition": "本次按原顺序正确复现的最长数字序列；不是一般记忆能力等级。",
            "readingHint": "受起始长度、升级、停止和配置上限限制；不是一般能力上限。"
          },
          "levelsPassed": {
            "definition": "本次至少有一次正确复现的序列长度级数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "firstTryPassCount": {
            "definition": "每个长度首次尝试就正确复现的级数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianResponseDurationMs": {
            "definition": "本次输入序列所需时长的中位数，不是记忆能力等级。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialCount": {
            "definition": "本次实际记录的尝试数量，须结合层级与中断情况。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "interruptedCount": {
            "definition": "按本次冻结任务定义记录“中断试次数”。",
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
    "presentationVersion": "1.2.0",
    "testType": "memory",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "数字广度顺背",
    "metrics": {
      "maxSpan": {
        "label": "最长正确序列",
        "explanation": "本次按原顺序正确复现的最长数字序列；不是一般记忆能力等级。",
        "displayUnit": "位"
      },
      "levelsPassed": {
        "label": "通过的长度级数",
        "explanation": "本次至少有一次正确复现的序列长度级数。",
        "singleExplanation": "本次至少有一次正确复现的序列长度级数。"
      },
      "firstTryPassCount": {
        "label": "首次尝试正确的级数",
        "explanation": "每个长度首次尝试就正确复现的级数。",
        "singleExplanation": "每个长度首次尝试就正确复现的级数。"
      },
      "medianResponseDurationMs": {
        "label": "典型作答时长",
        "explanation": "本次输入序列所需时长的中位数，不是记忆能力等级。",
        "singleExplanation": "本次输入序列所需时长的中位数，不是记忆能力等级。"
      },
      "trialCount": {
        "label": "实际完成试次数",
        "explanation": "本次实际记录的尝试数量，须结合层级与中断情况。",
        "singleExplanation": "本次实际记录的尝试数量，须结合层级与中断情况。",
        "displayUnit": "次"
      },
      "interruptedCount": {
        "label": "中断试次数",
        "displayUnit": "次"
      },
      "totalCorrectTrials": {
        "label": "正确试次数",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "displayUnit": "次"
      },
      "perseverativeTrialCount": {
        "label": "持续重复作答试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": true,
    "protocols": {},
    "practicalTips": [
      "较长信息可以尝试分组、复述和分段记忆。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "maxSpan 是本次任务容量指标，不是标准化记忆等级。",
    "reportReading": {
      "version": "1.1.0",
      "title": "短暂记住，也是一种日常功夫",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你按原顺序正确记住的最长一串是 {maxSpan}。这是本次记录，不是你记忆的固定上限。",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "studentMetricKeys": [
        "maxSpan",
        "totalCorrectTrials",
        "trialCount"
      ],
      "processMetricKeys": [
        "trialCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedLevels",
        "invalidSequencePattern"
      ],
      "metricGates": {},
      "nextStep": "先确认理解数字出现和输入的规则。无需为了数字反复刷分。",
      "chart": {
        "kind": "memory_lengths",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "maxSpan": "本次最长正确序列长度",
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
        "concept": "临时记住一串数字，并按原顺序说出来，需要在脑中短暂保留信息。这个任务看的是这次复述的正确长度，和“长期记得牢”不是同一件事。",
        "takeaway": "记住多少，要连同顺序一起看。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "听到一串取件码、记住刚说出的号码，会用到短时保持信息的过程。生活中的记忆还可以借助笔记与分组；本任务长度不是学习成绩或一般记忆能力。",
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
          "maxSpan": {
            "label": "这次最长记住的序列",
            "explanation": "按任务要求正确复现的最长一串；不代表你日常记忆的固定上限。"
          },
          "trialCount": {
            "label": "本次尝试",
            "explanation": "本次实际记录的正式尝试数量。"
          },
          "totalCorrectTrials": {
            "label": "正确复现了多少次",
            "explanation": "本次按要求完整答对的次数。"
          }
        }
      },
      "professional": {
        "construct": "数字顺序广度任务中的短时序列保持",
        "procedure": "按冻结的起始长度、级内尝试与升级/停止规则进行顺序复述。最长正确序列取自本次正式记录；达到配置上限表示测量范围受限。",
        "interpretation": "结合各长度尝试分母、正确复述数及中断情况阅读 maxSpan；不将配置内广度映射为标准化记忆等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "maxSpan": {
            "definition": "本次按原顺序正确复现的最长数字序列；不是一般记忆能力等级。",
            "readingHint": "受起始长度、升级、停止和配置上限限制；不是一般能力上限。"
          },
          "levelsPassed": {
            "definition": "本次至少有一次正确复现的序列长度级数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "firstTryPassCount": {
            "definition": "每个长度首次尝试就正确复现的级数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianResponseDurationMs": {
            "definition": "本次输入序列所需时长的中位数，不是记忆能力等级。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialCount": {
            "definition": "本次实际记录的尝试数量，须结合层级与中断情况。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "interruptedCount": {
            "definition": "按本次冻结任务定义记录“中断试次数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "totalCorrectTrials": {
            "definition": "正确试次数：本次正式测验中完整答对的试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "perseverativeTrialCount": {
            "definition": "按本次冻结任务定义记录“持续重复作答试次数”。",
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
