import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "mentalrotation",
    "configVersion": "1.0.0",
    "name": "Mental Rotation Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 40,
      "stimulusMs": 5000,
      "isiMs": 400,
      "validRtFloorMs": 200,
      "stimulusSetVersion": "rotation-objects-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "mentalrotation",
    "configVersion": "1.0.0-report3",
    "name": "心理旋转 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 40,
      "stimulusMs": 5000,
      "isiMs": 400,
      "validRtFloorMs": 200,
      "stimulusSetVersion": "rotation-objects-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
