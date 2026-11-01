import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "ufov",
    "configVersion": "1.0.1",
    "name": "Useful Field of View v1.0.1 (16 trials, 400ms stimulus)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "stimulusMs": 400,
      "fixationMs": 500,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "ufov",
    "configVersion": "1.0.1-report3",
    "name": "同时记住中间与周边 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "stimulusMs": 400,
      "fixationMs": 500,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
