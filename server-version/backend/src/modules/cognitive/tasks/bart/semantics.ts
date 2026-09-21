import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "bart/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "bart-sequence-v1.0.0",
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
      "insufficientCompletedBalloons": "limited",
      "insufficientCashoutBalloons": "limited",
      "excessiveOmissions": "limited",
      "constantPumpPattern": "limited",
      "invalidOutcome": "invalid",
      "interrupted": "limited"
    },
    "metricCategories": {
      "adjustedPumps": "risk_taking",
      "explosionCount": "risk_taking",
      "cashoutCount": "risk_taking",
      "meanPumpsAllCompleted": "risk_taking",
      "cashoutRate": "risk_taking",
      "completedBalloonCount": "risk_taking",
      "omissionRate": "risk_taking"
    },
    "legacyStatus": "PUBLISHED"
  }
]
