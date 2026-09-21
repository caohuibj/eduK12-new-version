import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "flanker/1.0.0/1.0.0",
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
      "insufficientCongruentTrials": "limited",
      "insufficientIncongruentTrials": "limited",
      "lowAccuracy": "limited",
      "excessiveOmissions": "limited",
      "constantResponse": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "flankerEffectMs": "interference_control",
      "incongruentAccuracy": "interference_control",
      "congruentAccuracy": "interference_control",
      "errorCost": "interference_control",
      "accuracy": "interference_control",
      "medianRtCongruent": "interference_control",
      "medianRtIncongruent": "interference_control",
      "omissionRate": "interference_control"
    },
    "legacyStatus": "PUBLISHED"
  }
]
