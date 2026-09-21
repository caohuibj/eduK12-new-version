import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "patterncompare/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "seq-v1.0.0",
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
      "insufficientCompletedTrials": "limited",
      "lowAccuracy": "limited",
      "excessiveLapses": "limited",
      "constantResponse": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "correctPerMinute": "processing_speed",
      "accuracy": "processing_speed",
      "medianCorrectRtMs": "processing_speed",
      "lapseRate": "processing_speed",
      "correctCount": "processing_speed",
      "completedTrialCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
