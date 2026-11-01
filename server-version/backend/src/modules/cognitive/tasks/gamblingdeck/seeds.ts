import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "gamblingdeck",
    "configVersion": "1.0.1",
    "name": "Gambling Deck (IGT-structured) v1.0.1 (60 trials, block 20)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 60,
      "blockSize": 20,
      "fixationMs": 400,
      "feedbackMs": 1200,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "gamblingdeck",
    "configVersion": "1.0.1-report3",
    "name": "宝箱选择记录 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 60,
      "blockSize": 20,
      "fixationMs": 400,
      "feedbackMs": 1200,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
