import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "bart",
    "configVersion": "1.0.0",
    "name": "Balloon Pumping Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "balloonCount": 30,
      "maxPumps": 12,
      "trialTimeoutMs": 15000,
      "pumpAnimationMs": 200,
      "stimulusSetVersion": "bart-generated-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "bart",
    "configVersion": "1.1.0",
    "name": "Balloon Pumping v1.1.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "config": {
      "balloonCount": 30,
      "maxPumps": 12,
      "trialTimeoutMs": 15000,
      "pumpAnimationMs": 200,
      "stimulusSetVersion": "bart-generated-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "bart",
    "configVersion": "1.1.0-report3",
    "name": "气球：继续还是收取 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "config": {
      "balloonCount": 30,
      "maxPumps": 12,
      "trialTimeoutMs": 15000,
      "pumpAnimationMs": 200,
      "stimulusSetVersion": "bart-generated-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
