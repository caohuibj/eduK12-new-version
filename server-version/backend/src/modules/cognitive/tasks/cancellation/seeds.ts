import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "cancellation",
    "configVersion": "1.0.1",
    "name": "Visual Cancellation v1.0.1 (2 scans × 45s, 10×8 grid)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 2,
      "durationMs": 45000,
      "stimulusSetVersion": "cancellation-zh-v1.0.1",
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "cancellation",
    "configVersion": "1.0.1-report3",
    "name": "一屏符号找目标 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 2,
      "durationMs": 45000,
      "stimulusSetVersion": "cancellation-zh-v1.0.1",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
