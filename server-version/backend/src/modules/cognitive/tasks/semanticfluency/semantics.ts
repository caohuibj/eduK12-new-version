import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "semanticfluency/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "semanticfluency-sequence-v1.0.0",
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
      "insufficientResponses": "limited",
      "excessiveIntrusions": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "uniqueValidPerTrial": "verbal_fluency",
      "intrusionRate": "verbal_fluency",
      "duplicateRate": "verbal_fluency",
      "uniqueValidCount": "verbal_fluency",
      "emptyTrialCount": "verbal_fluency"
    },
    "legacyStatus": "PUBLISHED"
  }
]
