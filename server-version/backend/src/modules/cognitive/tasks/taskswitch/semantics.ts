import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "taskswitch/1.0.0/1.0.0",
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
      "interrupted": "limited"
    },
    "metricCategories": {
      "switchCostRtMs": "cognitive_flexibility",
      "switchCostAccuracy": "cognitive_flexibility",
      "medianRtSwitch": "cognitive_flexibility",
      "medianRtRepeat": "cognitive_flexibility",
      "accuracySwitch": "cognitive_flexibility",
      "accuracyRepeat": "cognitive_flexibility",
      "mixingCost": "cognitive_flexibility"
    },
    "legacyStatus": "PUBLISHED"
  }
]
