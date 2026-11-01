import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "maze",
    "configVersion": "1.0.1",
    "name": "Maze Navigation v1.0.1 (4 mazes, 7×7, 120s limit)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.1",
    "config": {
      "totalTrials": 4,
      "mazeCols": 7,
      "mazeRows": 7,
      "timeLimitMs": 120000,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "maze",
    "configVersion": "1.1.0",
    "name": "Maze Navigation 1.1.0 — independent 3×3 practice",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.1",
    "config": {
      "totalTrials": 4,
      "mazeCols": 7,
      "mazeRows": 7,
      "timeLimitMs": 120000,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "maze",
    "configVersion": "1.1.0-report3",
    "name": "看图走迷宫 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.1",
    "config": {
      "totalTrials": 4,
      "mazeCols": 7,
      "mazeRows": 7,
      "timeLimitMs": 120000,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "maze",
    "configVersion": "1.0.1-report3",
    "name": "看图走迷宫 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.1",
    "config": {
      "totalTrials": 4,
      "mazeCols": 7,
      "mazeRows": 7,
      "timeLimitMs": 120000,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
