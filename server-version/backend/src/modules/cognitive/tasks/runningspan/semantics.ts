import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "runningspan/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "runningspan-sequence-v1.0.0",
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
      "emptyRecall": "limited",
      "excessiveIntrusions": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "runningSpanAccuracy": "working_memory_updating",
      "totalCorrectPositions": "working_memory_updating",
      "intrusionRate": "working_memory_updating",
      "medianResponseMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
