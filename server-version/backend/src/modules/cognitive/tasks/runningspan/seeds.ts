import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "runningspan",
    "configVersion": "1.0.1",
    "name": "Running Span v1.0.1 (lists 7-11, recall 3)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 12,
      "listLengthMin": 7,
      "listLengthMax": 11,
      "recallLength": 3,
      "stimulusMs": 500,
      "isiMs": 250,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "runningspan",
    "configVersion": "1.0.1-report3",
    "name": "跟住不断变化的最后几项 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 12,
      "listLengthMin": 7,
      "listLengthMax": 11,
      "recallLength": 3,
      "stimulusMs": 500,
      "isiMs": 250,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
