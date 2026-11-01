import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "proofread",
    "configVersion": "1.0.0",
    "name": "Proofreading (Chinese) v1.0.0 (18 of 24 items)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 18,
      "stimulusSetVersion": "proofread-zh-v1.0.0",
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
    "testType": "proofread",
    "configVersion": "1.1.0",
    "name": "文本校对（原创审订题库 v1.1.0）",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "proofread-zh-v1.1.0",
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
    "testType": "proofread",
    "configVersion": "1.1.0-report3",
    "name": "文本校对 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "proofread-zh-v1.1.0",
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
