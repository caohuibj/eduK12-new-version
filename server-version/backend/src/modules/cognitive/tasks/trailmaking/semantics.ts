import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "trailmaking/1.0.0/1.0.0",
      "version": "1.0.0",
      "clock": "performance",
      "randomizationAlgorithmVersion": "trailmaking-sequence-v1.0.0",
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
      "insufficientCompletedSteps": "limited",
      "excessiveErrors": "limited",
      "timeLimitReached": "limited",
      "deviceInfoIncomplete": "none",
      "mixedPointerType": "none",
      "interrupted": "limited"
    },
    "metricCategories": {
      "completionTimeMs": "visual_search_set_shifting",
      "errorCount": "visual_search_set_shifting",
      "setShiftCostMs": "visual_search_set_shifting",
      "partACompletionTimeMs": "visual_search_set_shifting",
      "partBCompletionTimeMs": "visual_search_set_shifting",
      "meanCorrectStepTimeMs": "visual_search_set_shifting",
      "completedStepCount": "visual_search_set_shifting",
      "errorRate": "visual_search_set_shifting",
      "omissionRate": "visual_search_set_shifting"
    },
    "legacyStatus": "PUBLISHED"
  }
]
