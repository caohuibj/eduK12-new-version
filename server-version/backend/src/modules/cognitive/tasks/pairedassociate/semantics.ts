import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "pairedassociate/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "seq-v1.0.0",
      "trialEnvelopeVersion": 1,
      "phases": [
        {
          "key": "learning",
          "persists": true,
          "required": true
        },
        {
          "key": "delayed",
          "persists": true,
          "required": false
        }
      ],
      "measurementCriticalConfigPaths": [
        "*"
      ]
    },
    "qualityEffects": {
      "interpretable": "none",
      "excessiveOmissions": "limited",
      "constantPositionResponse": "limited",
      "delayedStageIncomplete": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "correctByTrial": "paired_learning",
      "learningSlope": "episodic_learning_memory",
      "trialsToCriterion": "episodic_learning_memory",
      "immediateAccuracy": "paired_learning",
      "delayedAccuracy": "episodic_learning_memory"
    },
    "legacyStatus": "PUBLISHED"
  }
]
