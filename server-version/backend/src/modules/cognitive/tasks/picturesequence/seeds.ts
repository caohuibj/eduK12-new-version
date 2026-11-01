import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "picturesequence",
    "configVersion": "1.0.0",
    "name": "Picture Sequence Learning Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 0,
      "studyMsPerItem": 900,
      "inactivityGuardMs": 60000,
      "stimulusSetVersion": "daily-scenes-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "picturesequence",
    "configVersion": "1.0.0-report3",
    "name": "把一组图片重新排成顺序 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 0,
      "studyMsPerItem": 900,
      "inactivityGuardMs": 60000,
      "stimulusSetVersion": "daily-scenes-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
