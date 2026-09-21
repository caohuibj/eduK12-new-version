import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "reversallearning/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "reversallearning-sequence-v1.0.0",
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
      "insufficientAcquisitionTrials": "limited",
      "insufficientReversalTrials": "limited",
      "lowAccuracy": "limited",
      "excessiveOmissions": "limited",
      "constantChoice": "limited",
      "noAcquisitionCriterion": "limited",
      "noReversalCriterion": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "acquisitionAccuracy": "decision_learning",
      "reversalAccuracy": "decision_learning",
      "reversalCost": "decision_learning",
      "perseverativeErrorCount": "decision_learning",
      "trialsToAcquisitionCriterion": "decision_learning",
      "trialsToReversalCriterion": "decision_learning",
      "feedbackWinRate": "decision_learning",
      "omissionRate": "decision_learning",
      "medianRtMs": "decision_learning",
      "validResponseCount": "decision_learning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
