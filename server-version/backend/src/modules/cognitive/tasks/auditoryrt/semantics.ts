import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "auditoryrt/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "auditoryrt-foreperiod-v1.0.0",
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
      "insufficientValidTrials": "limited",
      "excessiveAnticipations": "limited",
      "highVariability": "limited",
      "audioEnvironmentUnverified": "none",
      "interrupted": "limited"
    },
    "metricCategories": {
      "medianRtMs": "auditory_processing",
      "meanRtMs": "auditory_processing",
      "rtSdMs": "auditory_processing",
      "rtCv": "auditory_processing",
      "validCount": "auditory_processing",
      "anticipationCount": "auditory_processing",
      "lapseCount": "auditory_processing"
    },
    "legacyStatus": "PUBLISHED"
  }
]
