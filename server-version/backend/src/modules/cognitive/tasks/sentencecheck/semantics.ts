import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "sentencecheck/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "sentencecheck-sequence-v1.0.0",
      "trialEnvelopeVersion": 1,
      "phases": [
        {
          "key": "test",
          "persists": true,
          "required": true
        }
      ],
      "measurementCriticalConfigPaths": [
        "*"
      ]
    },
    "qualityEffects": {
      "interpretable": "none",
      "insufficientValidRt": "limited",
      "lowAccuracy": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "accuracy": "verbal_reasoning",
      "medianRtMs": "processing_speed",
      "negationPenaltyMs": "verbal_reasoning",
      "errorCount": "verbal_reasoning",
      "timeoutCount": "processing_speed",
      "validRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]

executionSemantics.push({
  ...executionSemantics[0],
  protocol: {
    ...executionSemantics[0].protocol,
    key: 'sentencecheck/1.1.0/1.1.0',
    version: '1.1.0',
    randomizationAlgorithmVersion: 'sentencecheck-crossed-v1.1.0',
  },
  legacyStatus: 'DRAFT',
})
