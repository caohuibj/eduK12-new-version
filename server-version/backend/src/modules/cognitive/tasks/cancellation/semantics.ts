import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "cancellation/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "cancellation-grid-v1.0.0",
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
      "excessiveFalseAlarms": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "hitRate": "sustained_attention",
      "falseAlarmRate": "sustained_attention",
      "hitCount": "sustained_attention",
      "missCount": "sustained_attention",
      "falseAlarmCount": "sustained_attention"
    },
    "legacyStatus": "PUBLISHED"
  }
]
