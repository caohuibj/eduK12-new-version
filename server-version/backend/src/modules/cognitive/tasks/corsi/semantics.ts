import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "corsi/1.0.0/1.0.0",
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
      "insufficientCompletedLevels": "limited",
      "invalidBlockSequence": "invalid",
      "interrupted": "limited"
    },
    "metricCategories": {
      "maxSpan": "working_memory",
      "totalCorrectTrials": "working_memory",
      "firstTryPassCount": "visuospatial_memory",
      "medianResponseDurationMs": "visuospatial_memory",
      "sequenceErrorDistance": "working_memory",
      "trialCount": "visuospatial_memory"
    },
    "legacyStatus": "PUBLISHED"
  }
]
