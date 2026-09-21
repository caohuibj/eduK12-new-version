import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "lexicaldecision/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "lexicaldecision-sequence-v1.0.0",
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
      "insufficientRealWords": "limited",
      "insufficientPseudoWords": "limited",
      "lowAccuracy": "limited",
      "excessiveOmissions": "limited",
      "constantResponse": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "dPrime": "language_decision",
      "lexicalityEffectMs": "language_decision",
      "accuracyReal": "language_decision",
      "accuracyPseudo": "language_decision",
      "medianRtReal": "language_decision",
      "medianRtPseudo": "language_decision",
      "accuracyByFrequencyBand": "language_decision",
      "omissionRate": "language_decision",
      "validResponseCount": "language_decision"
    },
    "legacyStatus": "PUBLISHED"
  }
]
