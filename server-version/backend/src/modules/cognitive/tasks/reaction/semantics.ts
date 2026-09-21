import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "reaction/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "reaction-foreperiod-v1.0.0",
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
      "highMissRate": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "medianRtMs": "processing_speed",
      "rtICV": "processing_speed",
      "missRate": "processing_speed",
      "meanRtMs": "processing_speed",
      "sdRtMs": "processing_speed",
      "fastestRtMs": "processing_speed",
      "prematureCount": "processing_speed",
      "validTrialCount": "processing_speed",
      "missCount": "processing_speed",
      "totalTrials": "processing_speed"
    },
    "legacyStatus": "RETIRED"
  },
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "reaction/1.0.0/1.1.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "reaction-foreperiod-v1.0.0",
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
      "highMissRate": "limited",
      "interrupted": "limited",
      "excessivePremature": "limited",
      "extremeRtPattern": "limited"
    },
    "metricCategories": {
      "medianRtMs": "processing_speed",
      "rtICV": "sustained_attention",
      "missRate": "sustained_attention",
      "meanRtMs": "processing_speed",
      "sdRtMs": "processing_speed",
      "fastestRtMs": "processing_speed",
      "prematureCount": "processing_speed",
      "validTrialCount": "processing_speed",
      "missCount": "processing_speed",
      "totalTrials": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
