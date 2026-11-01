import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "gamblingdeck/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "gamblingdeck-fixed-schedule-v1.0.0",
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
      "interrupted": "limited"
    },
    "metricCategories": {
      "advantageousChoiceRate": "decision_learning",
      "netScore": "decision_learning",
      "blockTrendSlope": "decision_learning",
      "deckChoiceRates": "decision_learning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
