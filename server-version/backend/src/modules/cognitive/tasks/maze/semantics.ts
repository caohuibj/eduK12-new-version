import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "maze/1.0.1/1.0.1",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "maze-backtracker-v1.0.0",
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
      "incompleteMazes": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "pathEfficiency": "spatial_navigation",
      "completedCount": "spatial_navigation",
      "totalDeadEnds": "spatial_navigation",
      "medianCompletionTimeMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
