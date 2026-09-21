import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "emotionrecognition/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "emotionrecognition-sequence-v1.0.0",
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
      "insufficientPerCategory": "limited",
      "lowAccuracy": "limited",
      "excessiveOmissions": "limited",
      "constantResponse": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "accuracy": "emotion_classification",
      "balancedAccuracy": "emotion_classification",
      "accuracyByEmotion": "emotion_classification",
      "confusionMatrix": "emotion_classification",
      "medianRtMs": "emotion_classification",
      "omissionRate": "emotion_classification",
      "validResponseCount": "emotion_classification"
    },
    "legacyStatus": "PUBLISHED"
  }
]
