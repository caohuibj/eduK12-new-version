import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "patterncompare",
    "configVersion": "1.0.0",
    "name": "Pattern Comparison Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "durationSec": 60,
      "trialTimeoutMs": 2500,
      "isiMs": 250,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "geometric-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "patterncompare",
    "configVersion": "1.0.0-report3",
    "name": "图形找不同 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "durationSec": 60,
      "trialTimeoutMs": 2500,
      "isiMs": 250,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "geometric-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
