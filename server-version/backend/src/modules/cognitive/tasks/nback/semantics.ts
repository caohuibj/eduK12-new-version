import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "nback/1.0.0/1.0.0",
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
      "insufficientTargetsByN": "limited",
      "ceilingOrFloorByN": "limited",
      "excessiveOmissions": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "dPrimeByN": "working_memory",
      "maxReliableN": "working_memory",
      "hitRateByN": "working_memory_updating",
      "falseAlarmRateByN": "working_memory_updating",
      "medianRtByN": "working_memory_updating",
      "loadCostDPrime": "working_memory"
    },
    "legacyStatus": "PUBLISHED"
  }
]
