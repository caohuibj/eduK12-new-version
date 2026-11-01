import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "cogest",
    "configVersion": "1.0.0",
    "name": "Logical Deduction (Chinese) v1.0.0 (18 of 24 items)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "cogest-zh-v1.0.0",
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
    "testType": "cogest",
    "configVersion": "1.1.0",
    "name": "Cogest 1.1.0 · 项目自编数量级估算（试测草稿）",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "cogest-zh-v1.1.0",
      "fixationMs": 400,
      "timeoutMs": 15000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "cogest",
    "configVersion": "1.1.0-report3",
    "name": "认知估算 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "cogest-zh-v1.1.0",
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
