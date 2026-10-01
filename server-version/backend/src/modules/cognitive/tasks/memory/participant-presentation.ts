import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
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
      "version": "1.0.0",
      "title": "记住顺序，看看这一次",
      "introduction": "观察这次按原顺序复现数字的记录。",
      "summary": {
        "template": "本次正确完成的最长数字序列为 {maxSpan}。这描述本次任务，不是一般记忆能力等级。",
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
        "maxSpan": "本次最长正确序列长度"
      },
      "illustration": "sequence"
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
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
      "version": "1.0.0",
      "title": "记住顺序，看看这一次",
      "introduction": "观察这次按原顺序复现数字的记录。",
      "summary": {
        "template": "本次正确完成的最长数字序列为 {maxSpan}。这描述本次任务，不是一般记忆能力等级。",
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
        "maxSpan": "本次最长正确序列长度"
      },
      "illustration": "sequence"
    }
  }
]
