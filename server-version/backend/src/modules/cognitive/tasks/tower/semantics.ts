import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'

export const executionSemantics: CognitiveExecutionSemanticsV1[] = [
  {
    "protocol": {
      "schemaVersion": 1,
      "key": "tower/1.0.0/1.0.0",
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
      "excessiveRuleViolations": "limited",
      "insufficientAttemptedProblems": "limited",
      "interrupted": "limited"
    },
    "metricCategories": {
      "minimumMoveSolveRate": "planning",
      "excessMoves": "planning",
      "solveRate": "planning",
      "firstMoveLatencyMs": "planning",
      "ruleViolations": "planning",
      "noAttemptRate": "planning"
    },
    "legacyStatus": "PUBLISHED"
  }
]
