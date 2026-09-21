import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "gonogo/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "seq-v1.0.0",
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
      "insufficientNoGoTrials": "limited",
      "excessiveOmissions": "limited",
      "extremeCommissionRate": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "commissionRate": "response_inhibition",
      "dPrime": "response_inhibition",
      "goMedianRtMs": "response_inhibition",
      "hitRate": "response_inhibition",
      "omissionRate": "response_inhibition",
      "commissionErrors": "response_inhibition",
      "goTrialCount": "response_inhibition",
      "nogoTrialCount": "response_inhibition"
    },
    "legacyStatus": "PUBLISHED"
  }
]
