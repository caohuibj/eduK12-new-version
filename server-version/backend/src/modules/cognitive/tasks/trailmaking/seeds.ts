import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "trailmaking",
    "configVersion": "1.0.0",
    "name": "Trail Making Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "form": "AB",
      "partAItemCount": 12,
      "partBItemCount": 12,
      "stepTimeoutMs": 15000,
      "stimulusSetVersion": "trailmaking-generated-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "trailmaking",
    "configVersion": "1.0.0-report3",
    "name": "按顺序找目标 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "form": "AB",
      "partAItemCount": 12,
      "partBItemCount": 12,
      "stepTimeoutMs": 15000,
      "stimulusSetVersion": "trailmaking-generated-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
