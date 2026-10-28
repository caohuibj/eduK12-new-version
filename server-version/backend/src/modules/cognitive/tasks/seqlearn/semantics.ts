import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "seqlearn/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "seqlearn-fixed-sequence-v1.0.0",
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
      "insufficientRandomRt": "limited",
      "insufficientPatternRt": "limited",
      "lowAccuracy": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "srtPatternAdvantageMs": "implicit_learning",
      "accuracy": "implicit_learning",
      "randomBlockAccuracy": "implicit_learning",
      "medianRtLatePatternMs": "processing_speed",
      "medianRtRandomMs": "processing_speed",
      "medianRtEarlyPatternMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]
