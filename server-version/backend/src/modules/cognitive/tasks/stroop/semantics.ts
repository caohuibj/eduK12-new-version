import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "stroop/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "stroop-sequence-v1.0.0",
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
      "insufficientValidCongruentRt": "limited",
      "insufficientValidIncongruentRt": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "stroopEffectMs": "inhibitory_control",
      "errorCost": "inhibitory_control",
      "incongruentAccuracy": "inhibitory_control",
      "accuracy": "inhibitory_control",
      "congruentAccuracy": "inhibitory_control",
      "medianRtCongruent": "inhibitory_control",
      "medianRtIncongruent": "inhibitory_control",
      "timeoutCount": "inhibitory_control",
      "validCongruentRtCount": "inhibitory_control",
      "validIncongruentRtCount": "inhibitory_control"
    },
    "legacyStatus": "RETIRED"
  },
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "stroop/1.0.0/1.1.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "stroop-sequence-v1.0.0",
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
      "insufficientValidCongruentRt": "limited",
      "insufficientValidIncongruentRt": "limited",
      "interrupted": "limited",
      "lowAccuracy": "limited"
    },
    "metricCategories": {
      "stroopEffectMs": "interference_control",
      "errorCost": "interference_control",
      "incongruentAccuracy": "interference_control",
      "accuracy": "inhibitory_control",
      "congruentAccuracy": "inhibitory_control",
      "medianRtCongruent": "inhibitory_control",
      "medianRtIncongruent": "inhibitory_control",
      "timeoutCount": "inhibitory_control",
      "validCongruentRtCount": "inhibitory_control",
      "validIncongruentRtCount": "inhibitory_control"
    },
    "legacyStatus": "PUBLISHED"
  }
]
