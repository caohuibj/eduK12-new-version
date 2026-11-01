import type { CognitiveSeed } from '../../task-seed.types'
import { CANCELLATION_STIMULUS_SET_VERSION } from './generator'

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
      "stimulusSetVersion": CANCELLATION_STIMULUS_SET_VERSION,
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
      "stimulusSetVersion": CANCELLATION_STIMULUS_SET_VERSION,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
