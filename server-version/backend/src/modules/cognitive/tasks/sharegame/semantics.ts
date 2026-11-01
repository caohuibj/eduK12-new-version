import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "sharegame/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "sharegame-frozen-endowments-v1.0.0",
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
      "interrupted": "limited"
    },
    "metricCategories": {
      "givingRate": "social_decision",
      "equalSplitCount": "social_decision",
      "generousRate": "social_decision",
      "givingRateSd": "social_decision",
      "medianDecisionMs": "processing_speed"
    },
    "legacyStatus": "PUBLISHED"
  }
]

executionSemantics.push({...executionSemantics[0],protocol:{...executionSemantics[0].protocol,key:'sharegame/2.0.0/2.0.0',version:'2.0.0'},qualityEffects:{...executionSemantics[0].qualityEffects,incomplete:'limited'},metricCategories:{...executionSemantics[0].metricCategories,answeredRounds:'social_decision',timeoutRounds:'social_decision',omittedRounds:'social_decision',zeroChoiceCount:'social_decision',plannedRounds:'social_decision',responseRate:'social_decision',answeredEndowment:'social_decision'}})
