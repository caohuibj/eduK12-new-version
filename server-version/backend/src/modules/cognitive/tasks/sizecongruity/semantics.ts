import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "sizecongruity/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "sizecongruity-sequence-v1.0.0",
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
      "insufficientValidCongruentRt": "limited",
      "insufficientValidIncongruentRt": "limited",
      "lowAccuracy": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "sizeCongruityEffectMs": "interference_control",
      "incongruentAccuracy": "interference_control",
      "accuracy": "inhibitory_control",
      "congruentAccuracy": "inhibitory_control",
      "medianRtCongruent": "inhibitory_control",
      "medianRtIncongruent": "inhibitory_control",
      "timeoutCount": "processing_speed",
      "validCongruentRtCount": "processing_speed",
      "validIncongruentRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
