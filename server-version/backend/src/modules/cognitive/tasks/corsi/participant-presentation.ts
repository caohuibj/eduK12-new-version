import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
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
      "version": "1.0.0",
      "title": "记住位置，再走一遍",
      "introduction": "观察这次按顺序复现空间位置的记录。",
      "summary": {
        "template": "本次正确复现的最长空间序列为 {maxSpan}。",
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
        "maxSpan": "本次最长正确序列长度"
      },
      "illustration": "sequence"
    }
  }
]
