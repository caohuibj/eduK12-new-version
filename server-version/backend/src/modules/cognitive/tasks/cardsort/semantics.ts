import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "cardsort/1.0.0/1.0.0",
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
      "insufficientSwitchTrials": "limited",
      "insufficientRepeatTrials": "limited",
      "lowAccuracy": "limited",
      "excessiveOmissions": "limited",
      "constantResponse": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "switchCostRtMs": "cognitive_flexibility",
      "switchCostAccuracy": "cognitive_flexibility",
      "perseverativeErrorRate": "cognitive_flexibility",
      "postSwitchRecovery": "cognitive_flexibility",
      "accuracySwitch": "cognitive_flexibility",
      "accuracyRepeat": "cognitive_flexibility",
      "medianRtSwitch": "cognitive_flexibility",
      "medianRtRepeat": "cognitive_flexibility",
      "overallAccuracy": "cognitive_flexibility",
      "omissionRate": "cognitive_flexibility",
      "perseverativeErrorCount": "cognitive_flexibility"
    },
    "legacyStatus": "PUBLISHED"
  }
]
