import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "tower",
    "configVersion": "1.0.0",
    "name": "Three-Peg Tower Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "problemCount": 10,
      "maxMovesFactor": 3,
      "inactivityGuardMs": 90000,
      "stimulusSetVersion": "three-peg-tower-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "tower",
    "configVersion": "1.0.0-report3",
    "name": "塔式规划 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "problemCount": 10,
      "maxMovesFactor": 3,
      "inactivityGuardMs": 90000,
      "stimulusSetVersion": "three-peg-tower-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
