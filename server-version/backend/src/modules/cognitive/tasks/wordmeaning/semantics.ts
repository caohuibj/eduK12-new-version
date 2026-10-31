import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "wordmeaning/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "wordmeaning-sequence-v1.0.0",
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
      "errorCount": "verbal_reasoning",
      "timeoutCount": "processing_speed",
      "validRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
