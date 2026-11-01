import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "auditoryrt",
    "configVersion": "1.0.1",
    "name": "Auditory Simple RT v1.0.1 (24 trials, 1-4s foreperiod, 880Hz tone)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 24,
      "foreperiodMinMs": 1000,
      "foreperiodMaxMs": 4000,
      "toneFrequencyHz": 880,
      "toneDurationMs": 120,
      "maxRtWindowMs": 1500,
      "interTrialIntervalMs": 800,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "auditoryrt",
    "configVersion": "1.0.1-report3",
    "name": "提示出现后，多久作出反应 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 24,
      "foreperiodMinMs": 1000,
      "foreperiodMaxMs": 4000,
      "toneFrequencyHz": 880,
      "toneDurationMs": 120,
      "maxRtWindowMs": 1500,
      "interTrialIntervalMs": 800,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
