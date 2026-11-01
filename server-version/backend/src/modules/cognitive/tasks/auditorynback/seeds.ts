import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "auditorynback",
    "configVersion": "1.0.1",
    "name": "Auditory Tone n-back v1.0.1 (2-back, 40 trials, 5 tones, target ratio 0.3)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "nLevel": 2,
      "totalTrials": 40,
      "targetRatio": 0.3,
      "stimulusMs": 500,
      "isiMs": 1500,
      "toneFrequenciesHz": [
        262,
        330,
        392,
        494,
        587
      ],
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "auditorynback",
    "configVersion": "1.0.1-report3",
    "name": "在声音流中跟踪前面的音 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "nLevel": 2,
      "totalTrials": 40,
      "targetRatio": 0.3,
      "stimulusMs": 500,
      "isiMs": 1500,
      "toneFrequenciesHz": [
        262,
        330,
        392,
        494,
        587
      ],
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
