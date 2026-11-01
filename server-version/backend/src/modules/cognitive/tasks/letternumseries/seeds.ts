import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "letternumseries",
    "configVersion": "1.0.1",
    "name": "Letter-Number Sequencing v1.0.1 (4 letters + 3 digits per trial)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 10,
      "lettersPerTrial": 4,
      "digitsPerTrial": 3,
      "stimulusMs": 700,
      "isiMs": 300,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "letternumseries",
    "configVersion": "1.0.1-report3",
    "name": "把混排的字母和数字重新整理 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 10,
      "lettersPerTrial": 4,
      "digitsPerTrial": 3,
      "stimulusMs": 700,
      "isiMs": 300,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
