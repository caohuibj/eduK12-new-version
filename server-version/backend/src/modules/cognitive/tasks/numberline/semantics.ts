import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "numberline/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "numberline-sequence-v1.0.0",
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
      "insufficientValidTrials": "limited",
      "excessiveTimeouts": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "paePercent": "numerical_cognition",
      "biasPercent": "numerical_cognition",
      "withinTenRate": "numerical_cognition",
      "medianRtMs": "processing_speed",
      "validTrialCount": "numerical_cognition",
      "timeoutCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
