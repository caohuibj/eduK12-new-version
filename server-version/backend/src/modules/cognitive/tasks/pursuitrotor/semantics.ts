import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "pursuitrotor/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "pursuitrotor-circular-v1.0.0",
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
      "noTracking": "limited",
      "lowTracking": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "onTargetRate": "sensorimotor",
      "totalTimeOnTargetMs": "sensorimotor",
      "totalTrackMs": "sensorimotor"
    },
    "legacyStatus": "PUBLISHED"
  }
]
