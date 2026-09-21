import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "mentalrotation/1.0.0/1.0.0",
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
      "constantResponse": "limited",
      "insufficientAngleCoverage": "limited",
      "excessiveOmissions": "limited",
      "lowAccuracy": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "accuracy": "visuospatial_reasoning",
      "angleCost": "visuospatial_reasoning",
      "medianCorrectRtMs": "visuospatial_reasoning",
      "mirrorErrorRate": "visuospatial_reasoning",
      "omissionRate": "visuospatial_reasoning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
