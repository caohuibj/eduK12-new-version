import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "wordlist/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "wordlist-sequence-v1.0.0",
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
      "emptyImmediateRecall": "limited",
      "excessiveOmissions": "limited",
      "excessiveIntrusions": "limited",
      "repeatedResponsePattern": "limited",
      "delayedStageIncomplete": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "immediateAccuracy": "language_learning",
      "learningGain": "language_learning",
      "delayedRecallAccuracy": "language_learning",
      "totalImmediateCorrect": "language_learning",
      "recallByRound": "language_learning",
      "intrusionCount": "language_learning",
      "duplicateResponseCount": "language_learning",
      "omissionRate": "language_learning",
      "medianResponseDurationMs": "language_learning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
