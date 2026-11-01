import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "readingcomp",
    "configVersion": "1.0.0",
    "name": "Reading Comprehension (Chinese) v1.0.0 (12 of 16 items)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 12,
      "stimulusSetVersion": "readingcomp-zh-v1.0.0",
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
    "testType": "readingcomp",
    "configVersion": "1.1.0",
    "name": "阅读理解（原创审订题库 v1.1.0）",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "readingcomp-zh-v1.1.0",
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
    "testType": "readingcomp",
    "configVersion": "1.1.0-report3",
    "name": "阅读理解 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "stimulusSetVersion": "readingcomp-zh-v1.1.0",
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
