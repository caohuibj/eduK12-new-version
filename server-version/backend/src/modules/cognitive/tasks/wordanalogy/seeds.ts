import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "wordanalogy",
    "configVersion": "1.0.0",
    "name": "Verbal Analogies (Chinese) v1.0.0 (30 of 36 items)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "wordanalogy-zh-v1.0.0",
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
    "testType": "wordanalogy",
    "configVersion": "1.1.0",
    "name": "Wordanalogy Chinese reviewed pilot v1.1.0 (30 of 36 items)",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "wordanalogy-zh-v1.1.0",
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
    "testType": "wordanalogy",
    "configVersion": "1.1.0-report3",
    "name": "言语类比推理 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "wordanalogy-zh-v1.1.0",
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
