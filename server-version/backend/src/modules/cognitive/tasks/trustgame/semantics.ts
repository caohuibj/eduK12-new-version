import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "trustgame/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "trustgame-frozen-offers-v1.0.0",
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
      "noResponses": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "acceptanceRate": "social_decision",
      "unfairAcceptanceRate": "social_decision",
      "rejectedUnfairCount": "social_decision",
      "fairOfferCount": "social_decision",
      "medianDecisionMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
