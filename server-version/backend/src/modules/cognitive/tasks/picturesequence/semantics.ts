import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "picturesequence/1.0.0/1.0.0",
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
      "emptyResponse": "limited",
      "incompleteResponse": "limited",
      "unchangedIncorrectOrder": "limited",
      "delayedStageIncomplete": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "adjacentPairScore": "episodic_learning_memory",
      "positionScore": "episodic_sequence_learning",
      "learningGain": "episodic_learning_memory",
      "delayedRetention": "episodic_learning_memory",
      "adjacentPairScoreByRound": "episodic_sequence_learning",
      "positionScoreByRound": "episodic_sequence_learning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
