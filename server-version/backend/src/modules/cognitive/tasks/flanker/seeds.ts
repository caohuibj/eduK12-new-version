import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "flanker",
    "configVersion": "1.0.0",
    "name": "Flanker Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 80,
      "congruentRatio": 0.5,
      "stimulusMs": 1800,
      "isiMs": 400,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "arrows-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "flanker",
    "configVersion": "1.0.0-report3",
    "name": "看中间的箭头 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 80,
      "congruentRatio": 0.5,
      "stimulusMs": 1800,
      "isiMs": 400,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "arrows-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
