import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "logicdeduce",
    "configVersion": "1.0.0",
    "name": "Logical Deduction (Chinese) v1.0.0 (18 of 24 items)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "logicdeduce-zh-v1.0.0",
      "fixationMs": 400,
      "timeoutMs": 15000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "simulated",
        "referenceVersion": "sim-k12-v0.1",
        "referenceBand": "K7-9"
      }
    }
  },
  {
    "testType": "logicdeduce",
    "configVersion": "2.0.0",
    "name": "logicdeduce audited pilot v2 (18/30/36 of 36)",
    "status": "DRAFT",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "logicdeduce-zh-v2.0.0",
      "fixationMs": 400,
      "timeoutMs": 15000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "2.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "logicdeduce",
    "configVersion": "2.0.0-report3",
    "name": "多条件逻辑推断 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "logicdeduce-zh-v2.0.0",
      "fixationMs": 400,
      "timeoutMs": 15000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
