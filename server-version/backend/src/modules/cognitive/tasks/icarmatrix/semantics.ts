import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "icarmatrix/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "icarmatrix-gen-v1.0.0",
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
      "insufficientValidRt": "limited",
      "lowAccuracy": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "accuracy": "fluid_reasoning",
      "medianRtMs": "processing_speed",
      "errorCount": "fluid_reasoning",
      "timeoutCount": "processing_speed",
      "validRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  },
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "icarmatrix/2.0.0/1.0.0",
      "version": "2.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "matgen-bank-v1.0.0",
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
      "excessiveTimeouts": "limited",
      "rapidGuessing": "limited"
    },
    "metricCategories": {
      "accuracy": "fluid_reasoning",
      "medianRtMs": "processing_speed",
      "correctCount": "fluid_reasoning",
      "accuracyByRuleTag": "fluid_reasoning"
    },
    "legacyStatus": "PUBLISHED"
  },
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "icarmatrix/2.1.0/1.1.0",
      "version": "2.1.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "matgen-reviewed-v1.0.0",
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
      "excessiveTimeouts": "limited",
      "rapidGuessing": "limited"
    },
    "metricCategories": {
      "accuracy": "fluid_reasoning",
      "medianRtMs": "processing_speed",
      "correctCount": "fluid_reasoning",
      "answeredCount": "fluid_reasoning", "timeoutCount": "fluid_reasoning", "validRtCount": "fluid_reasoning",
      "accuracyByRuleTag": "fluid_reasoning"
    },
    "legacyStatus": "DRAFT"
  }
]
