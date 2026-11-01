import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "cardsort",
    "configVersion": "1.0.0",
    "name": "Rule Card Sort Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 72,
      "switchRatio": 0.33,
      "blockCount": 3,
      "cueMs": 500,
      "stimulusMs": 2000,
      "isiMs": 350,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "geometric-cards-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "cardsort",
    "configVersion": "1.0.0-report3",
    "name": "跟着提示分卡片 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 72,
      "switchRatio": 0.33,
      "blockCount": 3,
      "cueMs": 500,
      "stimulusMs": 2000,
      "isiMs": 350,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "geometric-cards-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
