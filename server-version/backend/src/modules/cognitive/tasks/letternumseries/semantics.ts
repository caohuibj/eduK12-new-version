import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "letternumseries/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "letternumseries-sequence-v1.0.0",
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
      "emptyRecallExcess": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "overallAccuracy": "working_memory_updating",
      "lettersAccuracy": "working_memory_updating",
      "digitsAccuracy": "working_memory_updating",
      "emptyRecallCount": "working_memory_updating",
      "medianResponseMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
