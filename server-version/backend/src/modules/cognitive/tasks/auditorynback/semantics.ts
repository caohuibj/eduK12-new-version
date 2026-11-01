import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "auditorynback/1.0.1/1.0.0",
      "version": "1.0.1",
      "clock": "performance",
      "randomizationAlgorithmVersion": "auditorynback-seq-v1.0.0",
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
      "insufficientTargets": "limited",
      "excessiveOmissions": "limited",
      "floorPerformance": "limited",
      "ceilingPerformance": "none",
      "stimulusEchoMismatch": "limited",
      "audioEnvironmentUnverified": "none",
      "interrupted": "limited"
    },
    "metricCategories": {
      "dPrime": "auditory_working_memory",
      "hitRate": "auditory_working_memory",
      "falseAlarmRate": "auditory_working_memory",
      "medianHitRtMs": "auditory_working_memory",
      "matchCount": "auditory_working_memory",
      "nonmatchCount": "auditory_working_memory"
    },
    "legacyStatus": "PUBLISHED"
  }
]
