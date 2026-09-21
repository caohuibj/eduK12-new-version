import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "sst/1.0.0/1.0.0",
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
      "insufficientStopTrials": "limited",
      "pRespondStopOutOfRange": "limited",
      "highGoOmission": "limited",
      "strategicSlowingSuspected": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "ssrtMs": "response_inhibition",
      "pRespondStop": "response_inhibition",
      "goMedianRtMs": "response_inhibition",
      "goOmissionRate": "response_inhibition",
      "goChoiceErrorRate": "response_inhibition",
      "meanSsdMs": "response_inhibition",
      "unsuccessfulStopRtMs": "response_inhibition"
    },
    "legacyStatus": "PUBLISHED"
  }
]
