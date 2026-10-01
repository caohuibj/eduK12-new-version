import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "corsi",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "Corsi 视空间广度",
    "metrics": {
      "maxSpan": {
        "label": "最大空间广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "displayUnit": "个位置"
      },
      "totalCorrectTrials": {
        "label": "总正确试次",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "firstTryPassCount": {
        "label": "首次通过级数"
      },
      "medianResponseDurationMs": {
        "label": "中位复现时长"
      },
      "sequenceErrorDistance": {
        "label": "序列位置错误距离"
      },
      "trialCount": {
        "label": "正式试次数"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "Corsi 代表视空间广度，不要与数字广度合并成记忆总分。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次视空间记忆任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "路线看过一遍，能按序走回来吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，你按顺序正确复现的最长位置序列是 {maxSpan}。",
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
        "invalidBlockSequence"
      ],
      "metricGates": {},
      "nextStep": "先熟悉点选操作。空间序列长度与数字记忆长度不能直接互换。",
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
        "concept": "记住几个位置，还要记住它们出现的先后，这和记住一串数字有相似之处。这个任务观察你这次按顺序复现位置的记录。",
        "takeaway": "位置与顺序，缺一不可。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "记住刚示范的操作路线、回想物品放置的先后，都包含空间顺序信息；日常导航还依靠地标和经验，不能由本任务单独判断。",
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
          "totalCorrectTrials": {
            "label": "正确复现了多少次",
            "explanation": "本次按要求完整答对的次数。"
          },
          "trialCount": {
            "label": "本次尝试",
            "explanation": "本次实际记录的正式尝试数量。"
          }
        }
      },
      "professional": {
        "construct": "空间位置顺序广度",
        "procedure": "依据本次位置序列与复现顺序计算正确试次及最长正确序列；按实际测量长度解释。",
        "interpretation": "结合尝试覆盖和质量事件阅读位置广度；不外推为一般空间能力或导航技能。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "maxSpan": {
            "definition": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
            "readingHint": "受起始长度、升级、停止和配置上限限制；不是一般能力上限。"
          },
          "totalCorrectTrials": {
            "definition": "正确试次数：本次正式测验中完整答对的试次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "firstTryPassCount": {
            "definition": "按本次冻结任务定义记录“首次通过级数”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianResponseDurationMs": {
            "definition": "按本次冻结任务定义记录“中位复现时长”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "sequenceErrorDistance": {
            "definition": "按本次冻结任务定义记录“序列位置错误距离”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "trialCount": {
            "definition": "按本次冻结任务定义记录“正式试次数”。",
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
