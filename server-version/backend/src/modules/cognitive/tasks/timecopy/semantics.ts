import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "timecopy/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "timecopy-sequence-v1.0.0",
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
      "emptyResponses": "invalid",
      "excessiveDeviation": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "meanAbsErrorRatio": "temporal_cognition",
      "biasRatio": "temporal_cognition",
      "withinTwentyRate": "temporal_cognition",
      "medianReproductionMs": "temporal_cognition"
    },
    "legacyStatus": "PUBLISHED"
  }
]
