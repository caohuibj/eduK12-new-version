import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "digitbackward",
    "configVersion": "1.0.0",
    "name": "Digit Span Backward Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "startSpan": 2,
      "maxSpan": 7,
      "trialsPerLevel": 2,
      "digitDisplayMs": 800,
      "digitIntervalMs": 200,
      "readyDurationMs": 800,
      "inactivityGuardMs": 30000,
      "stimulusSetVersion": "digits-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "digitbackward",
    "configVersion": "1.0.0-report3",
    "name": "倒着复述一串数字 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "startSpan": 2,
      "maxSpan": 7,
      "trialsPerLevel": 2,
      "digitDisplayMs": 800,
      "digitIntervalMs": 200,
      "readyDurationMs": 800,
      "inactivityGuardMs": 30000,
      "stimulusSetVersion": "digits-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
