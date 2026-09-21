import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "matrix/1.0.0/1.0.0",
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
      "constantResponse": "limited",
      "excessiveOmissions": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "accuracy": "fluid_reasoning",
      "accuracyByRuleFamily": "fluid_reasoning",
      "reachedDifficulty": "fluid_reasoning",
      "medianRtMs": "fluid_reasoning",
      "omissionRate": "fluid_reasoning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
