import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

const legacySemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "embeddedfigures/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "embeddedfigures-gen-v1.0.0",
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
  }
]

export const executionSemantics:CognitiveExecutionSemanticsV1[]=[...legacySemantics,{
 ...legacySemantics[0],protocol:{...legacySemantics[0].protocol,key:'embeddedfigures/1.1.0/1.1.0',version:'1.1.0',randomizationAlgorithmVersion:'embeddedfigures-gen-v1.1.0'},legacyStatus:'PUBLISHED',
}]
