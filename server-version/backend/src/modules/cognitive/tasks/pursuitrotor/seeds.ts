import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "pursuitrotor",
    "configVersion": "1.0.1",
    "name": "Pursuit Rotor v1.0.1 (4 trials × 20s, 4s/rev)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 4,
      "trackMs": 20000,
      "revolutionMs": 4000,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "pursuitrotor",
    "configVersion": "1.0.1-report3",
    "name": "跟着小圆点移动 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 4,
      "trackMs": 20000,
      "revolutionMs": 4000,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
