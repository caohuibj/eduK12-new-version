import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "memory/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "memory-sequence-v1.0.0",
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
      "maxSpan": "working_memory",
      "levelsPassed": "working_memory",
      "firstTryPassCount": "working_memory",
      "medianResponseDurationMs": "working_memory",
      "trialCount": "working_memory",
      "interruptedCount": "working_memory"
    },
    "legacyStatus": "RETIRED"
  },
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "memory/1.0.0/1.1.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "memory-sequence-v1.0.0",
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
      "interrupted": "limited",
      "insufficientCompletedLevels": "limited",
      "invalidSequencePattern": "invalid"
    },
    "metricCategories": {
      "maxSpan": "working_memory",
      "levelsPassed": "working_memory",
      "firstTryPassCount": "working_memory",
      "medianResponseDurationMs": "working_memory",
      "trialCount": "working_memory",
      "interruptedCount": "working_memory",
      "totalCorrectTrials": "working_memory",
      "perseverativeTrialCount": "working_memory"
    },
    "legacyStatus": "PUBLISHED"
  }
]
