import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "pairedassociate",
    "configVersion": "1.0.0",
    "name": "Paired Associate Learning Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "pairCount": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 0,
      "studyDurationMs": 12000,
      "inactivityGuardMs": 90000,
      "stimulusSetVersion": "nonverbal-pairs-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "pairedassociate",
    "configVersion": "1.0.0-report3",
    "name": "记住图形放在哪儿 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "pairCount": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 0,
      "studyDurationMs": 12000,
      "inactivityGuardMs": 90000,
      "stimulusSetVersion": "nonverbal-pairs-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
