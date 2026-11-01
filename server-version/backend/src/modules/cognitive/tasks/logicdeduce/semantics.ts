import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "logicdeduce/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "logicdeduce-sequence-v1.0.0",
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
      "accuracy": "verbal_reasoning",
      "medianRtMs": "processing_speed",
      "errorCount": "verbal_reasoning",
      "timeoutCount": "processing_speed",
      "validRtCount": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]

executionSemantics.push({...executionSemantics[0],protocol:{...executionSemantics[0].protocol,key:'logicdeduce/2.0.0/2.0.0',version:'2.0.0',randomizationAlgorithmVersion:'logicdeduce-sequence-v2.0.0'},legacyStatus:'DRAFT'})
