import type { CognitiveSeed } from '../../task-seed.types'

// Materialized declaration: existing exported values are preserved.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "sharegame",
    "configVersion": "1.0.0",
    "name": "Dictator-style Sharing v1.0.0 (5 rounds, endowments 20-100)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "endowments": [
        20,
        50,
        100,
        50,
        100
      ],
      "fixationMs": 400,
      "timeoutMs": 20000,
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "simulated",
        "referenceVersion": "sim-k12-v0.1",
        "referenceBand": "K7-9"
      }
    }
  },
  {
    "testType": "sharegame",
    "configVersion": "2.0.0",
    "name": "分享决策：未答与零选择分离",
    "status": "DRAFT",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "config": {
      "endowments": [
        20,
        50,
        100,
        50,
        100
      ],
      "fixationMs": 400,
      "timeoutMs": 20000,
      "report": {
        "reportVersion": "2.0.0",
        "referenceMode": "none"
      }
    }
  }
]
