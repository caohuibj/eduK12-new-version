import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "icarmatrix/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "icarmatrix-gen-v1.0.0",
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
      "accuracy": "fluid_reasoning",
      "medianRtMs": "processing_speed",
      "errorCount": "fluid_reasoning",
      "timeoutCount": "processing_speed",
      "validRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
