import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "cpt/1.0.0/1.0.0",
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
      "insufficientTargets": "limited",
      "highOmissionRate": "limited",
      "highPerseverationRate": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "dPrime": "sustained_attention",
      "omissionRate": "sustained_attention",
      "commissionRate": "response_inhibition",
      "rtICV": "sustained_attention",
      "hitMedianRtMs": "processing_speed",
      "hitRtSdMs": "sustained_attention",
      "blockSlopeRt": "sustained_attention",
      "blockSlopeOmission": "sustained_attention",
      "perseverationRate": "sustained_attention",
      "targetCount": "sustained_attention",
      "hitCount": "sustained_attention"
    },
    "legacyStatus": "PUBLISHED"
  }
]
