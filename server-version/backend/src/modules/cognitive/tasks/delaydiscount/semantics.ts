import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "delaydiscount/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "delaydiscount-bisection-v1.0.0",
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
      "incompleteDelayBand": "invalid",
      "interrupted": "limited"
    },
    "metricCategories": {
      "aucDelayDiscounting": "decision_making",
      "meanIndifferenceRate": "decision_making",
      "laterChoiceRate": "decision_making",
      "timeoutCount": "processing_speed",
      "validTrialCount": "decision_making"
    },
    "legacyStatus": "PUBLISHED"
  }
]
