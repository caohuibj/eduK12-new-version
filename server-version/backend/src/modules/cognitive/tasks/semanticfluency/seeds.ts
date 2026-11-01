import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "semanticfluency",
    "configVersion": "1.0.1",
    "name": "Category Fluency v1.0.1 (animals + fruits, 45s each)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 4,
      "durationMs": 45000,
      "stimulusSetVersion": "semanticfluency-zh-v1.0.1",
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "semanticfluency",
    "configVersion": "1.0.1-report3",
    "name": "分类找词 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 4,
      "durationMs": 45000,
      "stimulusSetVersion": "semanticfluency-zh-v1.0.1",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
