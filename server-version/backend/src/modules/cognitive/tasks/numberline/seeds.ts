import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "numberline",
    "configVersion": "1.0.1",
    "name": "Number Line Estimation 0-100 v1.0.1",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 20,
      "lineMax": 100,
      "maxResponseMs": 10000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "numberline",
    "configVersion": "1.0.1-report3",
    "name": "数字在线上哪里 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 20,
      "lineMax": 100,
      "maxResponseMs": 10000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
